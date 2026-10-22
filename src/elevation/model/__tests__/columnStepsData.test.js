import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import {
  LEAF_KINDS, cloneGrid, gridFromItems, isGridShape, mirrorGrid,
  replaceRootItems, rootItems, runItems, updateRootItem,
} from '../grid.js';
import { isRoom } from '../../store/persistence.js';

const items = ['A', 'B', 'C'].map((id) => ({ id, kind: 'cabinet', width: null }));
const top = { value: 2, source: 'manual' };
const bottom = { value: 3, source: 'manual' };
const isLeaf = (node) => LEAF_KINDS.includes(node.kind);
const makeGrid = () => gridFromItems('r', items);

describe('ST1 step a column offset data', () => {
  it('anchor 1: updates offsets on the column and exposes them on the root item', () => {
    const grid = makeGrid();
    const updated = updateRootItem(grid, 'B', { top, bottom });
    expect(updated.cols[1]).toMatchObject({ top, bottom });
    expect(rootItems(updated)[1]).toEqual({ ...items[1], top, bottom });
    expect(updated.cells[1].node).toEqual({ id: 'B', kind: 'cabinet' });
    expect(grid.cols[1]).not.toHaveProperty('top');
    expect(grid.cols[1]).not.toHaveProperty('bottom');
    expect(updateRootItem(updated, 'B', { top, bottom })).toBe(updated);
  });

  it('anchor 2: undefined removes the column keys', () => {
    const updated = updateRootItem(makeGrid(), 'B', { top, bottom });
    const clearedTop = updateRootItem(updated, 'B', { top: undefined });
    expect(clearedTop.cols[1]).not.toHaveProperty('top');
    expect(rootItems(clearedTop)[1]).not.toHaveProperty('top');
    expect(clearedTop.cols[1].bottom).toEqual(bottom);
    const cleared = updateRootItem(clearedTop, 'B', { bottom: undefined });
    expect(cleared).toEqual(makeGrid());
  });

  it('anchor 3: accepts only finite positive manual offsets for either track key', () => {
    expect(isGridShape(makeGrid(), isLeaf)).toBe(true);
    expect(isGridShape(updateRootItem(makeGrid(), 'B', { top, bottom }), isLeaf)).toBe(true);
    const invalid = [
      { value: -1, source: 'manual' },
      { value: 0, source: 'manual' },
      { value: 2, source: 'segment' },
      ...[NaN, Infinity, -Infinity, '2', null, undefined].map((value) => ({ value, source: 'manual' })),
      { value: 2 }, { source: 'manual' }, { value: 2, source: 'other' },
      { value: 2, source: 'manual', extra: true }, null, 2, 'manual', [],
    ];
    for (const key of ['top', 'bottom']) {
      for (const offset of invalid) {
        const grid = updateRootItem(makeGrid(), 'B', { [key]: offset });
        expect(isGridShape(grid, isLeaf), `${key}: ${JSON.stringify(offset)}`).toBe(false);
      }
    }
  });

  it('anchor 4: cloning deep copies both offset objects', () => {
    const grid = updateRootItem(makeGrid(), 'B', { top, bottom });
    const cloned = cloneGrid(grid);
    expect(cloned).toEqual(grid);
    cloned.cols[1].top.value = 7;
    cloned.cols[1].bottom.value = 8;
    expect(grid.cols[1].top.value).toBe(2);
    expect(grid.cols[1].bottom.value).toBe(3);
  });

  it('anchor 5: mirroring keeps offsets with the column id', () => {
    const grid = updateRootItem(makeGrid(), 'B', { top, bottom });
    const mirrored = mirrorGrid(grid);
    expect(mirrored.cols.find((col) => col.id === 'B:col')).toMatchObject({ top, bottom });
    expect(rootItems(mirrored).find((item) => item.id === 'B')).toMatchObject({ top, bottom });
    expect(rootItems(mirrored).map((item) => item.id)).toEqual(['C', 'B', 'A']);
    expect(mirrorGrid(mirrored)).toEqual(grid);
  });

  it('moves item offsets to tracks for leaves and nested grids while preserving legacy items', () => {
    const nested = gridFromItems('nested', items.slice(0, 2));
    const source = [
      { ...items[0], top, bottom },
      { id: nested.id, kind: 'cabinet', width: null, grid: nested, top, bottom },
    ];
    const grid = gridFromItems('r', source);
    expect(grid.cols.every((col) => col.top === top && col.bottom === bottom)).toBe(true);
    expect(grid.cells[0].node).toEqual({ id: 'A', kind: 'cabinet' });
    expect(grid.cells[1].node).toBe(nested);
    expect(rootItems(grid)).toEqual(source);
    expect(replaceRootItems(grid, rootItems(grid))).toEqual(grid);
    expect(runItems({ items: source })).toBe(source);
    expect(updateRootItem(grid, nested.id, { top: undefined }).cells[1].node).toBe(nested);
  });

  it('persists valid offsets on every root kind and rejects invalid track offsets', () => {
    const run = {
      id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 96, z: 4, height: 30.5,
      depth: 24, ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false }, grid: makeGrid(),
    };
    const room = {
      id: 'room', name: 'Room', profile: {}, wallOrder: ['wall'], walls: [{
        id: 'wall', name: '', numberOverride: null, elevationForced: false,
        x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {}, openings: [], runs: [run],
      }],
    };
    expect(isRoom(room)).toBe(true);
    for (const kind of LEAF_KINDS) {
      const item = { id: 'B', kind, width: 24, top, bottom,
        ...(kind === 'shelves' ? { shelves: { count: 2, back: false } } : {}) };
      run.grid = gridFromItems('r', [item]);
      const saved = JSON.parse(JSON.stringify(room));
      expect(isRoom(saved), kind).toBe(true);
      expect(rootItems(saved.walls[0].runs[0].grid)[0]).toEqual(item);
      for (const key of ['top', 'bottom']) {
        const invalid = structuredClone(saved);
        invalid.walls[0].runs[0].grid.cols[0][key] = { value: 2, source: 'segment' };
        expect(isRoom(invalid), `${kind}: ${key}`).toBe(false);
      }
    }
  });
});
