import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { followCreatesCycle, followersOf, followGlyphs } from '../joints.js';
import {
  describeAnchor,
  flipRunsForWall,
  joinEdges,
  joinTouchingEdges,
  stretchRun,
  syncRoom,
  tryPlaceRun,
} from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const AUTO = { type: 'none', width: null, auto: true };
const casing = () => ({ to: 'opening', openingId: 'window-1', edge: 'casing', clearance: 2 });
const follow = (runId, side, offset = 0) => ({ to: 'follow', runId, side, offset });

function makeRun(id, overrides = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 24, z: 4, height: 30.5, depth: 24,
    ends: { left: { ...NONE }, right: { ...NONE } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

/** 120" wall; window jamb 42–78, casing 39–81. TA's right and TB's left sit 2" off the casing; B follows both. */
function makeRoom(baseOverrides = {}) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {},
      openings: [{
        id: 'window-1', kind: 'window', label: 'W1', measureMode: 'jamb',
        width: 36, height: 48, sillZ: 36, offset: 42, offsetFrom: 'right',
        offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
      }],
      runs: [
        makeRun('B', {
          x: 0, width: 10,
          ends: { left: { ...AUTO }, right: { ...AUTO } },
          anchors: { left: follow('TA', 'right'), right: follow('TB', 'left') },
          ...baseOverrides,
        }),
        makeRun('TA', {
          cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 13, height: 80,
          anchors: { left: false, right: casing() },
        }),
        makeRun('TB', {
          cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 83, height: 80, depth: 12,
          anchors: { left: casing(), right: false },
        }),
      ],
    }],
  };
}

const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

describe('SPEC-34.3 follow anchors', () => {
  it('resolves a follower after its leaders and follows a moved window', () => {
    const synced = syncRoom(makeRoom(), S);
    expect(runOf(synced, 'TA')).toMatchObject({ x: 13, width: 24 });
    expect(runOf(synced, 'TB')).toMatchObject({ x: 83, width: 24 });
    expect(runOf(synced, 'B')).toMatchObject({ x: 37, width: 46 });
    expect(runOf(synced, 'B').ends).toEqual({
      left: { type: 'none', width: null, auto: true },
      right: { type: 'end_panel', width: null, auto: true },
    });

    const moved = makeRoom();
    moved.walls[0].openings[0].offset = 36;
    const resynced = syncRoom(moved, S);
    expect(runOf(resynced, 'TA')).toMatchObject({ x: 19, width: 24 });
    expect(runOf(resynced, 'TB')).toMatchObject({ x: 89, width: 24 });
    expect(runOf(resynced, 'B')).toMatchObject({ x: 43, width: 46 });
  });

  it('offsets a followed edge and describes it', () => {
    const synced = syncRoom(makeRoom({
      anchors: { left: follow('TA', 'right', 1), right: follow('TB', 'left') },
    }), S);
    const base = runOf(synced, 'B');
    expect(base).toMatchObject({ x: 38, width: 45 });
    expect(base.ends.left).toEqual({ type: 'end_panel', width: null, auto: true });
    expect(describeAnchor(synced, synced.walls[0], base, 'left', S))
      .toBe('Follows Tall 13"–37" · 1" gap');
    expect(describeAnchor(synced, synced.walls[0], base, 'right', S))
      .toBe('Follows Tall 83"–107" · flush');
  });

  it('frees a side whose leader is gone or on the other wall side', () => {
    const gone = makeRoom();
    gone.walls[0].runs = gone.walls[0].runs.filter((run) => run.id !== 'TA');
    const base = runOf(syncRoom(gone, S), 'B');
    expect(base.anchors.left).toBe(false);
    expect(base.ends.left).toEqual({ type: 'none', width: null });
    expect(base.anchors.right).toEqual(follow('TB', 'left'));

    const back = makeRoom();
    runOf(back, 'TB').wallSide = 'back';
    expect(runOf(syncRoom(back, S), 'B').anchors.right).toBe(false);
  });

  it('leaves a follow loop where it was stored', () => {
    const loop = makeRoom();
    loop.walls[0].runs = [
      makeRun('P', { x: 0, width: 20, anchors: { left: false, right: follow('Q', 'left') } }),
      makeRun('Q', { x: 30, width: 20, anchors: { left: follow('P', 'right'), right: false } }),
    ];
    const synced = syncRoom(loop, S);
    expect(runOf(synced, 'P')).toMatchObject({ x: 0, width: 20 });
    expect(runOf(synced, 'Q')).toMatchObject({ x: 30, width: 20 });

    const wall = syncRoom(makeRoom(), S).walls[0];
    expect(followCreatesCycle(wall, 'B', 'TA')).toBe(false);
    expect(followCreatesCycle(wall, 'TA', 'B')).toBe(true);
    expect(followCreatesCycle(wall, 'TA', 'TA')).toBe(true);
  });

  it('lists followers and link glyphs', () => {
    const wall = syncRoom(makeRoom(), S).walls[0];
    expect(followersOf(wall, ['TA'])).toEqual(['B']);
    expect(followersOf(wall, ['B'])).toEqual([]);
    expect(followGlyphs(wall)).toEqual([
      { runId: 'B', side: 'left', leaderRunId: 'TA', x: 37, z: 19.25 },
      { runId: 'B', side: 'right', leaderRunId: 'TB', x: 83, z: 19.25 },
    ]);
  });

  it('mirrors followed sides when the wall flips', () => {
    const room = makeRoom();
    room.walls[0] = flipRunsForWall(room.walls[0]);
    expect(runOf(room, 'B').anchors).toEqual({
      left: follow('TB', 'right'),
      right: follow('TA', 'left'),
    });
    const synced = syncRoom(room, S);
    expect(runOf(synced, 'TA')).toMatchObject({ x: 83, width: 24 });
    expect(runOf(synced, 'TB')).toMatchObject({ x: 13, width: 24 });
    expect(runOf(synced, 'B')).toMatchObject({ x: 37, width: 46 });
  });
});

describe('SPEC-34.3 joining to an anchored edge', () => {
  const free = () => makeRoom({
    x: 40, width: 40,
    ends: { left: { ...NONE }, right: { ...NONE } },
    anchors: { left: false, right: false },
  });

  it('follows an anchored edge instead of refusing the join', () => {
    const result = joinEdges(free(), 'A', { runId: 'B', side: 'left' }, { runId: 'TA', side: 'right' }, S);
    expect(result).toMatchObject({ ok: true, follow: true });
    const base = runOf(result.room, 'B');
    expect(base).toMatchObject({ x: 37, width: 43 });
    expect(base.anchors.left).toEqual(follow('TA', 'right'));
    expect(base.ends.left).toEqual({ type: 'none', width: null, auto: true });
    expect(runOf(result.room, 'TA').anchors.right).toEqual(casing());
    expect(result.room.walls[0].joints).toEqual([]);
  });

  it('refuses a follow that would loop', () => {
    const first = joinEdges(free(), 'A', { runId: 'B', side: 'left' }, { runId: 'TA', side: 'right' }, S);
    expect(joinEdges(first.room, 'A', { runId: 'TA', side: 'right' }, { runId: 'B', side: 'left' }, S))
      .toMatchObject({ ok: false, reason: 'follow-cycle' });
  });

  it('follows when a stretch snaps to an anchored edge', () => {
    const result = stretchRun(free(), 'A', 'B', 'left', 38, S);
    expect(result).toMatchObject({ ok: true, joined: { runId: 'TA', side: 'right' } });
    const base = runOf(result.room, 'B');
    expect(base).toMatchObject({ x: 37, width: 43 });
    expect(base.anchors.left).toEqual(follow('TA', 'right'));
  });

  it('follows both anchored neighbours of a newly drawn run', () => {
    const room = makeRoom();
    room.walls[0].runs = room.walls[0].runs.filter((run) => run.id !== 'B');
    const placed = tryPlaceRun(room, 'A', makeRun('B', { x: 37, width: 46 }), S);
    expect(placed.ok).toBe(true);
    const result = joinTouchingEdges(placed.room, 'A', 'B', S);
    expect(result.ok).toBe(true);
    expect(result.joined).toEqual([{ runId: 'TA', side: 'right' }, { runId: 'TB', side: 'left' }]);
    expect(runOf(result.room, 'B').anchors).toEqual({
      left: follow('TA', 'right'),
      right: follow('TB', 'left'),
    });
    result.room.walls[0].openings[0].offset = 36;
    expect(runOf(syncRoom(result.room, S), 'B')).toMatchObject({ x: 43, width: 46 });
  });
});
