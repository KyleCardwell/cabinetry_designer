import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { landWallEnd } from '../landings.js';
import {
  describeAnchor,
  roomDiagnostics,
  stretchRun,
  syncRoom,
} from '../room.js';
import { createRun } from '../runDefaults.js';
import {
  createSoffit,
  resolveSoffitSpan,
  runMolding,
  soffitMoldingDrop,
  validateSoffitPlacement,
} from '../soffits.js';
import { wallSideView } from '../wallSides.js';

function upper(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.UPPER,
    x: 0,
    width: 30,
    z: 54,
    height: 36,
    depth: 12,
    ends: {
      left: { type: 'end_panel', width: null },
      right: { type: 'end_panel', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'auto',
    overrides: {},
    anchors: { left: false, right: false },
    wallSide: 'front',
    ...overrides,
  };
}

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

function makeRoom(walls) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: walls.map((wall) => wall.id),
    walls,
  };
}

const wallById = (room, id) => room.walls.find((wall) => wall.id === id);

function alcove() {
  let room = makeRoom([
    makeWall('H', 0, 0, 246, 0),
    makeWall('W1', 60, 0, 60, 30, { thickness: 9 }),
    makeWall('W2', 201, 0, 201, 30, { thickness: 12 }),
  ]);
  room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 60 });
  room = landWallEnd(room, 'W2', 'start', { wallId: 'H', side: 'front', x: 201 });
  return room;
}

const SF = (overrides = {}) => ({
  id: 'SF',
  wallSide: 'front',
  x: 40,
  width: 60,
  bottom: 84,
  depth: 14,
  molding: 'crown',
  anchors: { left: false, right: false },
  ...overrides,
});
const soffitWall = (runs = [], soffit = SF()) => makeRoom([
  makeWall('S', 0, 0, 144, 0, { soffits: [soffit], runs }),
]);
const runById = (room, id) => wallById(room, 'S').runs.find((run) => run.id === id);

describe('SPEC-19 soffit shape and helpers', () => {
  it('160. resolves soffit spans from wall ends and wing-wall faces', () => {
    const endRoom = soffitWall([], SF({
      anchors: {
        left: { to: 'end', offset: 20 },
        right: { to: 'end', offset: 20 },
      },
    }));
    const endWall = wallById(endRoom, 'S');
    expect(resolveSoffitSpan(endRoom, wallSideView(endWall, 'front'), endWall.soffits[0]))
      .toEqual({ x: 20, width: 104 });

    const room = alcove();
    const view = wallSideView(wallById(room, 'H'), 'front');
    const anchored = SF({
      anchors: {
        left: { to: 'wall', wallId: 'W1', offset: 0 },
        right: { to: 'wall', wallId: 'W2', offset: 0 },
      },
    });
    expect(resolveSoffitSpan(room, view, anchored)).toEqual({ x: 69, width: 120 });
    expect(resolveSoffitSpan(room, view, {
      ...anchored,
      anchors: { ...anchored.anchors, left: { ...anchored.anchors.left, offset: -4.5 } },
    })).toEqual({ x: 64.5, width: 124.5 });
  });

  it('161. creates a rounded soffit snapped to facing wing-wall faces', () => {
    const room = alcove();
    const wall = wallSideView(wallById(room, 'H'), 'front');
    const soffit = createSoffit(
      { x: 69.5, width: 119, bottomZ: 96.2 },
      { settings: DEFAULT_SETTINGS, room, wall },
    );

    expect({ ...soffit, id: 'x' }).toEqual({
      id: 'x',
      wallSide: 'front',
      x: 69.5,
      width: 119,
      bottom: 96,
      depth: 14,
      molding: 'crown',
      anchors: {
        left: { to: 'wall', wallId: 'W1', offset: 0 },
        right: { to: 'wall', wallId: 'W2', offset: 0 },
      },
    });
  });

  it('162. validates bounds and same-side overlap', () => {
    const room = soffitWall();
    const wall = wallById(room, 'S');
    expect(validateSoffitPlacement(wall, SF({ id: 'SG', x: 90, width: 20 })))
      .toEqual({ ok: false, reason: 'soffit-overlap' });
    expect(validateSoffitPlacement(wall, SF({ id: 'SG', x: 100, width: 20 })))
      .toEqual({ ok: true, reason: null });
    expect(validateSoffitPlacement(wall, SF({ id: 'SG', x: 110, bottom: 108 })))
      .toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(validateSoffitPlacement(wall, SF({ id: 'SG', x: 90, wallSide: 'back' })))
      .toEqual({ ok: true, reason: null });
  });

  it('163. reports the molding drop for each soffit molding', () => {
    const profile = DEFAULT_SETTINGS.defaultProfile;
    expect(['crown', 'topMold', 'none'].map((molding) => (
      soffitMoldingDrop(molding, profile)
    ))).toEqual([6, 3, 0]);
  });
});

describe('SPEC-19 soffit resolution', () => {
  it('166. caps auto-height runs under each soffit molding', () => {
    for (const [molding, height] of [
      ['crown', 24],
      ['topMold', 27],
      ['none', 30],
    ]) {
      const room = syncRoom(soffitWall([
        upper('U1', { x: 40, width: 60 }),
      ], SF({ molding })), DEFAULT_SETTINGS);
      const run = runById(room, 'U1');
      expect({ z: run.z, height: run.height }).toEqual({ z: 54, height });
      expect(runMolding(wallById(room, 'S'), run)).toBe(molding);
    }
  });

  it('167. reports only partial or manual-height soffit conflicts', () => {
    const room = syncRoom(soffitWall([
      upper('U1', { x: 40, width: 60 }),
      upper('U2', { x: 100, width: 30 }),
      upper('U3', { x: 90, width: 30, wallSide: 'back' }),
      upper('U4', { x: 10, width: 40 }),
    ]), DEFAULT_SETTINGS);
    expect(['U1', 'U2', 'U3', 'U4'].map((id) => runById(room, id).height))
      .toEqual([24, 36, 36, 36]);

    const diagnostics = roomDiagnostics(room, DEFAULT_SETTINGS);
    for (const id of ['U1', 'U2', 'U3']) {
      expect(diagnostics[id].warnings.filter((warning) => warning.code === 'soffit-conflict'))
        .toEqual([]);
    }
    expect(diagnostics.U4.warnings.filter((warning) => warning.code === 'soffit-conflict'))
      .toEqual([{ code: 'soffit-conflict', soffitId: 'SF' }]);

    const manual = soffitWall([
      upper('M1', { x: 50, width: 30, heightMode: 'manual' }),
    ]);
    expect(roomDiagnostics(manual, DEFAULT_SETTINGS).M1.warnings
      .filter((warning) => warning.code === 'soffit-conflict'))
      .toEqual([{ code: 'soffit-conflict', soffitId: 'SF' }]);
  });

  it('168. resolves and describes run anchors against soffit sides', () => {
    const room = syncRoom(soffitWall([
      upper('A1', {
        x: 105,
        anchors: {
          left: { to: 'soffit', soffitId: 'SF', offset: 0 },
          right: false,
        },
      }),
      upper('A2', {
        anchors: {
          left: false,
          right: { to: 'soffit', soffitId: 'SF', offset: 0.5 },
        },
      }),
    ]), DEFAULT_SETTINGS);
    const wall = wallById(room, 'S');
    expect(runById(room, 'A1').x).toBe(100);
    expect(runById(room, 'A2').x).toBe(9.5);
    expect(describeAnchor(room, wall, runById(room, 'A2'), 'right', DEFAULT_SETTINGS))
      .toBe('Against soffit · 1/2" gap');
  });

  it('169. creates a run anchored beside a soffit with the contextual end type', () => {
    const create = (room) => {
      const synced = syncRoom(room, DEFAULT_SETTINGS);
      return createRun(
        { x: 100.5, width: 30, bottomZ: 54, topZ: 90 },
        {
          settings: DEFAULT_SETTINGS,
          room: synced,
          wall: wallSideView(wallById(synced, 'S'), 'front'),
        },
      );
    };

    const exposed = create(soffitWall());
    expect(exposed.anchors).toEqual({
      left: { to: 'soffit', soffitId: 'SF', offset: 0 },
      right: false,
    });
    expect(exposed.ends.left).toEqual({ type: 'end_panel', width: null });

    const adjacent = create(soffitWall([upper('U1', { x: 40, width: 60 })]));
    expect(adjacent.ends.left).toEqual({ type: 'filler', width: null });
  });

  it('170. stretches a run edge to a soffit anchor', () => {
    const room = syncRoom(soffitWall([
      upper('B1', { x: 110, width: 30 }),
    ]), DEFAULT_SETTINGS);
    const result = stretchRun(room, 'S', 'B1', 'left', 101, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    const run = runById(result.room, 'B1');
    expect({ x: run.x, width: run.width }).toEqual({ x: 100, width: 40 });
    expect(run.anchors.left)
      .toEqual({ to: 'soffit', soffitId: 'SF', offset: 0 });
    expect(run.ends.left).toEqual({ type: 'end_panel', width: null });
  });
});
