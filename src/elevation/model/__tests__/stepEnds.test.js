import { describe, expect, it } from 'vitest';
import { cellPieces, EPSILON } from '../cells.js';
import { findLeaf } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, rootItems, updateRootItem } from '../grid.js';
import { stepEndSides } from '../index.js';
import { syncRoom } from '../roomSync.js';
import { splitRun } from '../splitRun.js';
import { ELEVATION_SCHEMA_VERSION, isRoom, roomFromDocument, toRoomDocument } from '../../store/persistence.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const manual = (value) => ({ value, source: 'manual' });
function makeRun(offsets = { top: manual(2) }) {
  return {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
    style: { cabinetStyleId: 14 }, seamGap: 0,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
      id, kind: 'cabinet', width: null, face: { type: 'door', size: null }, ...(id === 'B' ? offsets : {}),
    }))),
  };
}
function makeRoom(run) {
  return {
    id: 'room', name: 'Room', profile: {}, wallOrder: ['w'],
    walls: [{ id: 'w', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null },
      profile: {}, runs: [run], openings: [] }],
  };
}
const sync = (run) => syncRoom(makeRoom(run), S).walls[0].runs[0];
const cellsOf = (run) => cellPieces(run, splitRun(run, S));
const entry = (leafId, side, edge = 'top', z = 32.5, height = 2) => ({
  leafId, side, edge, z, height, choice: 'return', width: 6,
});
const expected = [entry('A', 'right'), entry('C', 'left')];

function nestedRun(offsets = { top: manual(2) }) {
  const run = makeRun(offsets);
  run.grid.cells[1].node = {
    id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'B:t', size: 6, sizeMode: 'manual' }, { id: 'B:b', size: null, sizeMode: 'auto' }],
    cells: ['B-top', 'B-bottom'].map((id, row) => ({
      col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet' },
    })),
  };
  run.grid = updateRootItem(run.grid, 'B', offsets);
  return run;
}

describe('ST3 step a step sides and stored choice', () => {
  it('anchor 1: derives the two top returns at z 32.5 without changing layout or input', () => {
    const run = makeRun();
    const before = structuredClone(run);
    const resolved = sync(run);
    expect(resolved._stepEnds).toEqual(expected);
    expect(cellsOf(resolved).pieces.map(({ x, width }) => [x, x + width]))
      .toEqual([[0.75, 30.25], [30.25, 59.75], [59.75, 89.25]]);
    const { _stepEnds, ...withoutSteps } = resolved;
    expect(_stepEnds).toEqual(expected);
    expect(cellsOf(resolved)).toEqual(cellsOf(withoutSteps));
    expect(run).toEqual(before);
    expect(sync(resolved)).toEqual(resolved);
  });

  it('anchor 2: omits the explicit None entry from derived data', () => {
    const run = makeRun();
    findLeaf(run.grid, 'A').stepEnds = { right: 'none' };
    const resolved = sync(run);
    expect(resolved._stepEnds).toEqual([expected[1]]);
    expect(stepEndSides(resolved, cellsOf(resolved), S)[0]).toEqual({
      leafId: 'A', side: 'right', edge: 'top', z: 32.5, height: 2, choice: 'none',
    });
  });

  it('anchor 3: uses the stored four-inch return width', () => {
    const run = makeRun();
    findLeaf(run.grid, 'A').stepEnds = { right: { type: 'return', width: 4 } };
    expect(sync(run)._stepEnds).toEqual([{ ...expected[0], width: 4 }, expected[1]]);
  });

  it('anchor 4: mirrors the step at the bottom, starting at z 4 with height 3', () => {
    expect(sync(makeRun({ bottom: manual(3) }))._stepEnds).toEqual([
      entry('A', 'right', 'bottom', 4, 3), entry('C', 'left', 'bottom', 4, 3),
    ]);
  });

  it('anchor 5: removes stale step entries in Euro runs and follows inherited leaf styles', () => {
    const run = { ...makeRun(), style: { cabinetStyleId: 13 }, _stepEnds: expected };
    expect(sync(run)).not.toHaveProperty('_stepEnds');
    delete run.style;
    const room = makeRoom(run);
    room.style = { cabinetStyleId: 13 };
    expect(syncRoom(room, S).walls[0].runs[0]).not.toHaveProperty('_stepEnds');
    findLeaf(run.grid, 'B').style = { cabinetStyleId: 13 };
    run.style = { cabinetStyleId: 14 };
    expect(sync(run)).not.toHaveProperty('_stepEnds');
  });

  it('uses the highest top and lowest bottom of stacked neighbours, sharing a side choice', () => {
    const run = nestedRun({ top: manual(2), bottom: manual(3) });
    findLeaf(run.grid, 'A').stepEnds = { right: { type: 'panel' } };
    expect(sync(run)._stepEnds).toEqual([
      { leafId: 'A', side: 'right', edge: 'top', z: 32.5, height: 2, choice: 'panel' },
      { leafId: 'A', side: 'right', edge: 'bottom', z: 4, height: 3, choice: 'panel' },
      expected[1], entry('C', 'left', 'bottom', 4, 3),
    ]);
    const loweredA = makeRun({});
    loweredA.grid = updateRootItem(loweredA.grid, 'A', { top: manual(2) });
    loweredA.grid.cells[1].node = nestedRun({}).grid.cells[1].node;
    findLeaf(loweredA.grid, 'B-top').stepEnds = { left: { type: 'return', width: 4 } };
    expect(sync(loweredA)._stepEnds).toEqual([
      { ...entry('B-top', 'left'), width: 4 },
    ]);
  });

  it('rejects steps covered by any piece, equal-height neighbours, and real run ends', () => {
    for (const kind of ['void', 'shelves', 'filler', 'panel', 'cabinet']) {
      const run = nestedRun({});
      findLeaf(run.grid, 'B-top').kind = kind;
      expect(sync(run)).not.toHaveProperty('_stepEnds');
    }
    expect(sync(makeRun({}))).not.toHaveProperty('_stepEnds');
    const run = makeRun();
    run.grid.cells.splice(1);
    run.grid.cols.splice(1);
    expect(sync(run)).not.toHaveProperty('_stepEnds');
  });

  it('uses gap reach and requires a step greater than EPSILON', () => {
    const run = makeRun();
    const cells = { pieces: [
      { id: 'A', kind: 'cabinet', x: 0, width: 30, z: 4, height: 30.5 },
      { id: 'B', kind: 'cabinet', x: 30.25, width: 30, z: 4, height: 28.5 },
    ] };
    expect(stepEndSides(run, cells, S)).toEqual([]);
    cells.gaps = [{ width: 0.25, height: 30.5 }];
    expect(stepEndSides(run, cells, S)).toEqual([expected[0]]);
    cells.pieces[1].height = 30.5 - EPSILON / 2;
    expect(stepEndSides(run, cells, S)).toEqual([]);
    cells.pieces[1].height = 30.5 - EPSILON * 2;
    expect(stepEndSides(run, cells, S)).toHaveLength(1);
  });

  it('round-trips root, nested and legacy choices, strips derived data and retains inactive choices', () => {
    const run = nestedRun();
    expect(isRoom(makeRoom(run))).toBe(true);
    findLeaf(run.grid, 'A').stepEnds = { left: { type: 'return' }, right: 'none' };
    findLeaf(run.grid, 'B-top').stepEnds = { left: { type: 'panel' }, right: { type: 'return', width: 4 } };
    expect(isRoom(makeRoom(run))).toBe(true);
    const active = syncRoom(makeRoom(run), S);
    const stored = toRoomDocument(active);
    expect(stored.walls[0].runs[0]).not.toHaveProperty('_stepEnds');
    expect(stored.walls[0].runs[0]).not.toHaveProperty('_insideEnds');
    const loaded = roomFromDocument(stored, ELEVATION_SCHEMA_VERSION, S);
    expect(loaded.ok).toBe(true);
    for (const id of ['A', 'B-top']) {
      expect(findLeaf(loaded.room.walls[0].runs[0].grid, id).stepEnds)
        .toEqual(findLeaf(run.grid, id).stepEnds);
    }
    const closed = sync({ ...makeRun({}), _stepEnds: expected });
    expect(closed).not.toHaveProperty('_stepEnds');
    const legacy = makeRun();
    findLeaf(legacy.grid, 'A').stepEnds = { right: { type: 'panel' } };
    const { grid, ...base } = legacy;
    expect(sync({ ...base, items: rootItems(grid) })._stepEnds[0]).toEqual({
      leafId: 'A', side: 'right', edge: 'top', z: 32.5, height: 2, choice: 'panel',
    });
  });

  it('rejects malformed choices and nonpositive or nonfinite widths on root and nested leaves', () => {
    for (const id of ['A', 'B-top']) {
      for (const value of [null, [], 'none', { top: 'none' }, { right: 'panel' }, { right: null },
        { right: { type: 'other' } }, { right: { type: 'panel', width: 6 } },
        { right: { type: 'return', extra: true } },
        ...[0, -1, NaN, Infinity, '6', null].map((width) => ({ right: { type: 'return', width } }))]) {
        const run = nestedRun();
        findLeaf(run.grid, id).stepEnds = value;
        expect(isRoom(makeRoom(run)), JSON.stringify({ id, value })).toBe(false);
      }
    }
    const run = nestedRun();
    Object.assign(findLeaf(run.grid, 'B-top'), { kind: 'void', stepEnds: { left: 'none' } });
    expect(isRoom(makeRoom(run))).toBe(false);
  });
});
