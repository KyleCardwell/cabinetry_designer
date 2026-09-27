import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { findLeaf, setGridCellKind, setGridLeafExtend, splitGridCell } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { extendDirections, extendedEndPiece, extendPieces, followInset, isExtend } from '../extensions.js';
import { gridFromItems } from '../grid.js';
import { jointEndTypes } from '../joints.js';
import { resolveRunAnchorDatum } from '../room.js';
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

describe('SPEC-35.3 extending pieces', () => {
  const { BASE, UPPER } = CABINET_TYPE_IDS;
  const P = { id: 'P', cabinetTypeId: UPPER, x: 0, width: 60, z: 36, height: 48 };
  const B = { id: 'B', cabinetTypeId: BASE, x: 0.75, width: 58.5, z: 4, height: 30.5 };
  const WALL = {
    id: 'A', x1: 0, y1: 0, x2: 60, y2: 0, height: 96, openings: [],
    soffits: [{ id: 's', x: 0, width: 60, bottom: 84 }],
    runs: [P, B],
  };

  it('grows to the floor, a run, the ceiling, the wall end or by a distance', () => {
    const panels = [
      { id: 'P:left', kind: 'end_panel', x: 0, z: 36, width: 0.75, height: 48, extend: FLOOR },
      { id: 'P:right', kind: 'end_panel', x: 59.25, z: 36, width: 0.75, height: 48,
        extend: { down: { to: 'run', runId: 'B' } } },
      { id: 'back', kind: 'panel', x: 0.75, z: 36, width: 58.5, height: 48, depth: 0.75 },
    ];
    const above = extendPieces(WALL, P, panels);
    expect(above.warnings).toEqual([]);
    expect(above.pieces[0]).toMatchObject({ z: 0, height: 84, extended: ['down'] });
    expect(above.pieces[1]).toMatchObject({ z: 4, height: 80, extended: ['down'] });
    expect(above.pieces[2]).toBe(panels[2]);

    const below = extendPieces(WALL, B, [
      { id: 'f', kind: 'filler', x: 30, z: 4, width: 3, height: 30.5, extend: CEILING },
      { id: 'g', kind: 'filler', x: 10, z: 4, width: 3, height: 30.5, extend: { down: { to: 'by', amount: 4 } } },
    ]);
    expect(below.pieces[0]).toMatchObject({ z: 4, height: 80, extended: ['up'] });
    expect(below.pieces[1]).toMatchObject({ z: 0, height: 34.5, extended: ['down'] });

    const T = { id: 'T', cabinetTypeId: UPPER, x: 12, width: 36, z: 36, height: 24.75 };
    const [top] = extendPieces(WALL, T, [{
      id: 't', kind: 'panel', x: 12, z: 60, width: 36, height: 0.75, depth: 24,
      extend: { left: { to: 'wall' }, right: { to: 'by', amount: 6 } },
    }]).pieces;
    expect(top).toMatchObject({ x: 0, width: 54, extended: ['left', 'right'] });
  });

  it('warns and leaves the piece when it can\'t extend', () => {
    const { pieces, warnings } = extendPieces(WALL, P, [
      { id: 'mid', kind: 'panel', x: 20, z: 50, width: 0.75, height: 10, depth: 24, extend: FLOOR },
      { id: 'side', kind: 'panel', x: 0.75, z: 36, width: 0.75, height: 48, depth: 24,
        extend: { left: { to: 'wall' } } },
      { id: 'gone', kind: 'end_panel', x: 0, z: 36, width: 0.75, height: 48,
        extend: { down: { to: 'run', runId: 'X' } } },
      { id: 'short', kind: 'end_panel', x: 59.25, z: 36, width: 0.75, height: 48, extend: CEILING },
    ]);
    expect(warnings.map(({ code, pieceId, direction }) => [code, pieceId, direction])).toEqual([
      ['extend-blocked', 'mid', 'down'],
      ['extend-blocked', 'side', 'left'],
      ['extend-target-missing', 'gone', 'down'],
      ['extend-short', 'short', 'up'],
    ]);
    expect(pieces.some((piece) => piece.extended)).toBe(false);
  });
});

describe('SPEC-35.3 followers stop at extensions', () => {
  it('uses the inside face and suppresses an end when an extension covers the follower', () => {
    const leader = {
      id: 'P', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 60, z: 36, height: 48, depth: 12,
      ends: {
        left: { type: 'end_panel', width: null, extend: { down: { to: 'run', runId: 'B' } } },
        right: { type: 'end_panel', width: null, extend: { down: { to: 'run', runId: 'B' } } },
      },
      anchors: { left: false, right: false },
    };
    const follower = {
      id: 'B', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60, z: 4, height: 30.5, depth: 24,
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'end_panel', width: null },
      },
      anchors: {
        left: { to: 'follow', runId: 'P', side: 'left', offset: 0 },
        right: { to: 'follow', runId: 'P', side: 'right', offset: 0 },
      },
    };
    const wall = { id: 'A', x1: 0, y1: 0, x2: 96, y2: 0, height: 96, runs: [leader, follower] };

    expect(extendedEndPiece(wall, leader, 'left')).toMatchObject({ x: 0, z: 4, width: 0.75, height: 80 });
    expect(followInset(wall, leader, follower, 'left')).toBe(0.75);
    expect(resolveRunAnchorDatum({ walls: [wall] }, wall, follower, 'left', S).x).toBe(0.75);
    expect(extendedEndPiece(wall, leader, 'right')).toMatchObject({ x: 59.25, z: 4, width: 0.75, height: 80 });
    expect(followInset(wall, leader, follower, 'right')).toBe(-0.75);
    expect(resolveRunAnchorDatum({ walls: [wall] }, wall, follower, 'right', S).x).toBe(59.25);
    expect(jointEndTypes(wall).get('B')).toEqual({ left: 'none', right: 'none' });
  });
});
