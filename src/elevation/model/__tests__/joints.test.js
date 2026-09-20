import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { jointMembers, pruneJoints } from '../joints.js';
import {
  compensateRuns,
  flipRunsForWall,
  moveJoint,
  stretchRun,
  syncRoom,
} from '../room.js';

function makeRun(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 40,
    width: 40,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'none', width: null },
      right: { type: 'none', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: 40 }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function makeRoom(runs = [makeRun('run')]) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A'],
    walls: [{
      id: 'A',
      name: '',
      numberOverride: null,
      x1: 0,
      y1: 0,
      x2: 120,
      y2: 0,
      height: 96,
      thickness: 4.5,
      flipped: false,
      connections: { start: null, end: null },
      profile: {},
      runs,
    }],
  };
}

function makeTbt() {
  const room = makeRoom([
    makeRun('T1', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      x: 0,
      width: 24,
      z: 4,
      height: 80,
      depth: 24,
      anchors: {
        left: false,
        right: { to: 'joint', jointId: 'J1', offset: 0 },
      },
      items: [{ id: 'T1-cabinet', kind: 'cabinet', width: null }],
    }),
    makeRun('B', {
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      x: 24,
      width: 36,
      z: 4,
      height: 30.5,
      depth: 24,
      anchors: {
        left: { to: 'joint', jointId: 'J1', offset: 0 },
        right: { to: 'joint', jointId: 'J2', offset: 0 },
      },
      items: [{ id: 'B-cabinet', kind: 'cabinet', width: null }],
    }),
    makeRun('T2', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      x: 60,
      width: 24,
      z: 4,
      height: 80,
      depth: 24,
      anchors: {
        left: { to: 'joint', jointId: 'J2', offset: 0 },
        right: false,
      },
      items: [{ id: 'T2-cabinet', kind: 'cabinet', width: null }],
    }),
  ]);
  room.walls[0].joints = [{ id: 'J1', x: 24 }, { id: 'J2', x: 60 }];
  return room;
}

describe('joints', () => {
  it('62. derives joint members in run order and preserves valid joints', () => {
    const wall = makeTbt().walls[0];

    expect(jointMembers(wall, 'J1')).toEqual([
      { runId: 'T1', side: 'right', offset: 0 },
      { runId: 'B', side: 'left', offset: 0 },
    ]);
    expect(pruneJoints(wall)).toEqual(wall);
  });

  it('63. resolves every run edge from its joint datum', () => {
    const room = makeTbt();
    Object.assign(room.walls[0].runs[1], { x: 20, width: 30 });

    const synced = syncRoom(room, DEFAULT_SETTINGS);

    expect(synced.walls[0].runs[1]).toMatchObject({ id: 'B', x: 24, width: 36 });
    expect(synced.walls[0].runs[2]).toMatchObject({ id: 'T2', x: 60, width: 24 });
  });

  it('64. moves a joint while keeping every member opposite edge fixed', () => {
    const result = moveJoint(makeTbt(), 'A', 'J1', 30, DEFAULT_SETTINGS);
    const wall = result.room.walls[0];

    expect(result).toMatchObject({
      ok: true,
      reason: null,
      x: 30,
      range: { min: 9, max: 51 },
      limit: null,
    });
    expect(wall.joints).toEqual([{ id: 'J1', x: 30 }, { id: 'J2', x: 60 }]);
    expect(wall.runs.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'T1', x: 0, width: 30 },
      { id: 'B', x: 30, width: 30 },
      { id: 'T2', x: 60, width: 24 },
    ]);
  });

  it('65. clamps a joint to the overlap of member minimum widths', () => {
    const result = moveJoint(makeTbt(), 'A', 'J1', 70, DEFAULT_SETTINGS);

    expect(result).toMatchObject({
      ok: true,
      x: 51,
      range: { min: 9, max: 51 },
      limit: { runId: 'B', reason: 'min-width' },
    });
    expect(result.room.walls[0].runs[1]).toMatchObject({ id: 'B', x: 51, width: 9 });
  });

  it('66. holds a joint fixed when a member layout is rigid', () => {
    const room = makeTbt();
    room.walls[0].runs[1].items[0].width = 36;

    const result = moveJoint(room, 'A', 'J1', 30, DEFAULT_SETTINGS);

    expect(result).toMatchObject({
      ok: true,
      x: 24,
      range: { min: 24, max: 24 },
      limit: { runId: 'B', reason: 'fixed-width' },
    });
  });

  it('67. resolves signed joint offsets toward a run body', () => {
    const room = makeTbt();
    room.walls[0].runs[1].anchors.left.offset = 1.5;

    const synced = syncRoom(room, DEFAULT_SETTINGS);

    expect(synced.walls[0].runs[0]).toMatchObject({ id: 'T1', x: 0, width: 24 });
    expect(synced.walls[0].runs[1]).toMatchObject({ id: 'B', x: 25.5, width: 34.5 });
  });

  it('68. moves all members on the same side of a joint', () => {
    const room = makeTbt();
    room.walls[0].runs.push(makeRun('U', {
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      x: 24,
      width: 36,
      z: 54,
      height: 30,
      depth: 12,
      anchors: {
        left: { to: 'joint', jointId: 'J1', offset: 0 },
        right: false,
      },
      items: [{ id: 'U-cabinet', kind: 'cabinet', width: null }],
    }));

    const result = moveJoint(room, 'A', 'J1', 30, DEFAULT_SETTINGS);
    const runs = result.room.walls[0].runs;

    expect(runs.find((run) => run.id === 'T1')).toMatchObject({ x: 0, width: 30 });
    expect(runs.find((run) => run.id === 'B')).toMatchObject({ x: 30, width: 30 });
    expect(runs.find((run) => run.id === 'U')).toMatchObject({ x: 30, width: 30 });
  });

  it('69. compensates joint datums when a wall start moves', () => {
    const room = makeTbt();
    const changed = {
      ...room,
      walls: room.walls.map((wall) => ({ ...wall, x1: -10 })),
    };

    const synced = syncRoom(compensateRuns(room, changed), DEFAULT_SETTINGS);
    const wall = synced.walls[0];

    expect(wall.joints).toEqual([{ id: 'J1', x: 34 }, { id: 'J2', x: 70 }]);
    expect(wall.runs.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'T1', x: 10, width: 24 },
      { id: 'B', x: 34, width: 36 },
      { id: 'T2', x: 70, width: 24 },
    ]);
  });

  it('70. mirrors joint datums and swaps member sides with the wall', () => {
    const flipped = flipRunsForWall(makeTbt().walls[0]);

    expect(flipped.joints).toEqual([{ id: 'J1', x: 96 }, { id: 'J2', x: 60 }]);
    expect(flipped.runs[0]).toMatchObject({
      id: 'T1', x: 96, width: 24,
      anchors: { left: { to: 'joint', jointId: 'J1' }, right: false },
    });
    expect(flipped.runs[1]).toMatchObject({
      id: 'B', x: 60, width: 36,
      anchors: {
        left: { to: 'joint', jointId: 'J2' },
        right: { to: 'joint', jointId: 'J1' },
      },
    });
    expect(flipped.runs[2]).toMatchObject({ id: 'T2', x: 36, width: 24 });
  });

  it('71. prunes an under-subscribed joint and frees its remaining member', () => {
    const room = makeTbt();
    room.walls[0].runs = room.walls[0].runs.filter((run) => run.id !== 'T2');

    const synced = syncRoom(room, DEFAULT_SETTINGS);
    const wall = synced.walls[0];

    expect(wall.joints).toEqual([{ id: 'J1', x: 24 }]);
    expect(wall.runs.find((run) => run.id === 'B')).toMatchObject({
      x: 24,
      width: 36,
      anchors: { right: false },
    });
  });

  it('72. stretches a joined side by moving its joint', () => {
    const result = stretchRun(makeTbt(), 'A', 'B', 'right', 66, DEFAULT_SETTINGS);
    const wall = result.room.walls[0];

    expect(result.ok).toBe(true);
    expect(wall.joints).toEqual([{ id: 'J1', x: 24 }, { id: 'J2', x: 66 }]);
    expect(wall.runs.find((run) => run.id === 'B')).toMatchObject({
      x: 24,
      width: 42,
      anchors: { right: { to: 'joint', jointId: 'J2' } },
    });
    expect(wall.runs.find((run) => run.id === 'T2')).toMatchObject({ x: 66, width: 18 });
  });
});
