import { expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { cornerAt } from '../../model/corners.js';
import { cross, wallFrame, wallLength } from '../../model/geometry.js';
import elevationReducer, {
  createInitialElevationState, setWallCornerAngle,
} from '../../store/elevationSlice.js';
import { disconnectWallEndpoint, setCornerAngle } from '../wallOps.js';

const clipped = room({ walls: [
  wall({ id: 'bottom', x1: 0, y1: 0, x2: 100, y2: 0, connections: {
    start: { wallId: 'left', endpoint: 'end' }, end: { wallId: 'clip', endpoint: 'start' },
  } }),
  wall({ id: 'clip', x1: 100, y1: 0, x2: 120, y2: 20, connections: {
    start: { wallId: 'bottom', endpoint: 'end' }, end: { wallId: 'right', endpoint: 'start' },
  } }),
  wall({ id: 'right', x1: 120, y1: 20, x2: 120, y2: 96, connections: {
    start: { wallId: 'clip', endpoint: 'end' }, end: { wallId: 'top', endpoint: 'start' },
  } }),
  wall({ id: 'top', x1: 120, y1: 96, x2: 0, y2: 96, connections: {
    start: { wallId: 'right', endpoint: 'end' }, end: { wallId: 'left', endpoint: 'start' },
  } }),
  wall({ id: 'left', x1: 0, y1: 96, x2: 0, y2: 0, connections: {
    start: { wallId: 'top', endpoint: 'end' }, end: { wallId: 'bottom', endpoint: 'start' },
  } }),
] });

it('swings a clipped corner while its far end slides along the next wall (MW1)', () => {
  const before = clipped.walls[1];
  expect(cornerAt(clipped, before, 'left').angle).toBeCloseTo(135, 6);
  expect(cornerAt(clipped, before, 'right').angle).toBeCloseTo(135, 6);
  const result = setCornerAngle(clipped, 'clip', 'start', 120);
  expect(result).toMatchObject({ ok: true, reason: null });
  const nextRoom = { ...clipped, walls: result.walls };
  const clip = result.walls[1];
  const neighbor = result.walls[2];
  expect(clip).toMatchObject({ x1: 100, y1: 0, x2: 120 });
  expect(cornerAt(nextRoom, clip, 'left').angle).toBeCloseTo(120, 6);
  expect(neighbor).toMatchObject({ x1: clip.x2, y1: clip.y2, x2: 120, y2: 96 });
  expect(wallFrame(nextRoom, neighbor).d).toEqual(wallFrame(clipped, clipped.walls[2]).d);
  expect(cross({ x: clip.x2 - 120, y: clip.y2 - 96 }, wallFrame(clipped, clipped.walls[2]).d))
    .toBeCloseTo(0, 6);

  const initial = createInitialElevationState({ rooms: [clipped], activeRoomId: clipped.id });
  const state = elevationReducer(initial, setWallCornerAngle({ wallId: 'clip', endpoint: 'start', angle: 120 }));
  expect(state.message).toBeNull();
  expect(state.rooms[0].walls[1]).toMatchObject({ x1: 100, y1: 0, x2: clip.x2, y2: clip.y2 });
});

it('keeps the wall length when the swinging end is free (MW1)', () => {
  const subject = { ...clipped, walls: disconnectWallEndpoint(clipped.walls, 'clip', 'end') };
  const result = setCornerAngle(subject, 'clip', 'start', 120);
  expect(result.ok).toBe(true);
  expect(result.walls[1]).toMatchObject({ x1: 100, y1: 0 });
  expect(wallLength(result.walls[1])).toBeCloseTo(wallLength(subject.walls[1]), 6);
  const nextRoom = { ...subject, walls: result.walls };
  expect(cornerAt(nextRoom, result.walls[1], 'left').angle).toBeCloseTo(120, 6);
});

it('refuses straight, too-short and parallel corner edits with a reason (MW1)', () => {
  const tooShort = 180 - Math.atan2(95.5, 20) * 180 / Math.PI;
  for (const [angle, reason] of [
    [180, 'invalid-angle'],
    [tooShort, 'neighbor-too-short'],
    [90, 'parallel-neighbor'],
  ]) {
    expect(setCornerAngle(clipped, 'clip', 'start', angle)).toEqual({
      ok: false, reason, walls: clipped.walls,
    });
  }
  const initial = createInitialElevationState({ rooms: [clipped], activeRoomId: clipped.id });
  const state = elevationReducer(initial, setWallCornerAngle({ wallId: 'clip', endpoint: 'start', angle: 180 }));
  expect(state.message).toBe('A 180° corner is a straight wall.');
  expect(state.rooms).toBe(initial.rooms);
});

it('leaves a square corner at 90 degrees exactly in place (MW1)', () => {
  const result = setCornerAngle(clipped, 'top', 'start', 90);
  expect(result).toEqual({ ok: true, reason: null, walls: clipped.walls });
});
