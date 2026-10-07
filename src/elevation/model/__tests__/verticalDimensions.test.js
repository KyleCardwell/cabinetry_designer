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
const vertical = (dimensions) => dimensions.filter(({ orientation }) => orientation === 'vertical');
const row = ({
  row: name, kind, start, end, base, at, text, textX, textZ,
}) => [name, kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

describe('SPEC-43.2 vertical elevation dimensions', () => {
  it('dimensions both wall edges as the canvas does with nothing selected, counter height between (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = vertical(elevationDimensions(g1, g1.walls[0], 'front', settings));
    expect(dimensions.map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'box', 4, 90, 0, -9, '86"'],
      ['left.inner', 'molding', 90, 96, 0, -9, '6"'],
      ['left.outer', 'wall', 0, 96, 0, -21.75, '96"'],
      ['right.inner', 'toe-kick', 0, 4, 168, 177, '4"', 179.625, 2],
      ['right.inner', 'box', 4, 34.5, 168, 177, '30 1/2"'],
      ['right.inner', 'countertop', 34.5, 36, 168, 177, '1 1/2"', 179.625, 35.25],
      ['right.inner', 'clearance', 36, 54, 168, 177, '18"'],
      ['right.inner', 'box', 54, 90, 168, 177, '36"'],
      ['right.inner', 'molding', 90, 96, 168, 177, '6"'],
      ['right.middle', 'counter-height', 0, 36, 168, 189.75, '36"'],
      ['right.outer', 'wall', 0, 96, 168, 198.75, '96"'],
    ]);
  });

  it('stacks moved text in levels and moves the next column out for them (G2 elevation A, face frame)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(vertical(elevationDimensions(g2, g2.walls[0], 'front', settings))
      .filter(({ row: name }) => name.startsWith('left.')).map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'frame', 4, 5.75, 0, -9, '1 3/4"', -19.125, 4.875],
      ['left.inner', 'frame-opening', 5.75, 67, 0, -9, '61 1/4"'],
      ['left.inner', 'frame', 67, 69, 0, -9, '2"', -15.375, 68],
      ['left.inner', 'frame-opening', 69, 88.25, 0, -9, '19 1/4"'],
      ['left.inner', 'frame', 88.25, 90, 0, -9, '1 3/4"', -15.375, 89.125],
      ['left.inner', 'molding', 90, 96, 0, -9, '6"'],
      ['left.outer', 'wall', 0, 96, 0, -25.5, '96"'],
    ]);
  });

  it('leaves out a column that only repeats the wall height (G1 island, a bare wall in G3)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(vertical(elevationDimensions(g1, g1.walls[3], 'back', settings)).map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'box', 4, 34.5, 0, -9, '30 1/2"'],
      ['left.inner', 'countertop', 34.5, 36, 0, -9, '1 1/2"', -15.375, 35.25],
      ['left.outer', 'wall', 0, 36, 0, -21.75, '36"'],
      ['right.inner', 'toe-kick', 0, 4, 91.5, 100.5, '4"', 103.125, 2],
      ['right.inner', 'box', 4, 34.5, 91.5, 100.5, '30 1/2"'],
      ['right.inner', 'countertop', 34.5, 36, 91.5, 100.5, '1 1/2"', 103.125, 35.25],
      ['right.outer', 'wall', 0, 36, 91.5, 113.25, '36"'],
    ]);
    const g3 = room('G3 Bath alcove');
    expect(vertical(elevationDimensions(g3, g3.walls[0], 'front', settings)).map(row)).toEqual([
      ['left.outer', 'wall', 0, 96, 0, -9, '96"'],
      ['right.outer', 'wall', 0, 96, 30, 39, '96"'],
    ]);
  });

  it('spaces columns by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = vertical(elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 }));
    // 18" apart at 1:48, plus 7 1/2" for the one level of moved text in each inner column.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'left.inner -18', 'left.middle -43.5', 'left.outer -61.5',
      'right.inner 138', 'right.middle 163.5', 'right.outer 181.5',
    ]);
    expect(dimensions.filter(({ textX }) => textX !== undefined).map(({ text, textX, textZ }) => [text, textX, textZ]))
      .toEqual([
        ['4"', -30.75, 2], ['1 1/2"', -30.75, 35.25], ['6"', -30.75, 93],
        ['4"', 143.25, 2], ['1 1/2"', 143.25, 35.25], ['6"', 143.25, 93],
      ]);
  });
});
