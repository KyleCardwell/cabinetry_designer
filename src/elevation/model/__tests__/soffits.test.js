import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { landWallEnd } from '../landings.js';
import {
  createSoffit,
  resolveSoffitSpan,
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

void upper;
void runById;

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
