import { expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { computeWallOrder, elevationLetters, firstWallBlocker, wallNumbers } from '../topology.js';
import elevationReducer, {
  createInitialElevationState,
  deleteWall,
  makeWallFirst,
} from '../../store/elevationSlice.js';

const rectangle = [
  wall({ id: 'W1', x1: 0, y1: 0, x2: 120, y2: 0, connections: {
    start: { wallId: 'W4', endpoint: 'end' }, end: { wallId: 'W2', endpoint: 'start' },
  } }),
  wall({ id: 'W2', x1: 120, y1: 0, x2: 120, y2: 96, connections: {
    start: { wallId: 'W1', endpoint: 'end' }, end: { wallId: 'W3', endpoint: 'start' },
  } }),
  wall({ id: 'W3', x1: 120, y1: 96, x2: 0, y2: 96, connections: {
    start: { wallId: 'W2', endpoint: 'end' }, end: { wallId: 'W4', endpoint: 'start' },
  } }),
  wall({ id: 'W4', x1: 0, y1: 96, x2: 0, y2: 0, connections: {
    start: { wallId: 'W3', endpoint: 'end' }, end: { wallId: 'W1', endpoint: 'start' },
  } }),
];

it('makes the chosen cycle wall number 1 and elevation A in the same direction (MW1)', () => {
  const walls = structuredClone(rectangle);
  walls[2].numberOverride = 7;
  walls[2].runs = [run({ width: 60, x: 24 })];
  const initial = createInitialElevationState({
    rooms: [room({ walls })], activeRoomId: 'room-1', settings: DEFAULT_SETTINGS,
  });
  const before = initial.rooms[0].wallOrder;
  expect(before).toEqual(['W1', 'W2', 'W3', 'W4']);

  const next = elevationReducer(initial, makeWallFirst({ wallId: 'W3' })).rooms[0];
  expect(next.firstWallId).toBe('W3');
  expect(next.wallOrder).toEqual([...before.slice(2), ...before.slice(0, 2)]);
  expect(next.walls[2].numberOverride).toBeNull();
  expect(wallNumbers(next).get('W3')).toBe(1);
  expect(elevationLetters(next).get('W3')).toBe('A');

  const island = wall({ id: 'island', x1: 240, x2: 300 });
  expect(computeWallOrder({ ...next, walls: [island, ...next.walls] }, ['island', ...before]))
    .toEqual([...next.wallOrder, 'island']);
});

it('starts at the chosen first-drawn wall after closing and redrawing a gap (MW1)', () => {
  const walls = structuredClone(rectangle);
  const closingWall = walls.splice(2, 1)[0];
  walls[1].connections.end = null;
  walls[2].connections.start = null;
  let current = syncRoom(room({ walls }), DEFAULT_SETTINGS);
  expect(current.wallOrder).toEqual(['W4', 'W1', 'W2']);

  current.walls[1].connections.end = { wallId: 'W3', endpoint: 'start' };
  current.walls[2].connections.start = { wallId: 'W3', endpoint: 'end' };
  current.walls.push(closingWall);
  current = syncRoom(current, DEFAULT_SETTINGS);
  expect(current.wallOrder).toEqual(['W4', 'W1', 'W2', 'W3']);
  current.firstWallId = 'W1';
  current = syncRoom(current, DEFAULT_SETTINGS);
  expect(current.wallOrder).toEqual(['W1', 'W2', 'W3', 'W4']);

  current.walls = current.walls.filter(({ id }) => id !== 'W3');
  current.walls[1].connections.end = null;
  current.walls[2].connections.start = null;
  current = syncRoom(current, DEFAULT_SETTINGS);
  expect(current.wallOrder).toEqual(['W4', 'W1', 'W2']);
  current.walls[1].connections.end = { wallId: 'W3', endpoint: 'start' };
  current.walls[2].connections.start = { wallId: 'W3', endpoint: 'end' };
  current.walls.push(closingWall);
  current = syncRoom(current, DEFAULT_SETTINGS);
  expect(current.firstWallId).toBe('W1');
  expect(current.wallOrder).toEqual(['W1', 'W2', 'W3', 'W4']);
});

it('blocks open-chain and typed-number conflicts and drops a deleted first wall (MW1)', () => {
  const walls = structuredClone(rectangle).slice(0, 3);
  walls[0].connections.start = null;
  walls[2].connections.end = null;
  const chain = syncRoom(room({ walls, firstWallId: 'W1' }), DEFAULT_SETTINGS);
  expect(firstWallBlocker(chain, 'W2')).toEqual({ code: 'open-chain', wallId: 'W1' });
  expect(firstWallBlocker(chain, 'W1')).toBeNull();
  const initial = createInitialElevationState({
    rooms: [chain], activeRoomId: 'room-1', settings: DEFAULT_SETTINGS,
  });
  expect(elevationReducer(initial, makeWallFirst({ wallId: 'W2' }))).toBe(initial);

  const taken = structuredClone(chain);
  taken.walls[2].numberOverride = 1;
  expect(firstWallBlocker(taken, 'W2')).toEqual({ code: 'number-taken', wallId: 'W3' });
  const conflicted = createInitialElevationState({
    rooms: [taken], activeRoomId: 'room-1', settings: DEFAULT_SETTINGS,
  });
  expect(elevationReducer(conflicted, makeWallFirst({ wallId: 'W2' }))).toBe(conflicted);

  const deleted = elevationReducer(initial, deleteWall({ wallId: 'W1' })).rooms[0];
  expect(deleted).not.toHaveProperty('firstWallId');
});
