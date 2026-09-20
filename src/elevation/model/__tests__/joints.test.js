import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { jointMembers, pruneJoints } from '../joints.js';

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
});
