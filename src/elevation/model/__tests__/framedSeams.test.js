import { expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { syncRoom } from '../room.js';

it('leaves bead seam gaps only between framed columns at root and nested levels (GC6.3)', () => {
  const pencil = run({ id: 'pencil-column', items: [auto('pencil')] }).grid;
  pencil.rows = [
    { id: 'drawer-row', size: 4, sizeMode: 'manual' },
    { id: 'void-row', size: null, sizeMode: 'auto' },
  ];
  pencil.cells[0].node.style = { cabinetStyleId: 13 };
  pencil.cells.push({
    col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'under-desk', kind: 'void' },
  });
  const items = [fixed('left', 18), { ...auto('desk'), grid: pencil }, fixed('right', 18), fixed('last', 18)];
  for (const nested of [false, true]) {
    const source = room({
      style: { cabinetStyleId: 15, beadWidth: 0.25 },
      walls: [wall({ runs: [run({
        width: 90.5, autoCount: false,
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        items: nested ? [{ ...auto('columns'), grid: run({ items }).grid }] : items,
      })] })],
    });
    const synced = syncRoom(source, DEFAULT_SETTINGS);
    const w = synced.walls[0];
    const r = w.runs[0];
    const layout = layoutRun(synced, w, r, DEFAULT_SETTINGS);
    const cells = cellPieces(r, layout, { room: synced, settings: DEFAULT_SETTINGS });
    const [left, drawer, right, last] = ['left', 'pencil', 'right', 'last']
      .map((id) => cells.pieces.find((piece) => piece.id === id));
    expect(drawer.height).toBe(4);
    expect(drawer.x - left.x - left.width).toBe(0);
    expect(right.x - drawer.x - drawer.width).toBe(0);
    expect(last.x - right.x - right.width).toBe(2 * source.style.beadWidth);
  }
});
