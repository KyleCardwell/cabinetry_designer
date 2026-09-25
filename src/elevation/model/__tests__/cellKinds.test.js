import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, gridLeaves, isGridShape, LEAF_KINDS, runBlind, setGridBlind } from '../grid.js';
import { findLeaf, setGridCellDepth, setGridCellKind, setGridShelves, setGridTrackSize,
  splitGridCell, wrapGridCell } from '../cellTree.js';
import { cellCaptureSides, cellPieces, panelOrientation, partPieces, shelfParts } from '../cells.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const F = (id) => ({ id, size: 0.75, sizeMode: 'manual' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const INSET = { cabinetStyleId: 14 };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR, style: INSET, reveals: { top: 0 } },
]);
// b split down: grid n1, rows n3 (b, top) and n4 (n5, bottom); n5 = { id: 'n5', kind: 'cabinet', style: INSET }
const S = splitGridCell(ROOT, 'b', 'down', 2, ids());
const blindIds = (grid) => gridLeaves(grid).filter((leaf) => leaf.blind).map((leaf) => leaf.id);

describe('SPEC-34 cell kinds, depth and wrap', () => {
  it('changes a nested cell\'s kind', () => {
    expect(findLeaf(setGridCellKind(S, 'b', 'panel'), 'b')).toEqual({ id: 'b', kind: 'panel' });
    expect(findLeaf(setGridCellKind(S, 'n5', 'shelves'), 'n5'))
      .toEqual({ id: 'n5', kind: 'shelves', shelves: { count: 2, back: false } });
    const back = setGridCellDepth(setGridCellKind(S, 'b', 'panel'), 'b', { depth: 0.75, align: 'back' });
    expect(findLeaf(back, 'b')).toEqual({ id: 'b', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridCellKind(back, 'b', 'void'), 'b')).toEqual({ id: 'b', kind: 'void' });
    expect(findLeaf(setGridCellKind(back, 'b', 'cabinet'), 'b'))
      .toEqual({ id: 'b', kind: 'cabinet', depth: 0.75, align: 'back' });
    for (const [id, kind] of [['a', 'panel'], ['b', 'cabinet'], ['b', 'filler'], ['zz', 'panel'], ['n1', 'panel']]) {
      expect(setGridCellKind(S, id, kind)).toBe(S);
    }
  });

  it('sets a nested cell\'s depth and align', () => {
    const deep = setGridCellDepth(S, 'n5', { depth: 21, align: 'back' });
    expect(findLeaf(deep, 'n5')).toEqual({ id: 'n5', kind: 'cabinet', style: INSET, depth: 21, align: 'back' });
    expect(setGridCellDepth(deep, 'n5', { depth: null, align: 'face' })).toEqual(S);
    expect(findLeaf(setGridCellDepth(deep, 'n5', { align: null }), 'n5')).not.toHaveProperty('align');
    for (const patch of [{ depth: 0 }, { depth: Number.NaN }, { align: 'middle' }, {}]) {
      expect(setGridCellDepth(S, 'n5', patch)).toBe(S);
    }
    expect(setGridCellDepth(S, 'a', { depth: 12 })).toBe(S);
    const open = setGridCellKind(S, 'n5', 'void');
    expect(setGridCellDepth(open, 'n5', { depth: 12 })).toBe(open);
  });

  it('sets shelves count and back', () => {
    const shelves = setGridCellKind(S, 'n5', 'shelves');
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 3.6, back: true }), 'n5').shelves)
      .toEqual({ count: 4, back: true });
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 40 }), 'n5').shelves.count).toBe(12);
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 0 }), 'n5').shelves.count).toBe(1);
    expect(setGridShelves(shelves, 'n5', { count: 2 })).toBe(shelves);
    expect(setGridShelves(shelves, 'n5', { count: Number.NaN })).toBe(shelves);
    expect(setGridShelves(shelves, 'n5', { back: 'yes' })).toBe(shelves);
    expect(setGridShelves(S, 'b', { count: 3 })).toBe(S);
  });

  it('wraps a root cabinet with the sides running through', () => {
    const wrapped = wrapGridCell(ROOT, 'a', 'sides', 0.75, ids('w'));
    expect(wrapped.cols[0]).toEqual({ id: 'w1:col', size: null, sizeMode: 'auto' });
    expect(wrapped.cells[0].node).toEqual({
      id: 'w1', cols: [F('w3'), AUTO('w4'), F('w5')], rows: [AUTO('w2')], cells: [
        cell(0, 0, { id: 'w6', kind: 'panel' }),
        cell(1, 0, { id: 'w8', cols: [AUTO('w9')], rows: [F('w10'), AUTO('w11')], cells: [
          cell(0, 0, { id: 'w12', kind: 'panel' }),
          cell(0, 1, { id: 'a', kind: 'cabinet' }),
        ] }),
        cell(2, 0, { id: 'w7', kind: 'panel' }),
      ],
    });
    expect(isGridShape(wrapped, isLeaf)).toBe(true);
  });

  it('wraps a nested cabinet with the top running through, and a bottom', () => {
    const wrapped = wrapGridCell(S, 'n5', 'top', 0.75, ids('w'), true);
    expect(wrapped.cells[1].node.cells[1].node).toEqual({
      id: 'w1', cols: [AUTO('w2')], rows: [F('w3'), AUTO('w4'), F('w5')], cells: [
        cell(0, 0, { id: 'w6', kind: 'panel' }),
        cell(0, 1, { id: 'w8', cols: [F('w10'), AUTO('w11'), F('w12')], rows: [AUTO('w9')], cells: [
          cell(0, 0, { id: 'w13', kind: 'panel' }),
          cell(1, 0, { id: 'n5', kind: 'cabinet', style: INSET }),
          cell(2, 0, { id: 'w14', kind: 'panel' }),
        ] }),
        cell(0, 2, { id: 'w7', kind: 'panel' }),
      ],
    });
    expect(wrapped.cols[1]).toEqual(S.cols[1]);
    for (const [id, through, thickness] of [['n5', 'middle', 0.75], ['n5', 'top', 0], ['n1', 'top', 0.75], ['zz', 'top', 0.75]]) {
      expect(wrapGridCell(S, id, through, thickness, ids('w'))).toBe(S);
    }
    const panel = setGridCellKind(S, 'n5', 'panel');
    expect(wrapGridCell(panel, 'n5', 'top', 0.75, ids('w'))).toBe(panel);
  });

  it('never puts a blind on a panel, void or shelves cell', () => {
    const blind = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }], { left: 24, right: null });
    const wrapped = wrapGridCell(blind, 'a', 'sides', 0.75, ids('w'));
    expect(blindIds(wrapped)).toEqual([]);
    expect(runBlind({ grid: wrapped })).toBeUndefined();
    expect(setGridBlind(wrapped, 'left', 24)).toBe(wrapped);
    const stack = splitGridCell(blind, 'a', 'down', 2, ids());
    expect(blindIds(stack)).toEqual(['a', 'n5']);
    expect(findLeaf(setGridCellKind(stack, 'n5', 'panel'), 'n5')).toEqual({ id: 'n5', kind: 'panel' });
  });

  it('resolves depth, align and shelves into pieces', () => {
    let grid = setGridTrackSize(S, 'n4', 30);
    grid = setGridCellDepth(grid, 'b', { depth: 21, align: 'back' });
    grid = setGridShelves(setGridCellKind(grid, 'n5', 'shelves'), 'n5', { back: true });
    const layout = { pieces: [
      { id: 'a', kind: 'cabinet', role: 'item', cabinetTypeId: 3, x: 0, width: 36, z: 4, height: 90, depth: 24, auto: true },
      { id: 'n1', kind: 'cabinet', role: 'item', cabinetTypeId: 3, x: 36, width: 30, z: 4, height: 90, depth: 24, auto: false },
    ] };
    const { pieces, warnings } = cellPieces({ id: 'r', cabinetTypeId: 3, grid }, layout);
    expect(pieces[1]).toEqual({ id: 'n5', kind: 'shelves', role: 'item', cabinetTypeId: 3, columnId: 'n1',
      x: 36, z: 4, width: 30, height: 30, depth: 24, auto: false, shelves: { count: 2, back: true } });
    expect(pieces[2]).toEqual({ id: 'b', kind: 'cabinet', role: 'item', cabinetTypeId: 3, columnId: 'n1',
      x: 36, z: 34, width: 30, height: 60, depth: 21, auto: true, align: 'back' });
    expect(warnings).toEqual([]);
    expect(shelfParts(pieces[1], DEFAULT_SETTINGS)).toEqual([
      { id: 'n5:back', kind: 'panel', x: 36, z: 4, width: 30, height: 30, depth: 0.75 },
      { id: 'n5:shelf-1', kind: 'shelf', x: 36, z: 13, width: 30, height: 1.5, depth: 23.25 },
      { id: 'n5:shelf-2', kind: 'shelf', x: 36, z: 23.5, width: 30, height: 1.5, depth: 23.25 },
    ]);
    expect(partPieces([{ ...pieces[2], kind: 'void' }, pieces[1], pieces[0]], DEFAULT_SETTINGS)
      .map(({ id }) => id)).toEqual(['n5:back', 'n5:shelf-1', 'n5:shelf-2', 'a']);
    const tooDeep = setGridCellDepth(grid, 'b', { depth: 30 });
    expect(cellPieces({ id: 'r', cabinetTypeId: 3, grid: tooDeep }, layout).warnings)
      .toEqual([{ code: 'cell-too-deep', pieceId: 'b', message: 'Cell is deeper than its run.' }]);
  });

  it('reads panel orientation and capture by panels', () => {
    const panel = (id, x, z, width, height, depth = 24) => ({ id, kind: 'panel', x, z, width, height, depth });
    const pieces = [
      panel('L', 0, 0, 0.75, 30),
      { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 29.25, depth: 24 },
      panel('T', 0.75, 29.25, 20, 0.75),
      panel('R', 20.75, 0, 0.75, 30),
    ];
    expect(pieces.map(panelOrientation)).toEqual(['side', null, 'top', 'side']);
    expect(panelOrientation(panel('B', 0, 0, 20, 30, 0.75))).toBe('back');
    expect(cellCaptureSides(pieces, 'c')).toEqual({ left: true, right: true });
    expect(cellCaptureSides(pieces.slice(1, 3), 'c')).toEqual({ left: false, right: false });
    expect(cellCaptureSides(pieces, 'zz')).toEqual({ left: false, right: false });
  });

  it('only side panels capture a cell', () => {
    const side = { id: 'L', kind: 'panel', x: 0, z: 0, width: 0.75, height: 30, depth: 24 };
    const cab = { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 30, depth: 24 };
    const back = { id: 'B', kind: 'panel', x: 20.75, z: 0, width: 20, height: 30, depth: 0.75 };
    expect(cellCaptureSides([side, cab, back], 'c')).toEqual({ left: true, right: false });
  });
});
