import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { neighborProfiles } from '../neighborProfiles.js';
import { syncRoom } from '../room.js';
import { wallExtent } from '../wallExtent.js';
import { wallSideView } from '../wallSides.js';

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1,
    y1,
    x2,
    y2,
    height: 108,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    endPanels: { start: null, end: null },
    landings: { start: null, end: null },
    soffits: [],
    ...overrides,
  };
}

const run = (id, cabinetTypeId, depth, overrides = {}) => ({
  id,
  cabinetTypeId,
  x: 0,
  width: 30,
  z: 0,
  height: 30,
  depth,
  ends: {
    left: { type: 'end_panel', width: null },
    right: { type: 'end_panel', width: null },
  },
  autoCount: true,
  maxCabinetWidth: null,
  items: [],
  heightMode: 'auto',
  overrides: {},
  anchors: { left: false, right: false },
  wallSide: 'front',
  ...overrides,
});

const base = (id, overrides = {}) => run(id, CABINET_TYPE_IDS.BASE, 24, {
  z: 4,
  height: 30.5,
  heightMode: 'manual',
  ...overrides,
});

const straightRoom = ({ wallA = {}, wallB = {} } = {}) => syncRoom({
  id: 'S',
  name: 'Room S',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  wallOrder: ['A', 'B'],
  walls: [
    makeWall('A', 0, 0, 120, 0, {
      height: 96,
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      ...wallA,
    }),
    makeWall('B', 120, 0, 240, 0, {
      height: 96,
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
      ...wallB,
    }),
  ],
}, DEFAULT_SETTINGS);

function view(room, wallId) {
  return wallSideView(room.walls.find(({ id }) => id === wallId), 'front');
}

describe('neighborProfiles and wallExtent', () => {
  it('189. projects visible runs across a straight wall joint', () => {
    const room = straightRoom({
      wallA: { runs: [base('A1', { x: 90 })] },
      wallB: { runs: [base('B1')] },
    });

    expect(neighborProfiles(room, view(room, 'A'), DEFAULT_SETTINGS)).toEqual([{
      key: 'B:front:B1:right',
      wallId: 'B',
      runId: 'B1',
      side: 'front',
      x: 120,
      width: 30,
      z: 4,
      height: 30.5,
      moldings: [{ kind: 'toeKick', z: 0, height: 4 }],
    }]);
    expect(neighborProfiles(room, view(room, 'B'), DEFAULT_SETTINGS)).toEqual([{
      key: 'A:front:A1:left',
      wallId: 'A',
      runId: 'A1',
      side: 'front',
      x: -30,
      width: 30,
      z: 4,
      height: 30.5,
      moldings: [{ kind: 'toeKick', z: 0, height: 4 }],
    }]);
  });

  it("190. omits neighbour runs that aren't visible", () => {
    const behindRoom = straightRoom({
      wallB: { runs: [run('B1', CABINET_TYPE_IDS.UPPER, 12, {
        wallSide: 'back',
        z: 54,
        height: 36,
        heightMode: 'manual',
      })] },
    });
    expect(neighborProfiles(behindRoom, view(behindRoom, 'A'), DEFAULT_SETTINGS)).toEqual([]);

    const cornerRoom = syncRoom({
      id: 'S',
      name: 'Room S',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['A', 'B'],
      walls: [
        makeWall('A', 0, 0, 120, 0, {
          connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        }),
        makeWall('B', 120, 0, 120, 96, {
          connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
          runs: [base('B1')],
        }),
      ],
    }, DEFAULT_SETTINGS);
    expect(neighborProfiles(cornerRoom, view(cornerRoom, 'A'), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('191. grows wall extents for runs, molding, and neighbour profiles', () => {
    const neighborRoom = straightRoom({
      wallA: { runs: [base('A1', { x: 90 })] },
      wallB: { runs: [base('B1')] },
    });
    expect(wallExtent(neighborRoom, view(neighborRoom, 'A'), DEFAULT_SETTINGS)).toEqual({
      left: 0, right: 150, top: 96, bottom: 0,
    });

    const overhangRoom = straightRoom({
      wallA: { runs: [base('A1', { x: -6 })] },
    });
    expect(wallExtent(overhangRoom, view(overhangRoom, 'A'), DEFAULT_SETTINGS)).toEqual({
      left: -6, right: 120, top: 96, bottom: 0,
    });

    const moldingRoom = straightRoom({
      wallA: {
        height: 90,
        runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
          x: 10,
          width: 30,
          heightMode: 'auto',
        })],
      },
    });
    expect(wallExtent(moldingRoom, view(moldingRoom, 'A'), DEFAULT_SETTINGS)).toEqual({
      left: 0, right: 120, top: 96, bottom: 0,
    });
  });

  it('213. carries a neighbouring upper\'s top mold and crown', () => {
    const crownRoom = straightRoom({
      wallB: {
        runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
          x: 0, width: 30, z: 54, height: 36, heightMode: 'auto',
        })],
      },
    });

    expect(neighborProfiles(crownRoom, view(crownRoom, 'A'), DEFAULT_SETTINGS)).toEqual([{
      key: 'B:front:U1:right',
      wallId: 'B',
      runId: 'U1',
      side: 'front',
      x: 120,
      width: 30,
      z: 54,
      height: 36,
      moldings: [
        { kind: 'topMold', z: 90, height: 3 },
        { kind: 'crown', z: 91.5, height: 4.5 },
      ],
    }]);
  });

  it('214. grows the extent for a neighbour\'s crown', () => {
    const crownRoom = straightRoom({
      wallA: { height: 90 },
      wallB: {
        runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
          x: 0, width: 30, z: 54, height: 36, heightMode: 'auto',
        })],
      },
    });

    expect(wallExtent(crownRoom, view(crownRoom, 'A'), DEFAULT_SETTINGS)).toEqual({
      left: 0, right: 150, top: 96, bottom: 0,
    });
  });
});
