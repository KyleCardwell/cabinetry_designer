import { describe, expect, it } from 'vitest';
import { K, K2 } from '../../../test/fixtures/landingRoomK.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, {
  createInitialElevationState, landWallEndpoint, setWallLength,
} from '../elevationSlice.js';

const target = { wallId: 'wall-2', endpoint: 'end', hostId: 'wall-3', side: 'back', x: 85 };
const stateFor = (fixture) => ({
  ...createInitialElevationState(null),
  rooms: [syncRoom(fixture, DEFAULT_SETTINGS)],
  activeRoomId: fixture.id,
  message: 'old',
});
const wallOf = (state, id) => state.rooms[0].walls.find((wall) => wall.id === id);
const wallGeometry = (state) => state.rooms[0].walls.map(
  ({ id, x1, y1, x2, y2, flipped, connections, landings }) => ({
    id, x1, y1, x2, y2, flipped, connections, landings,
  }),
);

describe('land an existing wall endpoint in the store (WL2)', () => {
  it('landing K2 makes the same walls as K without flipping', () => {
    const landed = elevationReducer(stateFor(K2), landWallEndpoint(target));
    expect(wallGeometry(landed)).toEqual(wallGeometry(stateFor(K)));
    expect(landed.message).toBeNull();
  });

  it('subsequent host length edit holds the landing in place', () => {
    const landed = elevationReducer(stateFor(K2), landWallEndpoint(target));
    const resized = elevationReducer(landed, setWallLength({
      wallId: 'wall-3', length: 111, growEnd: 'left',
    }));
    expect(wallOf(resized, 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5,
      landings: { end: { offset: 26 } },
    });
    expect(resized.message).toBeNull();
  });

  it('an off-face target leaves the room unchanged and reports the miss', () => {
    const before = stateFor(K2);
    const after = elevationReducer(before, landWallEndpoint({ ...target, x: 130 }));
    expect(after).toEqual({ ...before, message: 'Wall 2 would miss the end of Wall 3.' });
    expect(after.rooms).toBe(before.rooms);
  });

  it('a connected start is not free and clears the message', () => {
    const before = stateFor(K2);
    const after = elevationReducer(before, landWallEndpoint({ ...target, endpoint: 'start' }));
    expect(after).toEqual({ ...before, message: null });
    expect(after.rooms).toBe(before.rooms);
  });

  it('ignores malformed payloads without changing the state or message', () => {
    const before = stateFor(K2);
    for (const changes of [
      { endpoint: 'middle' }, { side: 'inside' }, { x: NaN }, { x: Infinity },
      { wallId: 'missing' }, { hostId: 'missing' }, { hostId: 'wall-2' },
      { roomId: 'missing' },
    ]) {
      const after = elevationReducer(before, landWallEndpoint({ ...target, ...changes }));
      expect(after).toBe(before);
    }
  });
});
