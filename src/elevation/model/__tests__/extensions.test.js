import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { findLeaf, setGridCellKind, setGridLeafExtend, splitGridCell } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { extendDirections, isExtend } from '../extensions.js';
import { gridFromItems } from '../grid.js';
import { splitRun } from '../splitRun.js';

const S = DEFAULT_SETTINGS;
const FLOOR = { down: { to: 'floor' } };
const CEILING = { up: { to: 'ceiling' } };
const ids = () => { let n = 0; return () => `n${++n}`; };

describe('SPEC-35.3 extension shape', () => {
  it('validates extensions and says which way a piece can extend', () => {
    expect(isExtend(undefined)).toBe(true);
    expect(isExtend(FLOOR)).toBe(true);
    expect(isExtend({ up: { to: 'ceiling' }, down: { to: 'run', runId: 'b' } })).toBe(true);
    expect(isExtend({ left: { to: 'by', amount: 3 } })).toBe(true);
    expect(isExtend({})).toBe(false);
    expect(isExtend({ down: { to: 'ceiling' } })).toBe(false);
    expect(isExtend({ down: { to: 'by', amount: 0 } })).toBe(false);
    expect(isExtend({ down: { to: 'run' } })).toBe(false);
    expect(isExtend({ down: { to: 'floor', amount: 2 } })).toBe(false);
    expect(isExtend({ sideways: { to: 'floor' } })).toBe(false);

    expect(extendDirections({ kind: 'end_panel' })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'filler' })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'panel', width: 0.75, height: 30, depth: 24 })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'panel', width: 30, height: 0.75, depth: 24 })).toEqual(['left', 'right']);
    expect(extendDirections({ kind: 'panel', width: 30, height: 30, depth: 0.75 })).toEqual([]);
    expect(extendDirections({ kind: 'cabinet', width: 30, height: 30, depth: 24 })).toEqual([]);
  });

  it('carries extensions onto pieces and sets them on panels and fillers only', () => {
    const run = {
      id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 48, z: 4, height: 30.5, depth: 24,
      ends: { left: { type: 'end_panel', width: null, extend: FLOOR }, right: { type: 'none', width: null } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false },
      grid: gridFromItems('r', [
        { id: 'f', kind: 'filler', width: 3, extend: CEILING },
        { id: 'c', kind: 'cabinet', width: null },
      ]),
    };
    expect(splitRun(run, S).pieces.map(({ id, extend }) => [id, extend])).toEqual([
      ['r:left', FLOOR], ['f', CEILING], ['c', undefined],
    ]);

    let grid = setGridCellKind(splitGridCell(run.grid, 'c', 'down', 2, ids()), 'c', 'panel');
    grid = setGridLeafExtend(grid, 'c', 'up', { to: 'by', amount: 6 });
    expect(findLeaf(grid, 'c')).toEqual({ id: 'c', kind: 'panel', extend: { up: { to: 'by', amount: 6 } } });
    const split = { ...run, grid };
    const piece = cellPieces(split, splitRun(split, S)).pieces.find(({ id }) => id === 'c');
    expect(piece.extend).toEqual({ up: { to: 'by', amount: 6 } });

    const cleared = setGridLeafExtend(run.grid, 'f', 'up', null);
    expect(findLeaf(cleared, 'f')).toEqual({ id: 'f', kind: 'filler' });
    expect(setGridLeafExtend(run.grid, 'f', 'down', { to: 'ceiling' })).toBe(run.grid);
    expect(setGridLeafExtend(run.grid, 'f', 'down', null)).toBe(run.grid);
    expect(setGridLeafExtend(run.grid, 'c', 'up', CEILING.up)).toBe(run.grid);
  });
});
