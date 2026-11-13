import { describe, expect, it } from 'vitest';
import { gridFromItems, isGridShape, LEAF_KINDS, rootItems, runBlind } from '../grid.js';
import { addGridPanel, findLeaf, panelTypes, setGridCellKind, setGridPanelType,
  splitGridCell } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const F = (id) => ({ id, size: 0.75, sizeMode: 'manual' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR },
]);
// b split down: grid n1 (column n1:col, 30 manual), rows n3 (b, top) and n4 (n5, bottom)
const S = splitGridCell(ROOT, 'b', 'down', 2, ids());

describe('SPEC-34.1 kinds everywhere and panels', () => {
  it('changes a top-level cell\'s kind', () => {
    const open = setGridCellKind(ROOT, 'a', 'void');
    expect(open.cells[0].node).toEqual({ id: 'a', kind: 'void' });
    expect(open.cols[0]).toEqual(ROOT.cols[0]);
    const side = setGridPanelType(setGridCellKind(ROOT, 'a', 'panel'), 'a', 'side', 0.75);
    expect(side.cols[0]).toEqual({ id: 'a:col', size: 0.75, sizeMode: 'manual' });
    expect(side.cells[0].node).toEqual({ id: 'a', kind: 'panel' });
    const cabinet = setGridCellKind(side, 'a', 'cabinet');
    expect(cabinet.cols[0]).toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(cabinet.cells[0].node).toEqual({ id: 'a', kind: 'cabinet' });
    const filler = gridFromItems('f', [{ id: 'x', kind: 'filler', width: 3 }]);
    expect(setGridCellKind(filler, 'x', 'panel')).toBe(filler);
  });

  it('offers and sets panel types by the cell\'s axis', () => {
    const P = setGridCellKind(S, 'n5', 'panel');
    expect(panelTypes(P, 'n5')).toEqual(['top', 'back']);
    expect(panelTypes(P, 'a')).toEqual(['side', 'back']);
    expect(panelTypes(P, 'n1')).toEqual([]);
    expect(panelTypes(P, 'zz')).toEqual([]);
    const top = setGridPanelType(P, 'n5', 'top', 0.75);
    expect(top.cells[1].node.rows[1]).toEqual(F('n4'));
    expect(setGridPanelType(top, 'n5', 'top', 0.75)).toBe(top);
    expect(setGridPanelType(P, 'n5', 'side', 0.75)).toBe(P);
    expect(setGridPanelType(P, 'n5', 'top', 0)).toBe(P);
    expect(setGridPanelType(S, 'b', 'top', 0.75)).toBe(S);
    const back = setGridPanelType(top, 'n5', 'back', 0.75);
    expect(back.cells[1].node.rows[1]).toEqual(AUTO('n4'));
    expect(findLeaf(back, 'n5')).toEqual({ id: 'n5', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridPanelType(back, 'n5', 'top', 0.75), 'n5')).toEqual({ id: 'n5', kind: 'panel' });
  });

  it('adds a panel beside a top-level cell', () => {
    expect(rootItems(addGridPanel(ROOT, 'b', 'left', 0.75, ids('p')))).toEqual([
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'p1', kind: 'panel', width: 0.75 },
      { id: 'b', kind: 'cabinet', width: 30, face: DOOR },
    ]);
    expect(rootItems(addGridPanel(ROOT, 'b', 'right', 0.75, ids('p'))).map(({ id }) => id))
      .toEqual(['a', 'b', 'p1']);
    const below = addGridPanel(ROOT, 'a', 'below', 0.75, ids('p'));
    expect(below.cols[0]).toEqual({ id: 'p1:col', size: null, sizeMode: 'auto' });
    expect(below.cells[0].node).toEqual({
      id: 'p1', cols: [AUTO('p2')], rows: [AUTO('p3'), F('p4')], cells: [
        cell(0, 0, { id: 'a', kind: 'cabinet' }),
        cell(0, 1, { id: 'p5', kind: 'panel' }),
      ],
    });
    expect(isGridShape(below, isLeaf)).toBe(true);
  });

  it('adds a panel into a stack it belongs to', () => {
    const under = addGridPanel(S, 'n5', 'below', 0.75, ids('p'));
    expect(under.cells[1].node.rows).toEqual([AUTO('n3'), AUTO('n4'), F('p1')]);
    expect(under.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'n5'], [2, 'p2']]);
    const over = addGridPanel(S, 'n5', 'above', 0.75, ids('p'));
    expect(over.cells[1].node.rows).toEqual([AUTO('n3'), F('p1'), AUTO('n4')]);
    expect(over.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'p2'], [2, 'n5']]);
    expect(findLeaf(over, 'p2')).toEqual({ id: 'p2', kind: 'panel' });
  });

  it('nests a cell to add a panel across a stack', () => {
    const beside = addGridPanel(S, 'n5', 'left', 0.75, ids('p'));
    expect(beside.cells[1].node.cells[1].node).toEqual({
      id: 'p1', cols: [F('p3'), AUTO('p4')], rows: [AUTO('p2')], cells: [
        cell(0, 0, { id: 'p5', kind: 'panel' }),
        cell(1, 0, { id: 'n5', kind: 'cabinet' }),
      ],
    });
    expect(beside.cells[1].node.rows).toEqual(S.cells[1].node.rows);
  });

  it('leaves alone what it can\'t add to, and re-homes blind', () => {
    for (const [id, side, thickness] of [
      ['zz', 'left', 0.75], ['n1', 'left', 0.75], ['n5', 'up', 0.75], ['n5', 'left', Number.NaN],
    ]) {
      expect(addGridPanel(S, id, side, thickness, ids('p'))).toBe(S);
    }
    const filler = gridFromItems('f', [{ id: 'x', kind: 'filler', width: 3 }]);
    expect(addGridPanel(filler, 'x', 'left', 0.75, ids('p'))).toBe(filler);
    const blind = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }], { left: 24, right: null });
    expect(runBlind({ grid: addGridPanel(blind, 'a', 'right', 0.75, ids('p')) }))
      .toEqual({ left: 24, right: null });
    expect(runBlind({ grid: addGridPanel(blind, 'a', 'left', 0.75, ids('p')) })).toBeUndefined();
  });
});
