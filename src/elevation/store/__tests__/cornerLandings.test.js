import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { K, KC } from '../../../test/fixtures/landingRoomK.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, {
  createInitialElevationState, extendPastCorner, makeWallCorner, setMessage, setWallLength,
} from '../elevationSlice.js';
import { toElevationDocument } from '../persistence.js';

const base = createInitialElevationState(null);
const initial = { ...base, rooms: [syncRoom(K, base.settings)], activeRoomId: K.id };
const corner = { ...base, rooms: [syncRoom(KC, base.settings)], activeRoomId: KC.id };
const refusal = "Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.";
const shrink = setWallLength({ wallId: 'wall-3', length: 84, growEnd: 'left' });
const cornerAction = {
  message: refusal, label: 'Make corner', kind: 'make-corner',
  payload: { roomId: K.id, wallId: 'wall-2', endpoint: 'end', hostEndpoint: 'start', move: 'host' },
};
const geometry = (subject) => subject.walls.map(({
  id, x1, y1, x2, y2, flipped, connections, landings,
}) => ({ id, x1, y1, x2, y2, flipped, connections, landings }));

describe('WL3 c: corner and landing store actions', () => {
  it('anchor 1: makes KC by moving the host and clears the message', () => {
    const state = elevationReducer({ ...initial, message: 'old' }, makeWallCorner({
      wallId: 'wall-2', endpoint: 'end', move: 'host',
    }));
    expect(geometry(state.rooms[0])).toEqual(geometry(KC));
    expect(state.message).toBeNull();
    expect(state.messageAction).toBeNull();
    expect(geometry(initial.rooms[0])).toEqual(geometry(K));
  });

  it('anchor 2: extends KC back to K through the compensation pipeline', () => {
    const state = elevationReducer({ ...corner, message: 'old' }, extendPastCorner({
      wallId: 'wall-3', endpoint: 'start', amount: 39,
    }));
    expect(geometry(state.rooms[0])).toEqual(geometry(K));
    expect(state.message).toBeNull();
    expect(state.messageAction).toBeNull();
  });

  it('anchor 3: refuses the shrink and offers the exact corner action', () => {
    const state = elevationReducer(initial, shrink);
    expect(state.rooms).toBe(initial.rooms);
    expect(state.message).toBe(refusal);
    expect(state.messageAction).toEqual(cornerAction);
  });

  it('anchor 4: dispatching the refusal action makes KC', () => {
    const refused = elevationReducer(initial, shrink);
    const state = elevationReducer(refused, makeWallCorner(refused.messageAction.payload));
    expect(geometry(state.rooms[0])).toEqual(geometry(KC));
    expect(state.message).toBeNull();
    // Only hold refusal and setMessage update the action; the toast matches its message.
    expect(state.messageAction).toBe(refused.messageAction);
  });

  it.each([null, 'another message'])('anchor 5: setMessage(%s) clears the refusal action', (message) => {
    const refused = elevationReducer(initial, shrink);
    const state = elevationReducer(refused, setMessage(message));
    expect(state.message).toBe(message);
    expect(state.messageAction).toBeNull();
    expect(state.rooms).toBe(refused.rooms);
  });

  it('anchor 6: refuses past a connected host end and clears a previous action', () => {
    const refused = elevationReducer(initial, shrink);
    const state = elevationReducer(refused, setWallLength({
      wallId: 'wall-3', length: 43, growEnd: 'right',
    }));
    expect(state.rooms).toBe(initial.rooms);
    expect(state.message).toBe(refusal);
    expect(state.messageAction).toBeNull();
  });

  it('anchor 7: compensates the released front run and anchors the back run to the landing', () => {
    const subject = room({ ...KC, walls: KC.walls.map((entry) => {
      if (entry.id === 'wall-3') return { ...entry, runs: [
        run({ id: 'back', wallSide: 'back', x: 20, width: 50,
          anchors: { left: false, right: true } }),
        run({ id: 'front', x: 0, width: 30, anchors: { left: true, right: false } }),
        run({ id: 'other', anchors: { left: { to: 'wall', wallId: 'wall-4' }, right: true } }),
      ] };
      if (entry.id === 'wall-2') return { ...entry, runs: [
        run({ id: 'own', x: 10, width: 30, anchors: { left: false, right: true } }),
      ] };
      return entry;
    }) });
    const before = { ...corner, rooms: [syncRoom(subject, base.settings)] };
    const state = elevationReducer(before, extendPastCorner({
      wallId: 'wall-3', endpoint: 'start', amount: 39,
    }));
    const [back, front, other] = state.rooms[0].walls[2].runs;
    expect(front.x).toBe(39);
    expect(front.anchors.left).toBe(false);
    expect(state.rooms[0].walls[2].x1 - front.x).toBe(-38.5);
    expect(back.anchors.right).toEqual({ to: 'wall', wallId: 'wall-2' });
    expect(back.x + back.width).toBe(80.5);
    expect(other.anchors).toEqual(before.rooms[0].walls[2].runs[2].anchors);
    expect(state.rooms[0].walls[1].runs[0].anchors).toEqual(before.rooms[0].walls[1].runs[0].anchors);
  });

  it('anchor 8: refuses when both host ends are joined without creating a message action', () => {
    const subject = room({ ...K, walls: [
      ...K.walls.map((entry) => entry.id === 'wall-3' ? {
        ...entry, connections: { ...entry.connections, start: { wallId: 'wall-5', endpoint: 'start' } },
      } : entry),
      wall({ id: 'wall-5', x1: 0.5, y1: 9, x2: 0.5, y2: -40,
        connections: { start: { wallId: 'wall-3', endpoint: 'start' }, end: null } }),
    ] });
    // Keep the shared fixture's wallOrder, as in the model anchor.
    const before = { ...initial, rooms: [subject] };
    const state = elevationReducer(before, makeWallCorner({ wallId: 'wall-2', endpoint: 'end', move: 'host' }));
    expect(state.rooms).toBe(before.rooms);
    expect(state.message).toBe('Wall 3 has no free end to make a corner with Wall 2.');
    expect(state.messageAction).toBeNull();
    const synced = elevationReducer({ ...before, rooms: [syncRoom(subject, base.settings)] },
      makeWallCorner({ wallId: 'wall-2', endpoint: 'end', move: 'host' }));
    expect(synced.message).toBe('Wall 4 has no free end to make a corner with Wall 2.');
  });

  it('anchor 9: ignores invalid reducer inputs without changing messages or rooms', () => {
    const before = elevationReducer(initial, shrink);
    const make = { wallId: 'wall-2', endpoint: 'end', move: 'host' };
    const extend = { wallId: 'wall-3', endpoint: 'start', amount: 39 };
    const actions = [
      ...[-1, NaN, Infinity, '39', undefined].map((amount) => extendPastCorner({ ...extend, amount })),
      makeWallCorner({ ...make, move: 'both' }),
      makeWallCorner({ ...make, endpoint: 'invalid' }),
      makeWallCorner({ ...make, hostEndpoint: 'invalid' }),
      makeWallCorner({ ...make, endpoint: 'start' }),
      makeWallCorner({ ...make, wallId: 'missing' }),
      makeWallCorner({ ...make, roomId: 'missing' }),
      extendPastCorner({ ...extend, roomId: 'missing' }),
    ];
    for (const action of actions) expect(elevationReducer(before, action)).toBe(before);
  });

  it('defaults to moving the landed wall and respects an explicit room and host end', () => {
    const state = elevationReducer({ ...initial, activeRoomId: 'missing' }, makeWallCorner({
      roomId: K.id, wallId: 'wall-2', endpoint: 'end', hostEndpoint: 'start',
    }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 0.5, x2: 0.5, y2: 9 });
    expect(state.rooms[0].walls[2].connections.start).toEqual({ wallId: 'wall-2', endpoint: 'end' });
    expect(state.message).toBeNull();
  });

  it('applies the hold rule when making a corner would pass another landed wall', () => {
    const subject = room({ ...K, walls: [...K.walls, wall({
      id: 'wall-5', x1: -30, y1: 83.5, x2: -30, y2: 13.5, thickness: 4.5,
      landings: {
        start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 153.5 },
        end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 30.5 },
      },
    })] });
    const before = { ...initial, rooms: [syncRoom(subject, base.settings)] };
    const state = elevationReducer(before, makeWallCorner({ wallId: 'wall-2', endpoint: 'end', move: 'host' }));
    expect(state.rooms).toBe(before.rooms);
    expect(state.message).toBe("Wall 3 can't end there: Wall 5 lands on it. Move or detach Wall 5 first.");
    expect(state.messageAction).toBeNull();
  });

  it('passes through a model refusal without changing the existing message action', () => {
    const before = elevationReducer(initial, shrink);
    const state = elevationReducer(before, extendPastCorner({ wallId: 'wall-2', endpoint: 'end', amount: 0 }));
    expect(state.rooms).toBe(before.rooms);
    expect(state.message).toBeNull();
    expect(state.messageAction).toBe(before.messageAction);
  });

  it('starts with a null action and excludes it from persisted documents', () => {
    expect(base.messageAction).toBeNull();
    const refused = elevationReducer(initial, shrink);
    const document = toElevationDocument(refused);
    expect(document).not.toHaveProperty('messageAction');
    expect(createInitialElevationState({ ...document, messageAction: cornerAction }).messageAction).toBeNull();
  });
});
