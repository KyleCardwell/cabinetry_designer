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
const row = ({
  row: name, kind, start, end, base, at, text, textX, textZ,
}) => [name, kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

/** The horizontal rows only (SPEC-43.2 adds vertical columns, tested in verticalDimensions.test.js). */
const horizontal = (dimensions) => dimensions.filter(({ orientation }) => orientation === undefined);

describe('SPEC-43 elevation dimensions', () => {
  it('dimensions every segment of the canvas\'s chains; text that doesn\'t fit moves off the line (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(horizontal(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row)).toEqual([
      ['lower.inner', 'piece', 0, 0.75, 0, -9, '3/4"', 0.375, -11.625],
      ['lower.inner', 'piece', 0.75, 29.25, 0, -9, '28 1/2"'],
      ['lower.inner', 'piece', 29.25, 30, 0, -9, '3/4"', 29.625, -11.625],
      ['lower.inner', 'piece', 30, 54, 0, -9, '24"'],
      ['lower.inner', 'piece', 54, 90, 0, -9, '36"'],
      ['lower.inner', 'piece', 90, 115.5, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 115.5, 141, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 141, 143.125, 0, -9, '2 1/8"', 142.0625, -11.625],
      ['lower.inner', 'corner-gap', 143.125, 168, 0, -9, '24 7/8"'],
      ['lower.outer', 'run', 0, 30, 0, -21.75, '30"'],
      ['lower.outer', 'run', 30, 168, 0, -21.75, '138"'],
      ['openings', 'gap', 0, 48, 0, -30.75, '48"'],
      ['openings', 'opening', 48, 96, 0, -30.75, '48"'],
      ['openings', 'gap', 96, 168, 0, -30.75, '72"'],
      ['upper.inner', 'tall-span', 0, 30, 96, 105, '30"'],
      ['upper.inner', 'open', 30, 108.5, 96, 105, '78 1/2"'],
      ['upper.inner', 'piece', 108.5, 109.25, 96, 105, '3/4"', 108.875, 111.375],
      ['upper.inner', 'piece', 109.25, 131.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 131.25, 153.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 153.25, 155.125, 96, 105, '1 7/8"', 154.1875, 111.375],
      ['upper.inner', 'corner-gap', 155.125, 168, 96, 105, '12 7/8"'],
      ['upper.outer', 'tall-span', 0, 30, 96, 117.75, '30"'],
      ['upper.outer', 'open', 30, 108.5, 96, 117.75, '78 1/2"'],
      ['upper.outer', 'run', 108.5, 168, 96, 117.75, '59 1/2"'],
    ]);
  });

  it('stacks moved text in levels so neighbours clear, and spaces by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = horizontal(elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 }));
    // No openings: the wall row takes no space. At 1:48 rows are 18" apart, plus 7 1/2" per level of moved text.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'lower.inner -18', 'lower.outer -43.5', 'upper.inner 114', 'upper.outer 147',
    ]);
    // Above the wall the 12 7/8" and the 1 13/16" beside it would overlap: the second goes a level further out.
    expect(dimensions.filter(({ row: name, textX }) => name === 'upper.inner' && textX !== undefined).map(row)).toEqual([
      ['upper.inner', 'corner-gap', 0, 12.875, 96, 114, '12 7/8"', 6.4375, 126.75],
      ['upper.inner', 'piece', 12.875, 14.6875, 96, 114, '1 13/16"', 13.78125, 134.25],
      ['upper.inner', 'piece', 118.1875, 120, 96, 114, '1 13/16"', 119.09375, 126.75],
    ]);
    expect(dimensions).toHaveLength(14);
  });

  it('dimensions the wall above when there are no uppers, and recesses in the wall row (G1 island, G5)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(horizontal(elevationDimensions(g1, g1.walls[3], 'back', settings)).map(row).slice(5)).toEqual([
      ['lower.outer', 'open', 0, 0.75, 0, -21.75, '3/4"', 0.375, -24.375],
      ['lower.outer', 'run', 0.75, 90.75, 0, -21.75, '90"'],
      ['lower.outer', 'open', 90.75, 91.5, 0, -21.75, '3/4"', 91.125, -24.375],
      ['upper.outer', 'wall', 0, 91.5, 36, 45, '91 1/2"'],
    ]);
    const g5 = room('G5 Recess room');
    expect(elevationDimensions(g5, g5.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings').map(row)).toEqual([
      ['openings', 'gap', 0, 32, 0, -30.75, '32"'],
      ['openings', 'recess', 32, 80, 0, -30.75, '48"'],
      ['openings', 'gap', 80, 140, 0, -30.75, '60"'],
      ['openings', 'recess', 140, 188, 0, -30.75, '48"'],
      ['openings', 'gap', 188, 200, 0, -30.75, '12"'],
    ]);
  });
});
