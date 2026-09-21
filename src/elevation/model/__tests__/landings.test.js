import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  landingInterval,
  landingOffsetFor,
  landingRefCreatesCycle,
  landingsOn,
  landWallEnd,
  releaseWall,
  resolveLandings,
  snapToWallFace,
} from '../landings.js';
import { wallSideView } from '../wallSides.js';

function base(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 96,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'end_panel', width: null },
      right: { type: 'end_panel', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual',
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
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    endPanels: { start: null, end: null },
    landings: { start: null, end: null },
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
const moveWall = (room, id, changes) => ({
  ...room,
  walls: room.walls.map((wall) => (wall.id === id ? { ...wall, ...changes } : wall)),
});
const withLanding = (room, id, changes) => ({
  ...room,
  walls: room.walls.map((wall) => (wall.id === id
    ? {
      ...wall,
      landings: {
        ...wall.landings,
        start: { ...wall.landings.start, ...changes },
      },
    }
    : wall)),
});
const interval = (room, id) => {
  const entry = landingInterval(room, wallById(room, id), 'start');
  return [entry.a, entry.b, entry.lineX, entry.backX];
};

function alcove({ hostRuns = [], w1Runs = [] } = {}) {
  let room = makeRoom([
    makeWall('H', 0, 0, 246, 0, { runs: hostRuns }),
    makeWall('W1', 60, 0, 60, 30, { thickness: 9, runs: w1Runs }),
    makeWall('W2', 201, 0, 201, 30, { thickness: 12 }),
  ]);
  room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 60 });
  room = landWallEnd(room, 'W2', 'start', { wallId: 'H', side: 'front', x: 201 });
  return room;
}

function chained(room = alcove()) {
  return withLanding(room, 'W2', { ref: 'W1', offset: 120 });
}

function AL(overrides = {}) {
  return base('AL', {
    x: 69,
    width: 120,
    anchors: {
      left: { to: 'wall', wallId: 'W1' },
      right: { to: 'wall', wallId: 'W2' },
    },
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    ...overrides,
  });
}

describe('wall landings', () => {
  it('133. lands on the near face and orients thickness away from its reference end', () => {
    const room = alcove();

    expect(wallById(room, 'W1').landings.start).toEqual({
      wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60,
    });
    expect(wallById(room, 'W1').flipped).toBe(false);
    expect(wallById(room, 'W2').landings.start).toEqual({
      wallId: 'H', side: 'front', ref: 'right', to: 'near', offset: 45,
    });
    expect(wallById(room, 'W2').flipped).toBe(true);
  });

  it('134. derives sorted landing intervals on the landed host side', () => {
    const room = alcove();
    const H = wallById(room, 'H');

    expect(interval(room, 'W1')).toEqual([60, 69, 60, 69]);
    expect(interval(room, 'W2')).toEqual([189, 201, 201, 189]);
    expect(landingsOn(room, wallSideView(H, 'front')).map(({ wallId, a, b }) => (
      [wallId, a, b]
    ))).toEqual([['W1', 60, 69], ['W2', 189, 201]]);
    expect(landingsOn(room, wallSideView(H, 'back'))).toEqual([]);
  });

  it('135. measures landing offsets from host ends and other landings', () => {
    const room = alcove();
    const W2 = wallById(room, 'W2');

    expect(landingOffsetFor(room, W2, 'start', 'W1', 'near')).toBe(120);
    expect(landingOffsetFor(room, W2, 'start', 'right', 'far')).toBe(57);
    expect(landingOffsetFor(room, W2, 'start', 'left', 'center')).toBe(195);
  });

  it('136. resolves a chained landing after its reference landing', () => {
    const room = chained();
    expect(interval(resolveLandings(room), 'W2')).toEqual([189, 201, 201, 189]);

    const resolved = resolveLandings(withLanding(room, 'W1', { offset: 50 }));
    expect(interval(resolved, 'W1')).toEqual([50, 59, 50, 59]);
    expect(wallById(resolved, 'W1')).toMatchObject({ x1: 50, y1: 0, x2: 50, y2: 30 });
    expect(interval(resolved, 'W2')).toEqual([179, 191, 191, 179]);
  });

  it('137. carries landings with a moved host while preserving chained offsets', () => {
    const room = chained();
    const moved = resolveLandings(moveWall(room, 'H', { y1: 10, y2: 10 }));
    expect(wallById(moved, 'W1')).toMatchObject({ x1: 60, y1: 10, x2: 60, y2: 40 });

    const lengthened = resolveLandings(moveWall(room, 'H', { x2: 256 }));
    expect(interval(lengthened, 'W2')).toEqual([189, 201, 201, 189]);
  });

  it('138. stretches a wall when the other endpoint is connected', () => {
    let room = makeRoom([
      makeWall('H', 0, 0, 246, 0),
      makeWall('C', 0, 40, 50, 40, {
        connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      }),
      makeWall('B', 50, 40, 50, 0, {
        connections: { start: { wallId: 'C', endpoint: 'end' }, end: null },
      }),
    ]);
    room = landWallEnd(room, 'B', 'end', { wallId: 'H', side: 'front', x: 50 });
    const resolved = resolveLandings(moveWall(room, 'H', { y1: -10, y2: -10 }));

    expect(wallById(resolved, 'B')).toMatchObject({ x1: 50, y1: 40, x2: 50, y2: -10 });
  });

  it('139. snaps to the nearest bounded wall face', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0)]);

    expect(snapToWallFace(room, { x: 60.3, y: 2 }, 6)).toEqual({
      wallId: 'H', side: 'front', x: 60.3, point: { x: 60.3, y: 0 },
    });
    expect(snapToWallFace(room, { x: 100, y: -6 }, 6)).toEqual({
      wallId: 'H', side: 'back', x: 146, point: { x: 100, y: -4.5 },
    });
    expect(snapToWallFace(room, { x: 100, y: 10 }, 6)).toBeNull();
    expect(snapToWallFace(room, { x: 250, y: 1 }, 6)).toBeNull();
  });

  it('140. detects self and indirect landing reference cycles', () => {
    const room = chained();

    expect(landingRefCreatesCycle(room, 'W1', 'H', 'front', 'W2')).toBe(true);
    expect(landingRefCreatesCycle(room, 'W1', 'H', 'front', 'W1')).toBe(true);
    expect(landingRefCreatesCycle(room, 'W2', 'H', 'front', 'left')).toBe(false);
  });

  it('141. releases landing references, run anchors, and hosted landings', () => {
    const room = chained(alcove({ hostRuns: [AL()] }));
    const releasedWing = releaseWall(room, 'W1');
    expect(wallById(releasedWing, 'W2').landings.start).toEqual({
      wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 189,
    });
    expect(wallById(releasedWing, 'H').runs[0].anchors).toEqual({
      left: false,
      right: { to: 'wall', wallId: 'W2' },
    });
    expect(wallById(releasedWing, 'W1').landings.start).not.toBeNull();

    const releasedHost = releaseWall(room, 'H');
    expect(wallById(releasedHost, 'W1').landings.start).toBeNull();
    expect(wallById(releasedHost, 'W2').landings.start).toBeNull();

    const detachedHost = releaseWall(room, 'H', { deleting: false });
    expect(wallById(detachedHost, 'W1').landings.start).toEqual({
      wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60,
    });
  });
});
