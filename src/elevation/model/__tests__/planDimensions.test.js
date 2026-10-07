import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planDimensions } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const dimensions = (room) => planDimensions(syncRoom(room, settings), settings);
const WALL_ROWS = ['front', 'back', 'wall'];
const wallRows = (room) => dimensions(room).filter(({ row }) => WALL_ROWS.includes(row));
const wall = (start, end, offset, text) => ({ row: 'wall', kind: 'wall', start, end, offset, text });

describe('SPEC-45 plan dimensions: each wall\'s length and the rows along its faces', () => {
  it('dimensions the window row, then the length, 3/8" (paper) apart outside each wall (G1)', () => {
    expect(wallRows(stored('G1 Euro kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-64.5, -84], end: [-64.5, -39], offset: 9, text: '45"' },
      { row: 'front', kind: 'opening', start: [-64.5, -39], end: [-64.5, 15], offset: 9, text: '54"' },
      { row: 'front', kind: 'space', start: [-64.5, 15], end: [-64.5, 84], offset: 9, text: '69"' },
      wall([-64.5, -84], [-64.5, 84], 18, '168"'),
      wall([-60, 88.5], [60, 88.5], 9, '120"'),
      wall([64.5, 57], [64.5, 84], -9, '27"'),
      // The island has no thickness: its length goes past the runs on its back face (12 7/8" deep) and
      // that face's marker (6" + 1/2" + 3/16" + 1/4" paper = 22 1/2").
      wall([9.5, -39.25], [101, -39.25], -9, '91 1/2"'),
    ]);
  });

  it('moves text that doesn\'t fit off the line and the next row out past it (G2, G3)', () => {
    expect(wallRows(stored('G2 Face frame kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-86, 19.5], end: [-84, 19.5], offset: 9, text: '2"', textAt: [-85, 34.875] },
      { row: 'front', kind: 'opening', start: [-84, 19.5], end: [-42, 19.5], offset: 9, text: '42"' },
      { row: 'front', kind: 'space', start: [-42, 19.5], end: [86, 19.5], offset: 9, text: '128"' },
      wall([-86, 19.5], [86, 19.5], 21.75, '172"'),
      wall([132.5, -63.5], [132.5, 15], -9, '78 1/2"'),
    ]);
    expect(dimensions(stored('G3 Bath alcove')).filter(({ row }) => row === 'front')).toEqual([
      { row: 'front', kind: 'space', start: [-102, 13.5], end: [-30, 13.5], offset: 9, text: '72"' },
      { row: 'front', kind: 'landing', start: [-30, 13.5], end: [-25.5, 13.5], offset: 9, text: '4 1/2"', textAt: [-27.75, 28.875] },
      { row: 'front', kind: 'space', start: [-25.5, 13.5], end: [66, 13.5], offset: 9, text: '91 1/2"' },
    ]);
  });

  it('starts the rows past the deepest recess bump-out (G5)', () => {
    const rows = wallRows(stored('G5 Recess room'));
    expect(rows.map(({ row, kind, start, end, offset }) => [row, kind, start[0], end[0], start[1], offset])).toEqual([
      ['wall', 'wall', -114.5, -114.5, -15, 9],
      ['front', 'space', -110, -78, 43.5, 9],
      ['front', 'recess', -78, -30, 43.5, 9],
      ['front', 'space', -30, 30, 43.5, 9],
      ['front', 'recess', 30, 78, 43.5, 9],
      ['front', 'space', 78, 90, 43.5, 9],
      ['wall', 'wall', -110, 90, 43.5, 18],
      ['wall', 'wall', 94.5, 94.5, -15, -9],
    ]);
  });

  it('dimensions a wing wall on a back face on the room side, past the front runs and their marker (G3, wing moved behind)', () => {
    const room = structuredClone(stored('G3 Bath alcove'));
    Object.assign(room.walls[2], { x1: -30, y1: -13.5, x2: -30, y2: -43.5 });
    room.walls[2].landings.start = { ...room.walls[2].landings.start, side: 'back' };
    expect(dimensions(room).filter(({ row }) => row === 'back')).toEqual([
      { row: 'back', kind: 'space', start: [-6, -37.5], end: [66, -37.5], offset: -9, text: '72"' },
      { row: 'back', kind: 'landing', start: [-10.5, -37.5], end: [-6, -37.5], offset: -9, text: '4 1/2"', textAt: [-8.25, -49.125] },
      { row: 'back', kind: 'space', start: [-102, -37.5], end: [-10.5, -37.5], offset: -9, text: '91 1/2"' },
    ]);
  });

  it('always reads left to right or bottom to top, the line 3/8" out at 1/2" = 1\'-0" (every room, an angled wall)', () => {
    const angled = structuredClone(stored('G4 T-filler run'));
    angled.walls[1].x2 = 30;
    for (const room of [...document.rooms, angled]) {
      for (const { row, start, end, offset } of dimensions(room)) {
        const dx = end[0] - start[0];
        expect(dx > 1e-6 || (Math.abs(dx) <= 1e-6 && end[1] > start[1])).toBe(true);
        if (WALL_ROWS.includes(row)) expect(Math.abs(offset)).toBeGreaterThanOrEqual(9);
      }
    }
    const [, sloped] = dimensions(angled).filter(({ row }) => row === 'wall');
    expect([sloped.text, sloped.offset]).toEqual(['54 1/16"', -9]);
    expect(sloped.start[0]).toBeCloseTo(33.7442, 4);
    expect(sloped.end[1]).toBeCloseTo(20.0038, 4);
  });
});
