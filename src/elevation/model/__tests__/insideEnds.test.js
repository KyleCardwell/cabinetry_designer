import { describe, expect, it } from 'vitest';
import { cellPieces, EPSILON } from '../cells.js';
import { findLeaf, splitGridCell } from '../cellTree.js';
import { DEFAULT_SETTINGS, FRAME_RETURN_WIDTH } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { insideEndSides } from '../index.js';
import { syncRoom } from '../roomSync.js';
import { splitRun } from '../splitRun.js';
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

  it('records the containing boundary for root and nested leaves without changing geometry', () => {
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
    expect(cellsOf(synced).pieces).toEqual(before);
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
