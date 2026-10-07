import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planMarks } from '../planMarks.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const marks = (room, use = settings) => planMarks(syncRoom(room, use), use);
const marker = (at, text, direction) => ({ kind: 'elevation', at, text, direction });

describe('SPEC-45.1 elevation markers and labels in plan', () => {
  it('puts each lettered face\'s marker 6" past its deepest run plus the symbol, flag at the wall (G1)', () => {
    expect(marks(stored('G1 Euro kitchen'))).toEqual([
      marker([-17.625, -6.4375], 'A', [-1, 0]),
      marker([6.4375, 42.625], 'B', [0, 1]),
      marker([55.25, 37.5], 'C', [0, -1]),
      marker([55.25, -33.25], 'D', [0, 1]),
      { kind: 'label', at: [-67.125, -12], text: 'W1 · 48"', rotation: 90 },
    ]);
  });

  it('labels doors and recesses just outside the wall and its bump-out (G2, G5)', () => {
    expect(marks(stored('G2 Face frame kitchen')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-63, 22.125], text: 'D1 · 36"', rotation: 0 },
    ]);
    expect(marks(stored('G5 Recess room')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-54, 34.125], text: 'R1 · 48" × 12"', rotation: 0 },
      { kind: 'label', at: [54, 46.125], text: 'R2 · 48" × 24"', rotation: 0 },
    ]);
  });

  it('sizes the symbol and the label gap for paper at the plot scale (G4 at 1/4" = 1\'-0")', () => {
    expect(marks(stored('G4 T-filler run'))).toEqual([marker([6.5, -18.875], 'A', [0, 1])]);
    expect(marks(stored('G4 T-filler run'), { ...settings, plotScale: 48 }))
      .toEqual([marker([6.5, -29.375], 'A', [0, 1])]);
  });

  it('centres the marker of a forced face with no runs on the wall, shifted 1/2" (paper) along it (G1 wall 3)', () => {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.walls.find(({ id }) => id === '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051').elevationForced = true;
    expect(marks(room).filter(({ kind }) => kind === 'elevation').map(({ text, at }) => [text, at])).toEqual([
      ['A', [-17.625, -6.4375]],
      ['B', [6.4375, 42.625]],
      // 27" wall, no runs: 13 1/2" along, 6" + the symbol out, 12" further along the wall as drawn.
      ['C', [43.5, 58.5]],
      ['D', [55.25, 37.5]],
      ['E', [55.25, -33.25]],
    ]);
  });
});
