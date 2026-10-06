import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const row = ({ row: name, kind, start, end, base, at, text }) => [name, kind, start, end, base, at, text];

describe('SPEC-43 elevation dimensions', () => {
  it('dimensions every segment of the canvas\'s chains, rows 9" apart at 1/2" = 1\'-0" (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[0], 'front', settings).map(row)).toEqual([
      ['lower.inner', 'piece', 0, 0.75, 0, -9, '3/4"'],
      ['lower.inner', 'piece', 0.75, 29.25, 0, -9, '28 1/2"'],
      ['lower.inner', 'piece', 29.25, 30, 0, -9, '3/4"'],
      ['lower.inner', 'piece', 30, 54, 0, -9, '24"'],
      ['lower.inner', 'piece', 54, 90, 0, -9, '36"'],
      ['lower.inner', 'piece', 90, 115.5, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 115.5, 141, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 141, 143.125, 0, -9, '2 1/8"'],
      ['lower.inner', 'corner-gap', 143.125, 168, 0, -9, '24 7/8"'],
      ['lower.outer', 'run', 0, 30, 0, -18, '30"'],
      ['lower.outer', 'run', 30, 168, 0, -18, '138"'],
      ['openings', 'gap', 0, 48, 0, -27, '48"'],
      ['openings', 'opening', 48, 96, 0, -27, '48"'],
      ['openings', 'gap', 96, 168, 0, -27, '72"'],
      ['upper.inner', 'tall-span', 0, 30, 96, 105, '30"'],
      ['upper.inner', 'open', 30, 108.5, 96, 105, '78 1/2"'],
      ['upper.inner', 'piece', 108.5, 109.25, 96, 105, '3/4"'],
      ['upper.inner', 'piece', 109.25, 131.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 131.25, 153.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 153.25, 155.125, 96, 105, '1 7/8"'],
      ['upper.inner', 'corner-gap', 155.125, 168, 96, 105, '12 7/8"'],
      ['upper.outer', 'tall-span', 0, 30, 96, 114, '30"'],
      ['upper.outer', 'open', 30, 108.5, 96, 114, '78 1/2"'],
      ['upper.outer', 'run', 108.5, 168, 96, 114, '59 1/2"'],
    ]);
  });

  it('skips an empty row and spaces rows by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 });
    // No openings: the wall row takes no space. 3/8" on paper is 18" at 1:48.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'lower.inner -18', 'lower.outer -36', 'upper.inner 114', 'upper.outer 132',
    ]);
    expect(dimensions).toHaveLength(14);
  });

  it('dimensions the wall above when there are no uppers, and recesses in the wall row (G1 island, G5)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[3], 'back', settings).map(row).slice(5)).toEqual([
      ['lower.outer', 'open', 0, 0.75, 0, -18, '3/4"'],
      ['lower.outer', 'run', 0.75, 90.75, 0, -18, '90"'],
      ['lower.outer', 'open', 90.75, 91.5, 0, -18, '3/4"'],
      ['upper.outer', 'wall', 0, 91.5, 36, 45, '91 1/2"'],
    ]);
    const g5 = room('G5 Recess room');
    expect(elevationDimensions(g5, g5.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings').map(row)).toEqual([
      ['openings', 'gap', 0, 32, 0, -27, '32"'],
      ['openings', 'recess', 32, 80, 0, -27, '48"'],
      ['openings', 'gap', 80, 140, 0, -27, '60"'],
      ['openings', 'recess', 140, 188, 0, -27, '48"'],
      ['openings', 'gap', 188, 200, 0, -27, '12"'],
    ]);
  });
});
