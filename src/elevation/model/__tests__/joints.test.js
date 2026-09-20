import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  jointGlyphs,
  jointMembers,
  pruneJoints,
  runShortLabel,
} from '../joints.js';
import {
  compensateRuns,
  flipRunsForWall,
  joinEdges,
  joinTouchingEdges,
  moveJoint,
  moveRun,
  stretchRun,
  syncRoom,
  tryPlaceRun,
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

function makeTbu() {
  const joinedEnd = () => ({ type: 'none', width: null, auto: true });
  const room = makeRoom([
    makeRun('T', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      x: 0,
      width: 24,
      z: 4,
      height: 80,
      depth: 12,
      ends: { left: { type: 'none', width: null }, right: joinedEnd() },
      anchors: { left: false, right: { to: 'joint', jointId: 'J1', offset: 0 } },
      items: [{ id: 'T-cabinet', kind: 'cabinet', width: null }],
    }),
    makeRun('B', {
      x: 24,
      width: 36,
      z: 4,
      height: 30.5,
      depth: 24,
      ends: { left: joinedEnd(), right: { type: 'none', width: null } },
      anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 }, right: false },
      items: [{ id: 'B-cabinet', kind: 'cabinet', width: null }],
    }),
    makeRun('U', {
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      x: 24,
      width: 36,
      z: 54,
      height: 30,
      depth: 15,
      ends: { left: joinedEnd(), right: { type: 'none', width: null } },
      anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 }, right: false },
      items: [{ id: 'U-cabinet', kind: 'cabinet', width: null }],
    }),
  ]);
  room.walls[0].joints = [{ id: 'J1', x: 24 }];
  return room;
}

describe('joints', () => {
  it('formats a short run label from its type and span', () => {
    expect(runShortLabel(makeTbt().walls[0].runs[0])).toBe('Tall 0"–24"');
  });

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

describe('joining run edges', () => {
  it('73. joins two free edges into a new joint', () => {
    const room = makeRoom([
      makeRun('P', { x: 0, width: 30 }),
      makeRun('Q', { cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 30, width: 24, height: 80 }),
    ]);
    const result = joinEdges(
      room,
      'A',
      { runId: 'P', side: 'right' },
      { runId: 'Q', side: 'left' },
      DEFAULT_SETTINGS,
    );
    const wall = result.room.walls[0];
    const jointId = wall.joints[0].id;

    expect(result.ok).toBe(true);
    expect(wall.joints).toEqual([{ id: jointId, x: 30 }]);
    expect(wall.runs[0]).toMatchObject({
      anchors: { right: { to: 'joint', jointId, offset: 0 } },
      ends: { right: { auto: true } },
    });
    expect(wall.runs[1]).toMatchObject({
      anchors: { left: { to: 'joint', jointId, offset: 0 } },
      ends: { left: { auto: true } },
    });
  });

  it('74. joins a free edge to an existing joint and keeps its far edge', () => {
    const room = makeTbt();
    room.walls[0].runs.push(makeRun('U', {
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      x: 26,
      width: 30,
      z: 54,
      height: 30,
      depth: 12,
    }));
    const result = joinEdges(
      room,
      'A',
      { runId: 'U', side: 'left' },
      { runId: 'T1', side: 'right' },
      DEFAULT_SETTINGS,
    );
    const joined = result.room.walls[0].runs.find((run) => run.id === 'U');

    expect(result.ok).toBe(true);
    expect(joined).toMatchObject({
      x: 24,
      width: 32,
      anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 } },
    });
  });

  it('75. refuses to join two sides of the same run', () => {
    const room = makeTbt();
    const result = joinEdges(
      room,
      'A',
      { runId: 'B', side: 'left' },
      { runId: 'B', side: 'right' },
      DEFAULT_SETTINGS,
    );

    expect(result).toMatchObject({ ok: false, reason: 'joint-same-run', room });
  });

  it('76. joins a stretch that snaps to a butting run edge', () => {
    const room = makeRoom([
      makeRun('P', { x: 0, width: 30, items: [{ id: 'P-cabinet', kind: 'cabinet', width: null }] }),
      makeRun('Q', {
        cabinetTypeId: CABINET_TYPE_IDS.TALL,
        x: 40,
        width: 24,
        height: 80,
      }),
    ]);

    const result = stretchRun(room, 'A', 'P', 'right', 39, DEFAULT_SETTINGS);

    expect(result).toMatchObject({ ok: true, joined: { runId: 'Q', side: 'left' } });
    expect(result.room.walls[0].joints).toHaveLength(1);
    expect(result.room.walls[0].joints[0].x).toBe(40);
    expect(result.room.walls[0].runs[0]).toMatchObject({ x: 0, width: 40 });
  });

  it('77. does not join snapped edges without vertical overlap', () => {
    const room = makeRoom([
      makeRun('R', { x: 40, width: 24 }),
      makeRun('S', {
        cabinetTypeId: CABINET_TYPE_IDS.UPPER,
        x: 0,
        width: 30,
        z: 54,
        height: 30,
        depth: 12,
        items: [{ id: 'S-cabinet', kind: 'cabinet', width: null }],
      }),
    ]);

    const result = stretchRun(room, 'A', 'S', 'right', 39, DEFAULT_SETTINGS);

    expect(result.ok).toBe(true);
    expect(result.joined).toBeUndefined();
    expect(result.room.walls[0].joints ?? []).toHaveLength(0);
  });

  it('78. joins a newly placed run to a touching edge', () => {
    const room = makeRoom([makeRun('T1', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      x: 0,
      width: 24,
      height: 80,
    })]);
    const placed = tryPlaceRun(room, 'A', makeRun('B', {
      x: 24,
      width: 36,
      items: [{ id: 'B-cabinet', kind: 'cabinet', width: null }],
    }), DEFAULT_SETTINGS);
    const result = joinTouchingEdges(placed.room, 'A', 'B', DEFAULT_SETTINGS);

    expect(placed.ok).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.room.walls[0].joints).toHaveLength(1);
    expect(result.room.walls[0].joints[0].x).toBe(24);
  });
});

describe('joint end panels', () => {
  function joinedEnds(room) {
    const runs = syncRoom(room, DEFAULT_SETTINGS).walls[0].runs;
    return {
      tall: runs.find((run) => run.id === 'T').ends.right.type,
      base: runs.find((run) => run.id === 'B').ends.left.type,
      upper: runs.find((run) => run.id === 'U').ends.left.type,
    };
  }

  it('82. leaves every end exposed when deeper neighbors do not cover its full height', () => {
    expect(joinedEnds(makeTbu())).toEqual({
      tall: 'end_panel', base: 'end_panel', upper: 'end_panel',
    });
  });

  it('83. covers shallower runs while preserving a gap in the tall coverage', () => {
    const room = makeTbu();
    room.walls[0].runs.find((run) => run.id === 'T').depth = 25;

    expect(joinedEnds(room)).toEqual({ tall: 'end_panel', base: 'none', upper: 'none' });
  });

  it('84. counts equal depth as coverage', () => {
    const room = makeTbu();
    room.walls[0].runs.find((run) => run.id === 'U').depth = 12;

    expect(joinedEnds(room)).toEqual({ tall: 'end_panel', base: 'end_panel', upper: 'none' });
  });

  it('85. treats an offset edge as a gap', () => {
    const room = makeTbu();
    room.walls[0].runs.find((run) => run.id === 'T').depth = 25;
    room.walls[0].runs.find((run) => run.id === 'B').anchors.left.offset = 0.5;

    expect(joinedEnds(room)).toEqual({ tall: 'end_panel', base: 'end_panel', upper: 'none' });
  });
});

describe('joint glyphs', () => {
  it('89. places one glyph in each shorter run of a stacked joint', () => {
    expect(jointGlyphs(makeTbu().walls[0], 'J1')).toEqual([
      { ownerRunId: 'B', z: 19.25 },
      { ownerRunId: 'U', z: 69 },
    ]);
  });

  it('90. assigns each tall-to-base glyph to the base', () => {
    const wall = makeTbt().walls[0];

    expect(jointGlyphs(wall, 'J1')).toEqual([{ ownerRunId: 'B', z: 19.25 }]);
    expect(jointGlyphs(wall, 'J2')).toEqual([{ ownerRunId: 'B', z: 19.25 }]);
  });

  it('91. gives every unpaired member its own glyph', () => {
    const room = makeRoom([
      makeRun('P', {
        x: 0,
        width: 30,
        z: 4,
        height: 30.5,
        anchors: { left: false, right: { to: 'joint', jointId: 'J1', offset: 0 } },
      }),
      makeRun('Q', {
        cabinetTypeId: CABINET_TYPE_IDS.UPPER,
        x: 30,
        width: 20,
        z: 54,
        height: 30,
        anchors: { left: { to: 'joint', jointId: 'J1', offset: 0 }, right: false },
      }),
    ]);
    room.walls[0].joints = [{ id: 'J1', x: 30 }];

    expect(jointGlyphs(room.walls[0], 'J1')).toEqual([
      { ownerRunId: 'P', z: 19.25 },
      { ownerRunId: 'Q', z: 69 },
    ]);
  });
});

describe('sliding joined runs', () => {
  it('93. slides a run through both joints without changing its width', () => {
    const result = moveRun(makeTbt(), 'A', 'B', 30, DEFAULT_SETTINGS);
    const wall = result.room.walls[0];

    expect(result).toMatchObject({ ok: true, x: 30, limit: null, joints: true });
    expect(wall.joints).toEqual([{ id: 'J1', x: 30 }, { id: 'J2', x: 66 }]);
    expect(wall.runs.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'T1', x: 0, width: 30 },
      { id: 'B', x: 30, width: 36 },
      { id: 'T2', x: 66, width: 18 },
    ]);
  });

  it('94. clamps a joined slide when its neighbor reaches minimum width', () => {
    const result = moveRun(makeTbt(), 'A', 'B', 44, DEFAULT_SETTINGS);
    const wall = result.room.walls[0];

    expect(result).toMatchObject({
      ok: true,
      x: 39,
      limit: { runId: 'T2', reason: 'min-width' },
      joints: true,
    });
    expect(wall.joints).toEqual([{ id: 'J1', x: 39 }, { id: 'J2', x: 75 }]);
    expect(wall.runs.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'T1', x: 0, width: 39 },
      { id: 'B', x: 39, width: 36 },
      { id: 'T2', x: 75, width: 9 },
    ]);
  });

  it('95. holds a joined slide when its neighbor is rigid', () => {
    const room = makeTbt();
    const t2 = room.walls[0].runs.find((run) => run.id === 'T2');
    Object.assign(t2.items[0], { width: 24 });
    t2.autoCount = false;

    const result = moveRun(room, 'A', 'B', 30, DEFAULT_SETTINGS);

    expect(result).toMatchObject({
      ok: true,
      x: 24,
      limit: { runId: 'T2', reason: 'fixed-width' },
      joints: true,
    });
    expect(result.room.walls[0].joints).toEqual(room.walls[0].joints);
    expect(result.room.walls[0].runs.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'T1', x: 0, width: 24 },
      { id: 'B', x: 24, width: 36 },
      { id: 'T2', x: 60, width: 24 },
    ]);
  });

  it('96. slides a run through its remaining joint after pruning the other', () => {
    const room = makeTbt();
    room.walls[0].runs = room.walls[0].runs.filter((run) => run.id !== 'T2');

    const result = moveRun(room, 'A', 'B', 30, DEFAULT_SETTINGS);
    const wall = result.room.walls[0];

    expect(result).toMatchObject({ ok: true, x: 30, joints: true });
    expect(wall.joints).toEqual([{ id: 'J1', x: 30 }]);
    expect(wall.runs.find((run) => run.id === 'T1')).toMatchObject({ x: 0, width: 30 });
    expect(wall.runs.find((run) => run.id === 'B')).toMatchObject({
      x: 30,
      width: 36,
      anchors: { right: false },
    });
  });

  it('97. still refuses non-joint anchors and reports free moves', () => {
    const anchoredRoom = makeTbt();
    anchoredRoom.walls[0].runs.find((run) => run.id === 'T1').anchors.left = true;

    const anchored = moveRun(anchoredRoom, 'A', 'T1', 4, DEFAULT_SETTINGS);
    const freeRoom = makeRoom();
    const free = moveRun(freeRoom, 'A', 'run', 60, DEFAULT_SETTINGS);

    expect(anchored).toMatchObject({ ok: false, reason: 'anchored' });
    expect(anchored.room).toBe(anchoredRoom);
    expect(free).toMatchObject({ ok: true, x: 60, joints: false });
  });
});
