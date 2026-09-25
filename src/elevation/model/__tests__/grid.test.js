import { describe, expect, it } from 'vitest';
import {
  LEAF_KINDS,
  cloneGrid,
  gridFromItems,
  insertRootColumn,
  isGridShape,
  mirrorGrid,
  removeRootColumn,
  replaceRootItems,
  rootItems,
  runBlind,
  runItems,
  setGridBlind,
  updateRootItem,
} from '../grid.js';

const PIN = { anchor: 'center', from: 'left', value: 60 };
const FACE = { type: 'door' };
const ITEMS = [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, pin: PIN },
  { id: 'f', kind: 'filler', width: 3 },
  { id: 'c', kind: 'cabinet', width: null, absorb: true, face: FACE, reveals: { top: 0.125 } },
];
const GRID = {
  id: 'r1:grid',
  cols: [
    { id: 'a:col', size: null, sizeMode: 'auto' },
    { id: 'b:col', size: 30, sizeMode: 'manual', pin: PIN },
    { id: 'f:col', size: 3, sizeMode: 'manual' },
    { id: 'c:col', size: null, sizeMode: 'auto', absorb: true },
  ],
  rows: [{ id: 'r1:row', size: null, sizeMode: 'auto' }],
  cells: [
    { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'a', kind: 'cabinet' } },
    { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
    { col: 2, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'f', kind: 'filler' } },
    { col: 3, row: 0, colSpan: 1, rowSpan: 1,
      node: { id: 'c', kind: 'cabinet', face: FACE, reveals: { top: 0.125 } } },
  ],
};
const BLIND_GRID = gridFromItems('r1', ITEMS, { left: 36, right: 24 });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function leaf(grid, id) {
  return grid.cells.find((cell) => cell.node.id === id).node;
}

const isLeaf = (node) => LEAF_KINDS.includes(node.kind);

describe('grid shape', () => {
  it('builds a grid from items', () => {
    expect(gridFromItems('r1', ITEMS)).toEqual(GRID);
  });

  it('builds the item view and an empty grid', () => {
    expect(rootItems(GRID)).toEqual(ITEMS);
    const empty = gridFromItems('r1', []);
    expect(rootItems(empty)).toEqual([]);
    expect(empty).toEqual({
      id: 'r1:grid',
      cols: [],
      rows: [{ id: 'r1:row', size: null, sizeMode: 'auto' }],
      cells: [],
    });
  });

  it('keeps blind out of the item view', () => {
    expect(rootItems(BLIND_GRID)).toEqual(ITEMS);
    expect(gridFromItems('r1', ITEMS, { left: null, right: null })).toEqual(GRID);
  });

  it('never mutates its inputs', () => {
    deepFreeze(ITEMS);
    deepFreeze(GRID);
    expect(() => {
      gridFromItems('r1', ITEMS, { left: 36 });
      rootItems(GRID);
      runItems({ grid: GRID });
      runBlind({ grid: GRID });
      setGridBlind(GRID, 'left', 36);
      insertRootColumn(GRID, 1, { id: 'n', kind: 'cabinet', width: null });
      removeRootColumn(GRID, 'a');
      updateRootItem(GRID, 'a', { width: 24 });
      replaceRootItems(GRID, ITEMS);
      cloneGrid(GRID);
      mirrorGrid(GRID);
      isGridShape(GRID, isLeaf);
    }).not.toThrow();
  });

  it('prefers transient run items', () => {
    expect(runItems({ items: [ITEMS[0]], grid: GRID })).toEqual([ITEMS[0]]);
    expect(runItems({ grid: GRID })).toEqual(ITEMS);
    expect(runItems({})).toEqual([]);
  });

  it('reads legacy and grid blind values', () => {
    expect(runBlind({ blind: { left: 5, right: null }, grid: BLIND_GRID }))
      .toEqual({ left: 5, right: null });
    expect(runBlind({ grid: BLIND_GRID })).toEqual({ left: 36, right: 24 });
    expect(runBlind({ grid: GRID })).toBeUndefined();
    const one = gridFromItems('r2', [ITEMS[0]], { left: 36, right: 24 });
    expect(leaf(one, 'a').blind).toEqual({ left: 36, right: 24 });
    expect(runBlind({ grid: one })).toEqual({ left: 36, right: 24 });
  });

  it('sets and clears grid blind values', () => {
    const set = setGridBlind(GRID, 'right', 24);
    expect(leaf(set, 'c').blind).toEqual({ right: 24 });
    expect(setGridBlind(set, 'right', null)).toEqual(GRID);
    expect(setGridBlind(set, 'right', 0)).toEqual(GRID);
    expect(setGridBlind(set, 'right', NaN)).toEqual(GRID);
    const empty = gridFromItems('r1', []);
    expect(setGridBlind(empty, 'left', 36)).toBe(empty);
  });

  it('inserts root columns at clamped indexes', () => {
    const item = { id: 'n', kind: 'cabinet', width: null };
    const inserted = insertRootColumn(GRID, 1, item);
    expect(inserted.cols.map((col) => col.id))
      .toEqual(['a:col', 'n:col', 'b:col', 'f:col', 'c:col']);
    expect(inserted.cells.map((cell) => cell.col)).toEqual([0, 1, 2, 3, 4]);
    expect(rootItems(inserted).map(({ id }) => id)).toEqual(['a', 'n', 'b', 'f', 'c']);
    expect(rootItems(insertRootColumn(GRID, 99, item)).map(({ id }) => id).at(-1)).toBe('n');
    expect(rootItems(insertRootColumn(GRID, -3, item)).map(({ id }) => id)[0]).toBe('n');
  });

  it('removes root columns and preserves unknown ids', () => {
    const removed = removeRootColumn(GRID, 'b');
    expect(rootItems(removed).map(({ id }) => id)).toEqual(['a', 'f', 'c']);
    expect(removed.cells.map((cell) => cell.col)).toEqual([0, 1, 2]);
    expect(removeRootColumn(GRID, 'zz')).toBe(GRID);
  });

  it('re-homes blind across structural edits', () => {
    const inserted = insertRootColumn(
      BLIND_GRID,
      0,
      { id: 'n', kind: 'cabinet', width: null },
    );
    expect(leaf(inserted, 'n').blind).toEqual({ left: 36 });
    expect(leaf(inserted, 'a')).not.toHaveProperty('blind');
    expect(runBlind({ grid: inserted })).toEqual({ left: 36, right: 24 });
    const withoutC = removeRootColumn(BLIND_GRID, 'c');
    expect(leaf(withoutC, 'f').blind).toEqual({ right: 24 });
    let empty = BLIND_GRID;
    for (const id of ['a', 'b', 'f', 'c']) empty = removeRootColumn(empty, id);
    expect(runBlind({ grid: empty })).toBeUndefined();
  });

  it('updates root items in item terms', () => {
    const manual = updateRootItem(GRID, 'a', { width: 24 });
    expect(manual.cols[0]).toEqual({ id: 'a:col', size: 24, sizeMode: 'manual' });
    expect(updateRootItem(manual, 'a', { width: null })).toEqual(GRID);
    expect(updateRootItem(GRID, 'b', { pin: null }).cols[1].pin).toBeNull();
    expect(updateRootItem(GRID, 'b', { pin: undefined }).cols[1]).not.toHaveProperty('pin');
    const face = updateRootItem(GRID, 'c', { face: { type: 'drawer' } });
    expect(leaf(face, 'c').face).toEqual({ type: 'drawer' });
    expect(face.cols[3]).toBe(GRID.cols[3]);
    expect(updateRootItem(GRID, 'zz', { width: 1 })).toBe(GRID);
  });

  it('replaces root items and preserves the grid frame', () => {
    const replaced = replaceRootItems(
      BLIND_GRID,
      [...ITEMS, { id: 'd', kind: 'cabinet', width: null }],
    );
    expect(replaced.id).toBe(BLIND_GRID.id);
    expect(replaced.rows).toEqual(BLIND_GRID.rows);
    expect(rootItems(replaced).map(({ id }) => id)).toEqual(['a', 'b', 'f', 'c', 'd']);
    expect(leaf(replaced, 'd').blind).toEqual({ right: 24 });
    expect(leaf(replaced, 'c')).not.toHaveProperty('blind');
    expect(() => replaceRootItems({ ...BLIND_GRID, rows: [...BLIND_GRID.rows, BLIND_GRID.rows[0]] }, ITEMS))
      .toThrow('replaceRootItems needs a one-row grid');
  });

  it('clones the grid to the required depth', () => {
    const cloned = cloneGrid(BLIND_GRID);
    expect(cloned).toEqual(BLIND_GRID);
    expect(cloned).not.toBe(BLIND_GRID);
    expect(cloned.cols).not.toBe(BLIND_GRID.cols);
    expect(cloned.cols[1]).not.toBe(BLIND_GRID.cols[1]);
    expect(cloned.cols[1].pin).not.toBe(BLIND_GRID.cols[1].pin);
    expect(cloned.cells).not.toBe(BLIND_GRID.cells);
    expect(cloned.cells[0]).not.toBe(BLIND_GRID.cells[0]);
    expect(cloned.cells[0].node).not.toBe(BLIND_GRID.cells[0].node);
    expect(cloned.cells[0].node.blind).not.toBe(BLIND_GRID.cells[0].node.blind);
    expect(cloned.cells[3].node.face).toBe(BLIND_GRID.cells[3].node.face);
  });

  it('mirrors columns, cells, and blind values', () => {
    const mirrored = mirrorGrid(BLIND_GRID);
    expect(mirrored.cols.map(({ id }) => id)).toEqual(['c:col', 'f:col', 'b:col', 'a:col']);
    expect(['c', 'f', 'b', 'a'].map((id) => leaf(mirrored, id)).map((node) => (
      mirrored.cells.find((cell) => cell.node === node).col
    ))).toEqual([0, 1, 2, 3]);
    expect(leaf(mirrored, 'a').blind).toEqual({ right: 36 });
    expect(leaf(mirrored, 'c').blind).toEqual({ left: 24 });
    expect(runBlind({ grid: mirrored })).toEqual({ left: 24, right: 36 });
    expect(rootItems(mirrored).map(({ id }) => id)).toEqual(['c', 'f', 'b', 'a']);
    expect(mirrorGrid(mirrored)).toEqual(BLIND_GRID);
  });

  it('validates grid structure and exact slot coverage', () => {
    const empty = gridFromItems('r1', []);
    expect(isGridShape(GRID, isLeaf)).toBe(true);
    expect(isGridShape(BLIND_GRID, isLeaf)).toBe(true);
    expect(isGridShape(empty, isLeaf)).toBe(true);
    expect(isGridShape({ ...GRID, cells: GRID.cells.slice(0, -1) }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cells: [...GRID.cells, {
        col: 0,
        row: 0,
        colSpan: 1,
        rowSpan: 1,
        node: { id: 'x', kind: 'cabinet' },
      }],
    }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cols: [{ id: 'a:col', size: 30, sizeMode: 'auto' }, ...GRID.cols.slice(1)],
    }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cols: [GRID.cols[0], { ...GRID.cols[1], sizeMode: 'auto' }, ...GRID.cols.slice(2)],
    }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cols: [{ ...GRID.cols[0], gap: -1 }, ...GRID.cols.slice(1)],
    }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cols: [{ ...GRID.cols[0], gap: 0.5 }, ...GRID.cols.slice(1)],
    }, isLeaf)).toBe(true);
    expect(isGridShape({ ...GRID, rows: [] }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cells: [{ ...GRID.cells[0], colSpan: 2 }, ...GRID.cells.slice(1)],
    }, isLeaf)).toBe(false);
    expect(isGridShape({
      ...GRID,
      cells: GRID.cells.map((cell) => (
        cell.node.id === 'f' ? { ...cell, node: { ...cell.node, kind: 'shelf' } } : cell
      )),
    }, isLeaf)).toBe(false);
    const nested = {
      id: 'n',
      cols: [{ id: 'n0', size: null, sizeMode: 'bogus' }],
      rows: [{ id: 'nr', size: null, sizeMode: 'auto' }],
      cells: [{
        col: 0,
        row: 0,
        colSpan: 1,
        rowSpan: 1,
        node: { id: 'a', kind: 'cabinet' },
      }],
    };
    const withNested = {
      ...GRID,
      cells: [{ ...GRID.cells[0], node: nested }, ...GRID.cells.slice(1)],
    };
    expect(isGridShape(withNested, isLeaf)).toBe(false);
    expect(isGridShape({
      ...withNested,
      cells: [{
        ...withNested.cells[0],
        node: {
          ...nested,
          cols: [{ ...nested.cols[0], sizeMode: 'auto' }],
        },
      }, ...withNested.cells.slice(1)],
    }, isLeaf)).toBe(true);
  });
});
