import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, CABINET_TYPE_IDS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { cellPieces } from '../cells.js';
import { splitRun } from '../splitRun.js';
import { findLeaf, setGridCellBaseUnder, setGridCellKind, setGridPanelType } from '../cellTree.js';
import { floorOpenings } from '../floorOpenings.js';

const cell = (row, node) => ({ col: 0, row, colSpan: 1, rowSpan: 1, node });
const auto = (id) => ({ id, size: null, sizeMode: 'auto' });

function desk({ panels = true, topVoid = false } = {}) {
  const opening = { id: 'opening', kind: 'void' };
  const drawer = { id: 'drawer', kind: 'cabinet' };
  const middle = {
    id: 'middle', cols: [auto('middle:col')],
    rows: [{ id: 'top', size: 4, sizeMode: 'manual' }, auto('bottom')],
    cells: [cell(0, topVoid ? opening : drawer), cell(1, topVoid ? drawer : opening)],
  };
  return {
    id: 'desk', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60,
    z: 4, height: 24, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    grid: gridFromItems('desk', [
      { id: 'left', kind: 'cabinet', width: 18 },
      ...(panels ? [{ id: 'left-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'middle', kind: 'cabinet', width: panels ? 22.5 : 24, grid: middle },
      ...(panels ? [{ id: 'right-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'right', kind: 'cabinet', width: null },
    ]),
  };
}

function openings(run) {
  return floorOpenings(run, cellPieces(run, splitRun(run, DEFAULT_SETTINGS)));
}

describe('floor openings data shape', () => {
  it('finds the desk opening between full-height side panels (anchor 1)', () => {
    expect(openings(desk())).toEqual([
      { pieceId: 'opening', x: 18.75, width: 22.5, left: 'panel', right: 'panel', baseUnder: false },
    ]);
  });

  it('finds the desk opening between cabinets without panels (anchor 2)', () => {
    expect(openings(desk({ panels: false }))).toEqual([
      { pieceId: 'opening', x: 18, width: 24, left: 'cabinet', right: 'cabinet', baseUnder: false },
    ]);
  });

  it('ignores the void above the bottom drawer (anchor 3)', () => {
    expect(openings(desk({ topVoid: true }))).toEqual([]);
  });

  it('sets and clears the leaf override, preserving it for panels and dropping it for other kinds', () => {
    const run = desk();
    const before = run.grid;
    run.grid = setGridCellBaseUnder(before, 'opening', true);
    expect(findLeaf(before, 'opening')).not.toHaveProperty('baseUnder');
    expect(openings(run)[0].baseUnder).toBe(true);
    expect(setGridCellBaseUnder(run.grid, 'opening', true)).toBe(run.grid);
    for (const id of ['left', 'middle', 'missing']) {
      expect(setGridCellBaseUnder(run.grid, id, true)).toBe(run.grid);
    }
    expect(setGridCellBaseUnder(run.grid, 'opening', 'true')).toBe(run.grid);
    for (const value of [false, null]) {
      expect(findLeaf(setGridCellBaseUnder(run.grid, 'opening', value), 'opening'))
        .not.toHaveProperty('baseUnder');
    }
    const panel = setGridPanelType(setGridCellKind(run.grid, 'opening', 'panel'), 'opening', 'back', 0.75);
    expect(findLeaf(panel, 'opening').baseUnder).toBe(true);
    expect(findLeaf(setGridCellBaseUnder(panel, 'opening', false), 'opening')).not.toHaveProperty('baseUnder');
    for (const kind of ['cabinet', 'shelves']) {
      expect(findLeaf(setGridCellKind(panel, 'opening', kind), 'opening')).not.toHaveProperty('baseUnder');
    }
    const rootPanel = setGridCellBaseUnder(before, 'left-panel', true);
    expect(findLeaf(rootPanel, 'left-panel').baseUnder).toBe(true);
    expect(findLeaf(setGridCellBaseUnder(rootPanel, 'left-panel', null), 'left-panel'))
      .not.toHaveProperty('baseUnder');
  });

  it('includes back panels, sorts openings, and reports only neighbours touching the bottom', () => {
    const run = desk();
    run.grid = setGridCellBaseUnder(run.grid, 'opening', true);
    const piece = (id, kind, x, width, extra = {}) => ({ id, kind, x, width, z: 4, height: 24, depth: 24, ...extra });
    const pieces = [
      piece('back', 'panel', 30, 20, { depth: 0.75 }),
      piece('end', 'end_panel', 50, 0.75),
      piece('opening', 'void', 0, 18),
      piece('upper', 'cabinet', 18, 12, { z: 8 }),
      piece('top', 'panel', 20, 10, { height: 0.75 }),
      piece('side', 'panel', 18, 0.75),
    ];
    expect(floorOpenings(run, { pieces })).toEqual([
      { pieceId: 'opening', x: 0, width: 18, baseUnder: true, left: null, right: 'panel' },
      { pieceId: 'back', x: 30, width: 20, baseUnder: false, left: null, right: 'panel' },
    ]);
    expect(floorOpenings({ z: 4 }, { pieces: [piece('open', 'void', 0, 60)] })[0])
      .toMatchObject({ baseUnder: false, left: null, right: null });
    expect(floorOpenings(run, { pieces: [
      piece('opening', 'void', 0, 18), piece('gap', 'cabinet', 18.25, 12),
    ] })[0].right).toBeNull();
    expect(floorOpenings({ ...run, grid: setGridPanelType(
      setGridCellKind(run.grid, 'opening', 'panel'), 'opening', 'back', 0.75,
    ) }, { pieces: [piece('opening', 'panel', 0, 18, { depth: 0.75 })] })[0].baseUnder)
      .toBe(true);
  });
});
