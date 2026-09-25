import { describe, expect, it } from 'vitest';
import { gridFromItems, rootItems, replaceRootItems, insertRootColumn, mirrorGrid, runBlind,
  setGridBlind, gridLeaves, edgeLeaves, isGridShape, LEAF_KINDS } from '../grid.js';
import { findCell, findLeaf, splitGridCell, removeGridCell, equalizeGridCells, unsplitGridCell,
  setGridTrackSize } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const INSET = { cabinetStyleId: 14 };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR, style: INSET },
  { id: 'f', kind: 'filler', width: 3 },
], { left: 24, right: null });
// ROOT: cols a:col (auto), b:col (30 manual), f:col (3 manual); row r:row; leaf a has blind { left: 24 }
const S1 = splitGridCell(ROOT, 'b', 'down', 3, ids());

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('cell tree helpers', () => {
  it('splits a root cabinet down into a nested stack', () => {
    expect(S1.cols).toEqual([
      ROOT.cols[0],
      { id: 'n1:col', size: 30, sizeMode: 'manual' },
      ROOT.cols[2],
    ]);
    expect(S1.rows).toEqual(ROOT.rows);
    expect(S1.cells[1].node).toEqual({
      id: 'n1',
      cols: [AUTO('n2')],
      rows: [AUTO('n3'), AUTO('n4'), AUTO('n5')],
      cells: [
        cell(0, 0, { id: 'b', kind: 'cabinet', face: DOOR, style: INSET }),
        cell(0, 1, { id: 'n6', kind: 'cabinet', style: INSET }),
        cell(0, 2, { id: 'n7', kind: 'cabinet', style: INSET }),
      ],
    });
    expect(rootItems(S1)[1]).toEqual({
      id: 'n1', kind: 'cabinet', width: 30, grid: S1.cells[1].node,
    });
    expect(isGridShape(S1, isLeaf)).toBe(true);
    expect(runBlind({ grid: S1 })).toEqual({ left: 24, right: null });
  });

  it('splits flat in the same direction', () => {
    const flat = splitGridCell(setGridTrackSize(S1, 'n4', 12),
      'n6', 'down', 2, ids('m')).cells[1].node;
    expect(flat.rows).toEqual([AUTO('n3'), AUTO('n4'), AUTO('m1'), AUTO('n5')]);
    expect(flat.cells.map((entry) => [entry.row, entry.node.id])).toEqual([
      [0, 'b'], [1, 'n6'], [2, 'm2'], [3, 'n7'],
    ]);
    expect(flat.cells[2].node).toEqual({ id: 'm2', kind: 'cabinet', style: INSET });
  });

  it('nests across inside a stack', () => {
    expect(splitGridCell(S1, 'n7', 'across', 2, ids('m')).cells[1].node
      .cells[2].node).toEqual({
      id: 'm1',
      cols: [AUTO('m3'), AUTO('m4')],
      rows: [AUTO('m2')],
      cells: [
        cell(0, 0, { id: 'n7', kind: 'cabinet', style: INSET }),
        cell(1, 0, { id: 'm5', kind: 'cabinet', style: INSET }),
      ],
    });
  });

  it('splits a root cabinet across into root columns', () => {
    const across = splitGridCell(ROOT, 'b', 'across', 3, ids());
    expect(rootItems(across)).toEqual([
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'b', kind: 'cabinet', width: null, face: DOOR, style: INSET },
      { id: 'n1', kind: 'cabinet', width: null, style: INSET },
      { id: 'n2', kind: 'cabinet', width: null, style: INSET },
      { id: 'f', kind: 'filler', width: 3 },
    ]);
    expect(runBlind({ grid: across })).toEqual({ left: 24, right: null });
    expect(rootItems(splitGridCell(ROOT, 'a', 'across', 2, ids())).map((item) => item.id))
      .toEqual(['a', 'n1', 'b', 'f']);
  });

  it("leaves alone what it can't split", () => {
    expect(splitGridCell(ROOT, 'f', 'down', 2, ids())).toBe(ROOT);
    expect(splitGridCell(ROOT, 'zz', 'down', 2, ids())).toBe(ROOT);
    expect(splitGridCell(ROOT, 'b', 'sideways', 2, ids())).toBe(ROOT);
    expect(splitGridCell(ROOT, 'b', 'down', NaN, ids())).toBe(ROOT);
    expect(splitGridCell(S1, 'n1', 'down', 2, ids())).toBe(S1);
    expect(splitGridCell(ROOT, 'b', 'down', 20, ids()).cells[1].node.rows).toHaveLength(8);
    expect(splitGridCell(ROOT, 'b', 'down', 1.4, ids()).cells[1].node.rows).toHaveLength(2);
  });

  it('a blind follows the outer edge', () => {
    const B = splitGridCell(ROOT, 'a', 'down', 2, ids());
    expect(findLeaf(B, 'a').blind).toEqual({ left: 24 });
    expect(findLeaf(B, 'n5').blind).toEqual({ left: 24 });
    expect(runBlind({ grid: B })).toEqual({ left: 24, right: null });
    const B2 = splitGridCell(B, 'n5', 'across', 2, ids('m'));
    expect(findLeaf(B2, 'n5').blind).toEqual({ left: 24 });
    expect(findLeaf(B2, 'm5')).not.toHaveProperty('blind');
    const set = setGridBlind(B2, 'left', 30);
    expect(findLeaf(set, 'a').blind).toEqual({ left: 30 });
    expect(findLeaf(set, 'n5').blind).toEqual({ left: 30 });
    expect(findLeaf(set, 'm5')).not.toHaveProperty('blind');
    const cleared = setGridBlind(B2, 'left', null);
    expect(gridLeaves(cleared).some((leaf) => 'blind' in leaf)).toBe(false);
    expect(runBlind({ grid: cleared })).toBeUndefined();
  });

  it('removes a cell and collapses a stack of one', () => {
    const less = removeGridCell(S1, 'n6');
    expect(less.cells[1].node.rows).toEqual([AUTO('n3'), AUTO('n5')]);
    expect(less.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'n7']]);
    expect(removeGridCell(less, 'n7')).toEqual(ROOT);
    expect(rootItems(removeGridCell(ROOT, 'f')).map((item) => item.id)).toEqual(['a', 'b']);
    expect(removeGridCell(S1, 'n1')).toBe(S1);
  });

  it('collapsing flattens a same-axis grid', () => {
    let grid = splitGridCell(S1, 'n6', 'across', 2, ids('m'));
    grid = splitGridCell(grid, 'm5', 'down', 2, ids('k'));
    grid = removeGridCell(grid, 'n6');
    expect(grid.cells[1].node.rows.map((track) => track.id))
      .toEqual(['n3', 'k3', 'k4', 'n5']);
    expect(grid.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'm5'], [2, 'k5'], [3, 'n7']]);
    expect(isGridShape(grid, isLeaf)).toBe(true);
  });

  it('sizes and equalizes tracks', () => {
    const sized = setGridTrackSize(S1, 'n4', 12);
    expect(sized.cells[1].node.rows[1]).toEqual({ id: 'n4', size: 12, sizeMode: 'manual' });
    expect(setGridTrackSize(sized, 'n4', null)).toEqual(S1);
    expect(equalizeGridCells(sized, 'n7')).toEqual(S1);
    expect(setGridTrackSize(S1, 'n4', 0)).toBe(S1);
    expect(setGridTrackSize(S1, 'n4', -2)).toBe(S1);
    expect(setGridTrackSize(S1, 'n4', NaN)).toBe(S1);
    expect(setGridTrackSize(S1, 'zz', 12)).toBe(S1);
    expect(setGridTrackSize(ROOT, 'a:col', 20).cols[0])
      .toEqual({ id: 'a:col', size: 20, sizeMode: 'manual' });
    expect(equalizeGridCells(ROOT, 'a')).toBe(ROOT);
  });

  it('unsplits to the chosen cell', () => {
    const one = unsplitGridCell(S1, 'n6');
    expect(one.cells[1].node).toEqual({ id: 'n6', kind: 'cabinet', style: INSET });
    expect(one.cols[1]).toEqual({ id: 'n6:col', size: 30, sizeMode: 'manual' });
    expect(unsplitGridCell(splitGridCell(S1, 'n7', 'across', 2, ids('m')), 'm5')
      .cells[1].node.cells[2].node).toEqual({ id: 'm5', kind: 'cabinet', style: INSET });
    expect(unsplitGridCell(ROOT, 'a')).toBe(ROOT);
  });

  it('finds cells and leaves', () => {
    expect(findCell(S1, 'n6')).toMatchObject({
      cellIndex: 1, depth: 1, axis: 'row', track: AUTO('n4'),
    });
    expect(findCell(S1, 'n6').parent).toBe(S1.cells[1].node);
    expect(findCell(S1, 'a')).toMatchObject({
      cellIndex: 0, depth: 0, axis: 'col', track: ROOT.cols[0],
    });
    expect(findCell(S1, 'a').parent).toBe(S1);
    expect(findCell(S1, 'n1')).toMatchObject({ cellIndex: 1, depth: 0, axis: 'col' });
    expect(findCell(S1, 'zz')).toBeNull();
    expect(findLeaf(S1, 'n7')).toEqual({ id: 'n7', kind: 'cabinet', style: INSET });
    expect(findLeaf(S1, 'n1')).toBeNull();
    expect(findLeaf(S1, 'zz')).toBeNull();
  });

  it('lists leaves and edge leaves', () => {
    expect(gridLeaves(S1).map((leaf) => leaf.id)).toEqual(['a', 'b', 'n6', 'n7', 'f']);
    expect(gridLeaves(S1)[1]).toBe(S1.cells[1].node.cells[0].node);
    const B = splitGridCell(ROOT, 'a', 'down', 2, ids());
    const B2 = splitGridCell(B, 'n5', 'across', 2, ids('m'));
    expect(edgeLeaves(B2.cells[0].node, 'left').map((leaf) => leaf.id)).toEqual(['a', 'n5']);
    expect(edgeLeaves(B2.cells[0].node, 'right').map((leaf) => leaf.id)).toEqual(['a', 'm5']);
    expect(edgeLeaves(ROOT.cells[1].node, 'left')).toEqual([ROOT.cells[1].node]);
  });

  it('root helpers carry split columns', () => {
    expect(replaceRootItems(S1, rootItems(S1))).toEqual(S1);
    const inserted = insertRootColumn(S1, 0, { id: 'z', kind: 'cabinet', width: null });
    expect(inserted.cols[2].id).toBe('n1:col');
    expect(inserted.cells[2].node).toEqual(S1.cells[1].node);
    expect(mirrorGrid(S1).cols.map((col) => col.id)).toEqual(['f:col', 'n1:col', 'a:col']);
    deepFreeze(ROOT);
    deepFreeze(S1);
    expect(() => {
      findCell(S1, 'n6');
      findLeaf(S1, 'n6');
      splitGridCell(S1, 'n6', 'down', 2, ids('x'));
      removeGridCell(S1, 'n6');
      equalizeGridCells(setGridTrackSize(S1, 'n4', 12), 'n6');
      unsplitGridCell(S1, 'n6');
      setGridTrackSize(S1, 'n4', 12);
    }).not.toThrow();
  });
});
