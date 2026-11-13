import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { findLeaf, setGridCellKind, setGridPanelDoors, setGridPanelType } from '../cellTree.js';
import { cellCaptureSides, cellDepth, cellPieces, coveredSides, hingeStops } from '../cells.js';

const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const panel = (id, x, z, width, height, extra = {}) => ({ id, kind: 'panel', x, z, width, height, depth: 24, ...extra });
const CAB = { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 29.25, depth: 24 };
const COVER_L = panel('L', 0, 0, 0.75, 30, { doors: 'cover' });
const COVER_T = panel('T', 0.75, 29.25, 20, 0.75, { doors: 'cover' });
const FLUSH_R = panel('R', 20.75, 0, 0.75, 30);

describe('SPEC-34.2 panel doors', () => {
  it('finds covered sides and hinge stops', () => {
    const pieces = [COVER_L, CAB, COVER_T, FLUSH_R];
    expect(coveredSides(pieces, 'c')).toEqual({ top: 0.75, bottom: 0, left: 0.75, right: 0 });
    expect(hingeStops(pieces, 'c')).toEqual({ left: false, right: true });
    expect(cellCaptureSides(pieces, 'c')).toEqual({ left: false, right: true });
    const filler = { id: 'F', kind: 'filler', x: 20.75, z: 0, width: 3, height: 30, depth: 24 };
    expect(hingeStops([COVER_L, CAB, filler], 'c')).toEqual({ left: false, right: true });
    expect(coveredSides(pieces, 'zz')).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('derives a panel\'s depth from its doors', () => {
    expect(cellDepth(FLUSH_R, { id: 'R', kind: 'panel' }, 24, DEFAULT_SETTINGS)).toBe(24.875);
    expect(cellDepth(COVER_L, { id: 'L', kind: 'panel', doors: 'cover' }, 24, DEFAULT_SETTINGS)).toBe(24);
    expect(cellDepth(COVER_T, { id: 'T', kind: 'panel' }, 24, DEFAULT_SETTINGS)).toBe(24.875);
    const back = panel('B', 0, 0, 20, 30, { depth: 0.75 });
    expect(cellDepth(back, { id: 'B', kind: 'panel', depth: 0.75 }, 24, DEFAULT_SETTINGS)).toBe(0.75);
    expect(cellDepth(FLUSH_R, { id: 'R', kind: 'panel', depth: 12 }, 24, DEFAULT_SETTINGS)).toBe(12);
    expect(cellDepth(CAB, { id: 'c', kind: 'cabinet' }, 24, DEFAULT_SETTINGS)).toBe(24);
  });

  it('carries doors onto nested pieces', () => {
    const grid = gridFromItems('r', [{ id: 'g', kind: 'cabinet', width: null, grid: {
      id: 'g', cols: [AUTO('g:c')],
      rows: [{ id: 'g:t', size: 0.75, sizeMode: 'manual' }, AUTO('g:b')],
      cells: [cell(0, 0, { id: 't', kind: 'panel', doors: 'cover' }), cell(0, 1, { id: 'c', kind: 'cabinet' })],
    } }]);
    const layout = { pieces: [{ id: 'g', kind: 'cabinet', role: 'item', cabinetTypeId: 2, x: 0, width: 30, z: 54, height: 30, depth: 12, auto: true }] };
    const { pieces } = cellPieces({ id: 'r', cabinetTypeId: 2, grid }, layout);
    expect(pieces.find(({ id }) => id === 't')).toMatchObject({ doors: 'cover', z: 83.25, height: 0.75 });
    expect(pieces.find(({ id }) => id === 'c')).not.toHaveProperty('doors');
    expect(coveredSides(pieces, 'c')).toEqual({ top: 0.75, bottom: 0, left: 0, right: 0 });
  });

  it('sets a panel\'s doors and keeps them through side/top types', () => {
    const root = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }]);
    const side = setGridPanelType(setGridCellKind(root, 'a', 'panel'), 'a', 'side', 0.75);
    const covered = setGridPanelDoors(side, 'a', 'cover');
    expect(findLeaf(covered, 'a')).toEqual({ id: 'a', kind: 'panel', doors: 'cover' });
    expect(setGridPanelDoors(covered, 'a', 'cover')).toBe(covered);
    expect(setGridPanelType(covered, 'a', 'side', 0.75)).toBe(covered);
    expect(findLeaf(setGridPanelType(covered, 'a', 'back', 0.75), 'a'))
      .toEqual({ id: 'a', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridPanelDoors(covered, 'a', 'flush'), 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(findLeaf(setGridPanelDoors(covered, 'a', null), 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(setGridPanelDoors(covered, 'a', 'x')).toBe(covered);
    expect(setGridPanelDoors(root, 'a', 'cover')).toBe(root);
  });
});
