import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { cross, subtract } from '../../model/geometry.js';
import { compensateRuns, syncRoom } from '../../model/room.js';
import { moveWallPerpendicular } from '../wallOps.js';

function run(id, anchors = { left: false, right: false }) {
  return {
    id,
    cabinetTypeId: 1,
    x: 30,
    width: 20,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'filler', width: 1.5 },
      right: { type: 'filler', width: 1.5 },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: 17 }],
    heightMode: 'manual',
    overrides: {},
    anchors,
  };
}

function roomR(overrides = {}) {
  const wallA = {
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
    connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
    profile: {},
    runs: [],
    ...overrides.wallA,
  };
  const wallB = {
    id: 'B',
    name: '',
    numberOverride: null,
    x1: 120,
    y1: 0,
    x2: 120,
    y2: 96,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    profile: {},
    runs: [],
    ...overrides.wallB,
  };
  return {
    id: 'R',
    name: 'Room R',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A', 'B'],
    walls: [wallA, wallB],
  };
}

describe('moveWallPerpendicular', () => {
  it('13. moves A outward and lengthens B without changing its angle', () => {
    const room = roomR();
    const result = moveWallPerpendicular(room, 'A', -10);
    const wallA = result.walls.find((wall) => wall.id === 'A');
    const wallB = result.walls.find((wall) => wall.id === 'B');

    expect(result).toMatchObject({ ok: true, reason: null });
    expect(wallA).toMatchObject({ x1: 0, y1: -10, x2: 120, y2: -10 });
    expect(wallB).toMatchObject({ x1: 120, y1: -10, x2: 120, y2: 96 });
    expect(Math.hypot(wallB.x2 - wallB.x1, wallB.y2 - wallB.y1)).toBe(106);
    expect(room.walls[0]).toMatchObject({ y1: 0, y2: 0 });
  });

  it('14. intersects a 135-degree neighbor on its original line', () => {
    const room = roomR({ wallB: { x2: 120 + 67.8823, y2: 67.8823 } });
    const oldB = room.walls[1];
    const result = moveWallPerpendicular(room, 'A', 5);
    const wallB = result.walls.find((wall) => wall.id === 'B');
    const oldDirection = subtract(
      { x: oldB.x2, y: oldB.y2 },
      { x: oldB.x1, y: oldB.y1 },
    );
    const newDirection = subtract(
      { x: wallB.x2, y: wallB.y2 },
      { x: wallB.x1, y: wallB.y1 },
    );

    expect(wallB.x1).toBeCloseTo(125, 6);
    expect(wallB.y1).toBeCloseTo(5, 6);
    expect(cross(oldDirection, newDirection)).toBeCloseTo(0, 6);

    const parallel = roomR({ wallB: { x2: 200, y2: 0 } });
    const parallelResult = moveWallPerpendicular(parallel, 'A', 5);
    expect(parallelResult.walls.find((wall) => wall.id === 'B')).toMatchObject({
      x1: 120,
      y1: 5,
    });
  });

  it('15. rejects a move that collapses a connected neighbor', () => {
    const room = roomR();
    const result = moveWallPerpendicular(room, 'A', 96);

    expect(result).toEqual({
      ok: false,
      reason: 'neighbor-too-short',
      walls: room.walls,
    });
    expect(room.walls[0]).toMatchObject({ y1: 0, y2: 0 });
    expect(room.walls[1]).toMatchObject({ y1: 0, y2: 96 });
  });

  it('16. compensates unanchored runs and lets sync resolve anchored runs', () => {
    const room = roomR({
      wallB: {
        runs: [
          run('free'),
          run('anchored', { left: true, right: false }),
        ],
      },
    });
    const moved = moveWallPerpendicular(room, 'A', -10);
    const compensated = compensateRuns(room, { ...room, walls: moved.walls });
    const compensatedRuns = compensated.walls[1].runs;

    expect(compensatedRuns[0].x).toBe(40);
    expect(compensatedRuns[1].x).toBe(30);
    expect(syncRoom(compensated, DEFAULT_SETTINGS).walls[1].runs[1].x).toBe(0);
  });
});
