import { describe, expect, it } from 'vitest';
import { cellBlindSides, gridFromItems, gridLeaves, insertRootColumn, mirrorGrid, resizeGridBlind,
  runBlind, setGridBlind, setGridCellBlind } from '../grid.js';
import { removeGridCell, splitGridCell, unsplitGridCell } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30 },
  { id: 'f', kind: 'filler', width: 3 },
], { left: 24, right: null });
// a split down into a / n6 / n7 (grid n1); all three carry blind { left: 24 }
const B = splitGridCell(ROOT, 'a', 'down', 3, ids());
// only the top cell 'a' stays blind
const C = setGridCellBlind(setGridCellBlind(B, 'n6', 'left', null), 'n7', 'left', null);
const blindIds = (grid) => gridLeaves(grid).filter((leaf) => leaf.blind).map((leaf) => leaf.id);
const leaf = (grid, id) => gridLeaves(grid).find((entry) => entry.id === id);

describe('SPEC-34 blind per cell', () => {
  it('sets and clears one cell\'s blind', () => {
    expect(blindIds(B)).toEqual(['a', 'n6', 'n7']);
    expect(blindIds(C)).toEqual(['a']);
    expect(runBlind({ grid: C })).toEqual({ left: 24, right: null });
    expect(leaf(setGridCellBlind(C, 'n6', 'left', 30), 'n6').blind).toEqual({ left: 30 });
    expect(leaf(C, 'n6')).not.toHaveProperty('blind');
    expect(setGridCellBlind(B, 'a', 'left', 24)).toBe(B);
    expect(setGridCellBlind(B, 'b', 'left', 30)).toBe(B);
    expect(setGridCellBlind(B, 'f', 'right', 30)).toBe(B);
    expect(setGridCellBlind(B, 'zz', 'left', 30)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'up', 30)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'left', 0)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'left', Number.NaN)).toBe(B);
  });

  it('keeps each cell\'s choice through structural edits', () => {
    expect(blindIds(splitGridCell(C, 'n7', 'down', 2, ids('m')))).toEqual(['a']);
    expect(blindIds(splitGridCell(C, 'a', 'down', 2, ids('m')))).toEqual(['a', 'm2']);
    expect(blindIds(removeGridCell(C, 'n6'))).toEqual(['a']);
    expect(blindIds(removeGridCell(C, 'a'))).toEqual([]);
    expect(runBlind({ grid: removeGridCell(C, 'a') })).toBeUndefined();
    expect(blindIds(unsplitGridCell(C, 'n6'))).toEqual([]);
    expect(blindIds(insertRootColumn(C, 1, { id: 'z', kind: 'cabinet', width: null }))).toEqual(['a']);
    const front = insertRootColumn(C, 0, { id: 'z', kind: 'cabinet', width: null });
    expect(blindIds(front)).toEqual(['z']);
    expect(leaf(front, 'z').blind).toEqual({ left: 24 });
    expect(leaf(mirrorGrid(C), 'a').blind).toEqual({ right: 24 });
  });

  it('lists the outer sides a cell touches', () => {
    expect(cellBlindSides(B, 'a')).toEqual(['left']);
    expect(cellBlindSides(B, 'n6')).toEqual(['left']);
    expect(cellBlindSides(B, 'b')).toEqual([]);
    expect(cellBlindSides(B, 'f')).toEqual(['right']);
    expect(cellBlindSides(B, 'zz')).toEqual([]);
    expect(cellBlindSides(gridFromItems('s', [{ id: 'x', kind: 'cabinet', width: null }]), 'x'))
      .toEqual(['left', 'right']);
  });

  it('resizes only the blind cells from the run field', () => {
    const resized = resizeGridBlind(C, 'left', 30);
    expect(blindIds(resized)).toEqual(['a']);
    expect(leaf(resized, 'a').blind).toEqual({ left: 30 });
    const spread = resizeGridBlind(setGridBlind(B, 'left', null), 'left', 30);
    expect(blindIds(spread)).toEqual(['a', 'n6', 'n7']);
    expect(leaf(spread, 'n7').blind).toEqual({ left: 30 });
    expect(blindIds(resizeGridBlind(C, 'left', null))).toEqual([]);
  });
});
