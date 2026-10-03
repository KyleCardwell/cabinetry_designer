import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { blindCellWidths, cellPieces, resolveTracks, stackedSides } from '../cells.js';
import { gridFromItems, runItems } from '../grid.js';
import { syncAutoItems } from '../splitRun.js';

const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
// Column g1: 't' on top; below it a 30" row split across into 'p' | 'q'
const STACK = { id: 'g1', cols: [AUTO('g1c')],
  rows: [AUTO('g1r0'), { id: 'g1r1', size: 30, sizeMode: 'manual' }],
  cells: [
    cell(0, 0, { id: 't', kind: 'cabinet' }),
    cell(0, 1, { id: 'g2', cols: [AUTO('g2c0'), AUTO('g2c1')], rows: [AUTO('g2r')],
      cells: [cell(0, 0, { id: 'p', kind: 'cabinet' }), cell(1, 0, { id: 'q', kind: 'cabinet' })] }),
  ] };
const GRID = { id: 'r:grid', cols: [AUTO('a:col'), AUTO('g1:col')], rows: [AUTO('r:row')],
  cells: [cell(0, 0, { id: 'a', kind: 'cabinet' }), cell(1, 0, STACK)] };
const RUN = { id: 'r', cabinetTypeId: 3, grid: GRID };
const piece = (id, kind, role, x, width) => ({
  id, kind, role, cabinetTypeId: kind === 'cabinet' ? 3 : 5, x, width, z: 4, height: 90, depth: 24, auto: true });
const LAYOUT = { pieces: [
  piece('r:left', 'filler', 'end-left', 0, 1.5),
  piece('a', 'cabinet', 'item', 1.5, 36),
  piece('g1', 'cabinet', 'item', 37.5, 72),
] };

describe('cells', () => {
  it('resolves tracks', () => {
    expect(resolveTracks([AUTO('x'), { id: 'y', size: 30, sizeMode: 'manual' }], 90)).toEqual([60, 30]);
    expect(resolveTracks([
      { id: 'x', size: 20, sizeMode: 'manual' },
      { id: 'y', size: 30, sizeMode: 'manual' },
    ], 90)).toEqual([20, 70]);
    expect(resolveTracks([AUTO('x'), AUTO('y'), AUTO('z')], 90)).toEqual([30, 30, 30]);
    expect(resolveTracks([], 10)).toEqual([]);
    expect(resolveTracks([
      { id: 'x', size: 100, sizeMode: 'manual' },
      AUTO('y'),
    ], 90)).toEqual([100, -10]);
  });

  it('expands a split column', () => {
    const cells = cellPieces(RUN, LAYOUT);
    expect(cells.pieces.map((value) => value.id)).toEqual(['r:left', 'a', 'p', 't', 'q']);
    expect(cells.pieces[0]).toBe(LAYOUT.pieces[0]);
    expect(cells.pieces[1]).toBe(LAYOUT.pieces[1]);
    expect(cells.pieces[3]).toEqual({ id: 't', kind: 'cabinet', role: 'item',
      cabinetTypeId: 3, columnId: 'g1', x: 37.5, z: 34, width: 72, height: 60, depth: 24, auto: true });
    expect(cells.pieces.find((value) => value.id === 'p')).toMatchObject({ x: 37.5, z: 4, width: 36, height: 30 });
    expect(cells.pieces.find((value) => value.id === 'q')).toMatchObject({ x: 73.5, z: 4, width: 36, height: 30 });
    expect(cells.grids).toEqual([
      { id: 'g1', columnId: 'g1', axis: 'row', depth: 1, x: 37.5, z: 4, width: 72, height: 90,
        tracks: [{ id: 'g1r0', start: 34, end: 94, manual: false }, { id: 'g1r1', start: 4, end: 34, manual: true }] },
      { id: 'g2', columnId: 'g1', axis: 'col', depth: 2, x: 37.5, z: 4, width: 72, height: 30,
        tracks: [{ id: 'g2c0', start: 37.5, end: 73.5, manual: false }, { id: 'g2c1', start: 73.5, end: 109.5, manual: false }] },
    ]);
    expect(cells.warnings).toEqual([]);
  });

  it('warns on a cell under an inch', () => {
    const smallStack = { ...STACK,
      rows: [STACK.rows[0], { id: 'g1r1', size: 89.5, sizeMode: 'manual' }] };
    const smallGrid = { ...GRID,
      cells: [GRID.cells[0], { ...GRID.cells[1], node: smallStack }] };
    expect(cellPieces({ ...RUN, grid: smallGrid }, LAYOUT).warnings).toEqual([
      { code: 'cell-too-small', pieceId: 't', message: 'Cell is smaller than 1 inch.' },
    ]);
  });

  it('passes unsplit runs through', () => {
    const gridRun = { id: 'r', grid: gridFromItems('r', [
      { id: 'a', kind: 'cabinet', width: null },
    ]) };
    const itemRun = { id: 'r', items: [] };
    expect(cellPieces(gridRun, LAYOUT).pieces).toBe(LAYOUT.pieces);
    expect(cellPieces(gridRun, LAYOUT).grids).toEqual([]);
    expect(cellPieces(itemRun, LAYOUT).pieces).toBe(LAYOUT.pieces);
    expect(cellPieces(itemRun, LAYOUT).grids).toEqual([]);
  });

  it('finds stacked sides', () => {
    const { pieces } = cellPieces(RUN, LAYOUT);
    expect(stackedSides(pieces, 't')).toEqual({ top: false, bottom: true });
    expect(stackedSides(pieces, 'p')).toEqual({ top: true, bottom: false });
    expect(stackedSides(pieces, 'q')).toEqual({ top: true, bottom: false });
    expect(stackedSides(pieces, 'a')).toEqual({ top: false, bottom: false });
    expect(stackedSides(pieces, 'r:left')).toEqual({ top: false, bottom: false });
    expect(stackedSides(pieces, 'zz')).toEqual({ top: false, bottom: false });
  });

  it('resolves blind cell widths from each cell', () => {
    const blindStack = structuredClone(STACK);
    blindStack.cells[0].node.blind = { left: 80, right: 96 };
    blindStack.cells[1].node.cells[1].node.blind = { right: 96 };
    const blindRun = { ...RUN, grid: { ...GRID, cells: [GRID.cells[0], cell(1, 0, blindStack)] } };
    const { pieces } = cellPieces(blindRun, LAYOUT);
    expect(pieces.find((piece) => piece.id === 't').blind).toEqual({ left: 80, right: 96 });
    expect(pieces.find((piece) => piece.id === 'p')).not.toHaveProperty('blind');
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'right', pieceId: 'g1', boxWidth: 96 },
    ])).toEqual(new Map([['t', 96], ['q', 60]]));
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'left', pieceId: 'g1', boxWidth: 80 },
    ])).toEqual(new Map([['t', 80]]));
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'left', pieceId: 'a', boxWidth: 96 },
    ])).toEqual(new Map());
  });

  it('keeps a split column when syncing auto items', () => {
    const NONE = { type: 'none', width: null };
    const result = syncAutoItems({ id: 'r', x: 0, width: 30,
      ends: { left: NONE, right: NONE }, anchors: { left: false, right: false },
      autoCount: true, maxCabinetWidth: null,
      grid: gridFromItems('r', [
        { id: 'a', kind: 'cabinet', width: null },
        { id: 'g1', kind: 'cabinet', width: null, grid: STACK },
      ]) }, DEFAULT_SETTINGS);
    expect(runItems(result).map((item) => item.id)).toEqual(['g1']);
    expect(result.grid.cells[0].node).toEqual(STACK);
  });
});
