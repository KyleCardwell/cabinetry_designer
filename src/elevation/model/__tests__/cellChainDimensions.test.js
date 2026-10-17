import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitGridCell } from '../cellTree.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const cells = (dimensions) => dimensions.filter(({ row: name }) => name === 'cells');
const row = ({
  orientation, kind, start, end, base, at, text, textX, textZ,
}) => [orientation ?? 'horizontal', kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

/** G4 with the lower cabinet of its stacked column split across in two (a nested grid of columns). */
function splitG4() {
  const copy = structuredClone(stored('G4 T-filler run'));
  let next = 0;
  copy.walls[0].runs[0].grid = splitGridCell(
    copy.walls[0].runs[0].grid, '0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba', 'across', 2, () => `split-${++next}`,
  );
  return syncRoom(copy, settings);
}

describe('SPEC-43.3 cell chains in the DXF', () => {
  it('dimensions a split column up its left side, 1/4" (paper) inside it (G2, G3, G4)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(cells(elevationDimensions(g2, g2.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 68, 57.0625, 57.0625, '64'],
      ['vertical', 'cell', 68, 90, 57.0625, 57.0625, '22'],
    ]);
    // The 3/4" top panel's text moves off the line, into the column.
    const g3 = room('G3 Bath alcove');
    expect(cells(elevationDimensions(g3, g3.walls[1], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 36, 77.25, 6.8125, 6.8125, '41 1/4'],
      ['vertical', 'cell', 77.25, 78, 6.8125, 6.8125, '3/4', 9.4375, 77.625],
    ]);
    const g4 = room('G4 T-filler run');
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 54.8125, 54.8125, '60'],
      ['vertical', 'cell', 64, 90, 54.8125, 54.8125, '26'],
    ]);
    const g1 = room('G1 Euro kitchen');
    expect(cells(elevationDimensions(g1, g1.walls[0], 'front', settings))).toEqual([]);
  });

  it('dimensions a nested split across its bottom, and stacks wider Arial text in popout levels (G4 split, 1:24 and 1:48)', () => {
    const g4 = splitG4();
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 54.8125, 54.8125, '60'],
      ['vertical', 'cell', 64, 90, 54.8125, 54.8125, '26'],
      ['horizontal', 'cell', 48.8125, 66.3125, 10, 10, '17 1/2'],
      ['horizontal', 'cell', 66.3125, 83.8125, 10, 10, '17 1/2'],
    ]);
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', { ...settings, plotScale: 48 })).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 60.8125, 60.8125, '60'],
      ['vertical', 'cell', 64, 90, 60.8125, 60.8125, '26'],
      ['horizontal', 'cell', 48.8125, 66.3125, 16, 16, '17 1/2', 57.5625, 28.75],
      ['horizontal', 'cell', 66.3125, 83.8125, 16, 16, '17 1/2', 75.0625, 36.25],
    ]);
  });
});
