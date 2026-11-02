import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, {
  connectWalls, createInitialElevationState, moveWallEndpoint, moveWallPerpendicular, setWallLength,
} from '../elevationSlice.js';
import { setCompensatedWalls } from '../slices/helpers.js';

const K = room({
  wallOrder: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
  walls: [
    wall({
      id: 'wall-1', x1: 123.5, y1: 83.5, x2: -38.5, y2: 83.5, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-2', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-2', x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5, thickness: 4.5,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null },
      landings: {
        start: null,
        end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 39 },
      },
    }),
    wall({
      id: 'wall-3', x1: 0.5, y1: 9, x2: -123.5, y2: 9, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-4', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-4', x1: -123.5, y1: 9, x2: -123.5, y2: -83, thickness: 4.5,
      connections: { start: { wallId: 'wall-3', endpoint: 'end' }, end: null },
      landings: { start: null, end: null },
    }),
  ],
});

const byId = (subject, id) => subject.walls.find((entry) => entry.id === id);
const initial = {
  ...createInitialElevationState(null), rooms: [syncRoom(K, DEFAULT_SETTINGS)], activeRoomId: K.id,
};
const refusal = "Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.";

describe('WL1 b: host edits hold landed walls in the store', () => {
  it.each([
    ['anchor 1: length edit', setWallLength({ wallId: 'wall-3', length: 111, growEnd: 'left' })],
    ['anchor 2: endpoint edit', moveWallEndpoint({ wallId: 'wall-3', endpoint: 'start', x: -12.5, y: 9 })],
  ])('%s holds the landed wall square with offset 26', (_, action) => {
    const state = elevationReducer(initial, action);
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({
      x1: -12.5, y1: 9, x2: -123.5, y2: 9,
    });
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5,
      landings: { end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 26 } },
    });
    expect(state.message).toBeNull();
    expect(byId(initial.rooms[0], 'wall-3').x1).toBe(0.5);
    expect(byId(initial.rooms[0], 'wall-2').landings.end.offset).toBe(39);
  });

  it.each([
    ['anchor 3: length edit', setWallLength({ wallId: 'wall-3', length: 84, growEnd: 'left' })],
    ['endpoint edit', moveWallEndpoint({ wallId: 'wall-3', endpoint: 'start', x: -39.5, y: 9 })],
  ])('%s refuses an off-host landing without changing the room', (_, action) => {
    const before = { ...initial, message: 'old' };
    const state = elevationReducer(before, action);
    expect(state).toEqual({
      ...before,
      message: refusal,
      messageAction: {
        message: refusal, label: 'Make corner', kind: 'make-corner',
        payload: { roomId: K.id, wallId: 'wall-2', endpoint: 'end', hostEndpoint: 'start', move: 'host' },
      },
    });
    expect(state.rooms).toBe(before.rooms);
  });

  it('anchor 4: moving the host across its face stretches only the landed end', () => {
    const state = elevationReducer({ ...initial, message: 'old' }, moveWallPerpendicular({
      wallId: 'wall-3', delta: 2,
    }));
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({
      x1: 0.5, y1: 7, x2: -123.5, y2: 7,
    });
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 11.5, landings: { end: { offset: 39 } },
    });
    expect(state.message).toBeNull();
  });

  it('anchor 5: moving the landed wall still re-measures its own offset', () => {
    const state = elevationReducer(initial, moveWallPerpendicular({ wallId: 'wall-2', delta: 13 }));
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -25.5, y1: 83.5, x2: -25.5, y2: 13.5, landings: { end: { offset: 26 } },
    });
    expect(byId(state.rooms[0], 'wall-1')).toMatchObject({ x2: -25.5, y2: 83.5 });
    expect(state.message).toBeNull();
  });

  it('anchor 6: keeps Room 10 Wall 5 square when Wall 6 shrinks from its free end', () => {
    const source = JSON.parse(readFileSync(new URL(
      '../../model/__tests__/fixtures/room10bt.json', import.meta.url,
    ), 'utf8'));
    const subject = syncRoom(source, DEFAULT_SETTINGS);
    const host = subject.walls.find((entry) => entry.name === 'Wall 6');
    const landed = subject.walls.find((entry) => entry.name === 'Wall 5');
    const state = elevationReducer({ ...initial, rooms: [subject], activeRoomId: subject.id },
      setWallLength({ wallId: host.id, length: 114, growEnd: 'left' }));
    expect(byId(state.rooms[0], host.id)).toMatchObject({ x1: -16, y1: 8, x2: -130, y2: 8 });
    expect(byId(state.rooms[0], landed.id)).toMatchObject({
      x1: -32, y1: 82.5, x2: -32, y2: 12.5, landings: { end: { offset: 16 } },
    });
    expect(state.message).toBeNull();
  });

  it('holds the landing when connecting another wall moves the host endpoint', () => {
    const subject = syncRoom({ ...K, walls: [...K.walls, wall({
      id: 'wall-5', x1: -12.5, y1: -40, x2: -12.5, y2: 9,
    })] }, DEFAULT_SETTINGS);
    const state = elevationReducer({ ...initial, rooms: [subject] }, connectWalls({
      wallId1: 'wall-5', endpoint1: 'end', wallId2: 'wall-3', endpoint2: 'start',
    }));
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({
      x1: -12.5, y1: 9, connections: { start: { wallId: 'wall-5', endpoint: 'end' } },
    });
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5, landings: { end: { offset: 26 } },
    });
  });

  it('returns whether compensated walls were accepted and preserves rooms on refusal', () => {
    const state = { ...initial, rooms: [...initial.rooms] };
    const edited = (x1) => K.walls.map((entry) => entry.id === 'wall-3' ? { ...entry, x1 } : entry);
    expect(setCompensatedWalls(state, 0, edited(-39.5))).toBe(false);
    expect(state.rooms[0]).toBe(initial.rooms[0]);
    expect(state.message).toBe(refusal);
    expect(setCompensatedWalls(state, 0, edited(-12.5))).toBe(true);
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({ x2: -38.5, landings: { end: { offset: 26 } } });
  });
});
