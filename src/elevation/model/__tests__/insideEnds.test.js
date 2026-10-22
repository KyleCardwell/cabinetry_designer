import { describe, expect, it } from 'vitest';
import { cellPieces, EPSILON } from '../cells.js';
import { findLeaf, splitGridCell } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS, FRAME_RETURN_WIDTH } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { insideEndSides } from '../index.js';
import { syncRoom } from '../roomSync.js';
import { splitRun } from '../splitRun.js';
import { runScene } from '../runScene.js';
import { ELEVATION_SCHEMA_VERSION, isRoom, roomFromDocument, toRoomDocument } from '../../store/persistence.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const auto = (id, kind = 'cabinet', extra = {}) => ({ id, kind, width: null, ...extra });
const panel = (leafId, side) => ({ leafId, side, choice: 'panel' });
const expected = [panel('a', 'right'), panel('c', 'left')];
const items = () => [auto('a'), auto('b', 'void'), auto('c')];
const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };

function makeRun(list = items(), extra = {}) {
  return {
    id: 'r', cabinetTypeId: 2, x: 0, width: 90, z: 30, height: 60, depth: 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false }, grid: gridFromItems('r', list), ...extra,
  };
}

function makeRoom(run) {
  return {
    id: 'room', name: 'Room', profile: {}, wallOrder: ['w'],
    walls: [{ id: 'w', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null },
      profile: {}, runs: [run], openings: [] }],
  };
}

const cellsOf = (run) => cellPieces(run, splitRun(run, S));
const sides = (run) => insideEndSides(run, cellsOf(run), S);
const syncedRun = (room) => syncRoom(room, S).walls[0].runs[0];

function stacked(kind) {
  const run = makeRun([auto('a'), auto('b'), auto('c')]);
  run.grid = splitGridCell(run.grid, 'b', 'down', 2, ids());
  Object.assign(findLeaf(run.grid, 'b'), kind === 'panel'
    ? { kind, depth: 0.75, align: 'back' } : { kind });
  findLeaf(run.grid, 'n5').kind = 'void';
  run.grid.cells[1].node.rows[0] = { id: 'n3', size: 24, sizeMode: 'manual' };
  return run;
}

describe('IE1 step a inside sides and stored choices', () => {
  it('anchor 1: opens both cabinet sides facing a void, excluding run ends', () => {
    expect(sides(makeRun())).toEqual(expected);
    expect(sides(makeRun([auto('only')]))).toEqual([]);
  });

  it('anchor 2: covers the whole 60-inch side with a 24-inch back panel over a void', () => {
    const run = stacked('panel');
    expect(cellsOf(run).pieces.find((piece) => piece.id === 'b').height).toBe(24);
    expect(sides(run)).toEqual(expected);
  });

  it('anchor 3: closes both full-height sides when a cabinet covers part of them', () => {
    expect(sides(stacked('cabinet'))).toEqual([]);
  });

  it('anchor 4: opens only the deep cabinet beside a shallower back-aligned cabinet', () => {
    expect(sides(makeRun([auto('a'), auto('b', 'cabinet', { depth: 12, align: 'back' })])))
      .toEqual([panel('a', 'right')]);
  });

  it('anchor 5: keeps faces aligned even when cabinet depths differ', () => {
    expect(sides(makeRun([auto('a'), auto('b', 'cabinet', { depth: 12, align: 'face' })]))).toEqual([]);
    expect(sides(makeRun([auto('a'), auto('b', 'cabinet', { depth: 24 - EPSILON / 2, align: 'back' })])))
      .toEqual([]);
  });

  it('anchor 6: opens the cabinet side beside shelves', () => {
    expect(sides(makeRun([auto('a'), auto('b', 'shelves', { shelves: { count: 2, back: false } })])))
      .toEqual([panel('a', 'right')]);
  });

  it('anchor 7: retains None in the choice API and derives only the other panel', () => {
    const run = makeRun();
    findLeaf(run.grid, 'a').insideEnds = { right: 'none' };
    expect(sides(run)).toEqual([{ leafId: 'a', side: 'right', choice: 'none' }, expected[1]]);
    expect(syncedRun(makeRoom(run))._insideEnds).toEqual([
      { ...expected[1], boundary: { gridId: 'r:grid', trackId: 'b:col' } },
    ]);
  });

  it('anchor 8: treats a stored return in a Euro run as an auto panel', () => {
    const run = makeRun();
    findLeaf(run.grid, 'a').insideEnds = { right: { type: 'return' } };
    expect(sides(run)).toEqual(expected);
    const room = makeRoom(run);
    room.style = { cabinetStyleId: 14 };
    const framed = syncedRun(room);
    expect(framed._insideEnds[0]).toEqual({ leafId: 'a', side: 'right', choice: 'return' });
    expect(FRAME_RETURN_WIDTH).toBe(6);
    expect(findLeaf(framed.grid, 'a').insideEnds.right).toEqual({ type: 'return' });
  });

  it('requires full coverage and closes sides beside other panel orientations, fillers and end panels', () => {
    for (const neighbour of [
      { kind: 'panel', width: 0.75, height: 60, depth: 24 },
      { kind: 'panel', width: 30, height: 0.75, depth: 24 },
      { kind: 'filler', width: 3, height: 60, depth: 24 },
      { kind: 'end_panel', width: 0.75, height: 60, depth: 24 },
      { kind: 'void', width: 30, height: 59, depth: 24 },
    ]) {
      const cabinet = { id: 'a', kind: 'cabinet', x: 0, z: 0, width: 30, height: 60, depth: 24 };
      expect(insideEndSides(makeRun(), { pieces: [cabinet, { id: 'b', x: 30, z: 0, ...neighbour }] }, S))
        .toEqual([]);
    }
    const run = makeRun();
    run.grid.cols[0].gap = 0.25;
    expect(sides(run)).toEqual(expected);
    const short = stacked('panel');
    short.grid.cells[1].node.rows[0].gap = 0.25;
    expect(sides(short)).toEqual([]);
  });

  it('records the containing boundary for root and nested leaves', () => {
    const run = makeRun([auto('a'), auto('b'), auto('c', 'void')]);
    run.grid = splitGridCell(run.grid, 'b', 'down', 2, ids());
    findLeaf(run.grid, 'n5').kind = 'void';
    run.grid = splitGridCell(run.grid, 'b', 'across', 2, ids('h'));
    findLeaf(run.grid, 'h5').kind = 'void';
    const before = cellsOf(run).pieces;
    const synced = syncedRun(makeRoom(run));
    expect(synced._insideEnds).toEqual([
      { ...panel('b', 'right'), boundary: { gridId: 'h1', trackId: 'h3' } },
    ]);
    const { _insideEnds, ...withoutPanels } = synced;
    expect(_insideEnds).toHaveLength(1);
    expect(cellsOf(withoutPanels).pieces).toEqual(before);
    const outer = makeRun([auto('a'), auto('b', 'void')]);
    outer.grid = splitGridCell(outer.grid, 'a', 'down', 2, ids());
    expect(syncedRun(makeRoom(outer))._insideEnds).toEqual(['n5', 'a'].map((leafId) => ({
      ...panel(leafId, 'right'), boundary: { gridId: 'r:grid', trackId: 'n1:col' },
    })));
    const room = makeRoom(makeRun([auto('only')]));
    room.walls[0].runs.push(makeRun([auto('other', 'void')], { id: 'other-run', x: 90 }));
    room.walls[0].runs[0]._insideEnds = expected;
    expect(syncedRun(room)).not.toHaveProperty('_insideEnds');
  });

  it('round-trips root and nested choices, strips derived entries and keeps closed-side choices', () => {
    const active = syncRoom(makeRoom(makeRun()), S);
    expect(active.walls[0].runs[0]._insideEnds).toHaveLength(2);
    expect(toRoomDocument(active).walls[0].runs[0]).not.toHaveProperty('_insideEnds');
    const run = stacked('panel');
    findLeaf(run.grid, 'a').insideEnds = { left: { type: 'return', width: 8 }, right: 'none' };
    findLeaf(run.grid, 'n5').kind = 'cabinet';
    findLeaf(run.grid, 'n5').insideEnds = { right: { type: 'return' } };
    const synced = syncRoom(makeRoom(run), S);
    const stored = toRoomDocument(synced);
    expect(stored.walls[0].runs[0]).not.toHaveProperty('_insideEnds');
    const loaded = roomFromDocument(stored, ELEVATION_SCHEMA_VERSION, S);
    expect(loaded.ok).toBe(true);
    expect(findLeaf(loaded.room.walls[0].runs[0].grid, 'a').insideEnds)
      .toEqual({ left: { type: 'return', width: 8 }, right: 'none' });
    expect(findLeaf(loaded.room.walls[0].runs[0].grid, 'n5').insideEnds)
      .toEqual({ right: { type: 'return' } });
    expect(synced.walls[0].runs[0]).not.toHaveProperty('_insideEnds');
    expect(syncRoom(synced, S)).toEqual(synced);
  });

  it('rejects malformed choices and invalid return widths on both root and nested cabinets', () => {
    for (const leafId of ['a', 'n5']) {
      for (const value of [null, [], 'none', { top: 'none' }, { right: 'panel' }, { right: null },
        { right: { type: 'other' } }, { right: { type: 'return', extra: true } },
        ...[0, -1, NaN, Infinity, '6', null].map((width) => ({ right: { type: 'return', width } }))]) {
        const room = makeRoom(stacked('cabinet'));
        findLeaf(room.walls[0].runs[0].grid, leafId).insideEnds = value;
        expect(isRoom(room), JSON.stringify({ leafId, value })).toBe(false);
      }
    }
  });
});

const EURO = { ...S, teamDoorStyle: { ...S.teamDoorStyle, thickness: 0.75 } };
const noEnds = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const solve = (run, settings = EURO) => {
  const room = syncRoom(makeRoom(run), settings);
  const wall = room.walls[0];
  const resolved = wall.runs[0];
  const layout = splitRun(resolved, settings);
  return { room, wall, run: resolved, layout, cells: cellPieces(resolved, layout) };
};

describe('IE1 step b inside panels reserve their width', () => {
  it('anchor 1: reserves two 3/4-inch panels around a manual 20-inch void in a 60-inch base', () => {
    const original = makeRun([auto('a'), auto('b', 'void', { width: 20 }), auto('c')], {
      width: 60, ends: noEnds, cabinetTypeId: CABINET_TYPE_IDS.BASE,
    });
    const { run, cells } = solve(original);
    expect(cells.pieces.map(({ id, x, width }) => [id, x, width])).toEqual([
      ['a', 0, 19.25], ['a:inside-right', 19.25, 0.75], ['b', 20, 20],
      ['c:inside-left', 40, 0.75], ['c', 40.75, 19.25],
    ]);
    expect(cells.pieces[1]).toMatchObject({
      kind: 'end_panel', inside: true, ownerId: 'a', side: 'right',
      z: run.z, height: run.height, depth: 24.8125, styleId: 'default',
    });
    expect(original).not.toHaveProperty('_insideEnds');
    expect(syncRoom(makeRoom(run), EURO).walls[0].runs[0]).toEqual(run);
  });

  it('anchor 2: shares 1 1/2 inches across all three auto columns of the 164 1/8-inch upper', () => {
    const source = { ...stacked('panel'), width: 164.125 };
    const { run, layout, cells } = solve(source);
    const { _insideEnds, ...withoutPanels } = run;
    expect(_insideEnds).toHaveLength(2);
    const before = splitRun(withoutPanels, EURO).pieces.filter((piece) => piece.role === 'item');
    const columns = layout.pieces.filter((piece) => piece.role === 'item');
    expect(columns.map((piece, index) => before[index].width - piece.width)).toEqual([0.5, 0.5, 0.5]);
    expect(columns.map((piece) => piece.width)).toEqual([53.6875, 53.6875, 53.75]);
    expect(cells.pieces.find((piece) => piece.id === 'b')).toMatchObject({ height: 24, depth: 0.75 });
    expect(cells.pieces.reduce((sum, piece) => sum + (piece.columnId ? 0 : piece.width), 0)
      + columns[1].width).toBe(164.125);
  });

  it('anchor 3: reserves one panel beside a shallower back-aligned cabinet', () => {
    const { cells } = solve(makeRun([
      auto('a'), auto('b', 'cabinet', { depth: 12, align: 'back' }),
    ], { width: 48, ends: noEnds }));
    expect(cells.pieces.map(({ id, x, width }) => [id, x, width])).toEqual([
      ['a', 0, 23.625], ['a:inside-right', 23.625, 0.75], ['b', 24.375, 23.625],
    ]);
    expect(cells.pieces[1].depth).toBe(24.8125);
  });

  it('anchor 4: keeps manual widths and reports the existing over-constrained diagnostic', () => {
    const { layout, cells } = solve(makeRun([
      auto('a', 'cabinet', { width: 20 }), auto('b', 'void', { width: 20 }),
      auto('c', 'cabinet', { width: 20 }),
    ], { width: 60, ends: noEnds }));
    expect(layout.errors).toContainEqual({ code: 'over-constrained' });
    expect(layout.pieces.map((piece) => piece.width)).toEqual([20, 20, 20]);
    expect(cells.pieces.filter((piece) => piece.inside)).toHaveLength(2);
  });

  it('anchor 5: follows the Euro upper end drop once, and the existing extension rules', () => {
    for (const upperBottom of ['overhang', 'flush']) {
      const { room, wall, run, cells } = solve(makeRun(items(), { upperBottom }));
      const drop = upperBottom === 'overhang' ? 0.125 : 0;
      const inside = cells.pieces.filter((piece) => piece.inside);
      expect(inside).toHaveLength(2);
      for (const piece of inside) {
        expect(piece.z).toBe(run.z - drop);
        expect(piece.height).toBe(run.height + drop);
      }
      const scene = runScene(room, wall, run, EURO);
      expect(scene.drawnPieces.find((piece) => piece.id === inside[0].id)).toEqual(inside[0]);
      expect(scene.drawnPieces.find((piece) => piece.id === 'r:left'))
        .toMatchObject({ z: inside[0].z, height: inside[0].height });
    }
    const source = makeRun();
    source.ends.left.extend = { down: { to: 'floor' } };
    const { room, wall, run } = solve(source);
    expect(runScene(room, wall, run, EURO).drawnPieces.find((piece) => piece.id === 'c:inside-left'))
      .toMatchObject({ z: 0, height: run.z + run.height, extended: ['down'] });
  });

  it('adds to nested and root gaps, shares stacked boundaries, and leaves returns gap-free', () => {
    const nested = makeRun([auto('a')], { width: 60, ends: noEnds });
    nested.grid.cells[0].node = gridFromItems('nested', [auto('a'), auto('b', 'void')]);
    nested.grid.cells[0].node.cols[0].gap = 0.25;
    const { cells } = solve(nested);
    expect(cells.pieces.map(({ id, x, width }) => [id, x, width])).toEqual([
      ['a', 0, 29.5], ['a:inside-right', 29.5, 0.75], ['b', 30.5, 29.5],
    ]);
    expect(cells.gaps).toContainEqual({ x: 29.5, z: 30, width: 1, height: 60 });

    const stackedRun = makeRun([auto('a'), auto('b', 'void')], { width: 60, ends: noEnds });
    stackedRun.grid = splitGridCell(stackedRun.grid, 'a', 'down', 2, ids());
    stackedRun.grid.cols[0].gap = 0.25;
    const shared = solve(stackedRun);
    expect(shared.layout.pieces.map((piece) => piece.width)).toEqual([29.5, 29.5]);
    expect(shared.cells.pieces.filter((piece) => piece.inside)).toHaveLength(2);

    const framed = makeRun([auto('a'), auto('b', 'void')], {
      width: 60, ends: noEnds, style: { cabinetStyleId: 14 },
    });
    const framedPanel = solve(framed, S);
    expect(framedPanel.cells.pieces.find((piece) => piece.inside))
      .toMatchObject({ width: 0.8125, depth: 24.8125 });
    findLeaf(framed.grid, 'a').insideEnds = { right: { type: 'return' } };
    const returned = solve(framed, S);
    expect(returned.cells.pieces.some((piece) => piece.inside)).toBe(false);
    expect(returned.layout).not.toHaveProperty('insidePanels');
    expect(returned.layout.pieces[1].x - returned.layout.pieces[0].x - returned.layout.pieces[0].width).toBe(0);

    const seam = makeRun([auto('a'), auto('b', 'cabinet', { depth: 12, align: 'back' })], {
      width: 48, ends: noEnds, seamGap: 0.25,
    });
    const seamed = solve(seam);
    expect(seamed.cells.gaps).toContainEqual({ x: 23.5, z: 30, width: 1, height: 60 });
  });
});
