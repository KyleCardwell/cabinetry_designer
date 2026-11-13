import { describe, expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { landingInterval, landWallEnd } from '../../model/landings.js';
import { syncRoom } from '../../model/room.js';
import { wallSideFrame } from '../../model/wallSides.js';
import elevationReducer, {
  createInitialElevationState, setWallLanding,
} from '../elevationSlice.js';

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

describe('typed landing distances in the store (WL1)', () => {
  it('slides the landed wall and stretches its connected neighbour', () => {
    const before = initial.rooms[0];
    expect(wallFrame(before, byId(before, 'wall-2')).n).toEqual({ x: 1, y: 0 });
    expect(wallFrame(before, byId(before, 'wall-3'))).toMatchObject({
      length: 124, leftEndpoint: 'start', leftPoint: { x: 0.5, y: 9 }, r: { x: -1, y: 0 },
    });
    expect(wallSideFrame(before, byId(before, 'wall-3'), 'back')).toMatchObject({
      leftEndpoint: 'end', rightEndpoint: 'start', leftPoint: { x: -123.5, y: 13.5 }, r: { x: 1, y: 0 },
    });
    expect(landingInterval(before, byId(before, 'wall-2'), 'end')).toMatchObject({ a: 80.5, b: 85 });
    const state = elevationReducer({ ...initial, message: 'old' }, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: 26,
    }));
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -25.5, y1: 83.5, x2: -25.5, y2: 13.5,
      landings: { end: { ref: 'right', to: 'near', offset: 26 } },
    });
    expect(byId(state.rooms[0], 'wall-1')).toMatchObject({ x1: 123.5, y1: 83.5, x2: -25.5, y2: 83.5 });
    expect(byId(state.rooms[0], 'wall-3')).toEqual(byId(before, 'wall-3'));
    expect(state.message).toBeNull();
  });

  it('moves the host free end on its mirrored back face', () => {
    const state = elevationReducer(initial, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: 26, move: 'host',
    }));
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({ x1: -12.5, y1: 9, x2: -123.5, y2: 9 });
    expect(byId(state.rooms[0], 'wall-2')).toEqual({
      ...byId(initial.rooms[0], 'wall-2'),
      landings: { start: null, end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 26 } },
    });
    expect(byId(state.rooms[0], 'wall-4')).toEqual(byId(initial.rooms[0], 'wall-4'));
    expect(state.message).toBeNull();
  });

  it('measures the new reference before moving the host corner and neighbour', () => {
    const state = elevationReducer(initial, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', ref: 'left', offset: 67.5, move: 'host',
    }));
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({ x1: 0.5, y1: 9, x2: -110.5, y2: 9 });
    expect(byId(state.rooms[0], 'wall-4')).toMatchObject({ x1: -110.5, y1: 9, x2: -110.5, y2: -83 });
    expect(byId(state.rooms[0], 'wall-2')).toEqual({
      ...byId(initial.rooms[0], 'wall-2'),
      landings: { start: null, end: { wallId: 'wall-3', side: 'back', ref: 'left', to: 'near', offset: 67.5 } },
    });
    expect(state.message).toBeNull();
  });

  it('slides the landed wall using a new reference', () => {
    const state = elevationReducer(initial, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', ref: 'left', offset: 67.5,
    }));
    expect(byId(state.rooms[0], 'wall-2')).toMatchObject({
      x1: -51.5, y1: 83.5, x2: -51.5, y2: 13.5,
      landings: { end: { ref: 'left', offset: 67.5 } },
    });
    expect(byId(state.rooms[0], 'wall-1')).toMatchObject({ x2: -51.5, y2: 83.5 });
    expect(byId(state.rooms[0], 'wall-3')).toEqual(byId(initial.rooms[0], 'wall-3'));
  });

  it('refuses the complete edit when the host would leave the landing off its face', () => {
    const state = elevationReducer(initial, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: -5, move: 'host',
    }));
    expect(state).toEqual({
      ...initial,
      message: "Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.",
      messageAction: {
        message: "Wall 3 can't end there: Wall 2 lands on it. Move or detach Wall 2 first.",
        label: 'Make corner',
        kind: 'make-corner',
        payload: { roomId: K.id, wallId: 'wall-2', endpoint: 'end', hostEndpoint: 'start', move: 'host' },
      },
    });
    expect(state.rooms).toBe(initial.rooms);
  });

  it('refuses host movement when measured from another landed wall', () => {
    const subject = { ...K, walls: [...K.walls, wall({
      id: 'wall-5', x1: -80, y1: 13.5, x2: -80, y2: 40, thickness: 4.5,
      connections: { start: null, end: null }, landings: { start: null, end: null },
    })] };
    const landed = landWallEnd(subject, 'wall-5', 'start', { wallId: 'wall-3', side: 'back', x: 43.5 });
    let state = { ...initial, rooms: [syncRoom(landed, DEFAULT_SETTINGS)] };
    state = elevationReducer(state, setWallLanding({ wallId: 'wall-2', endpoint: 'end', ref: 'wall-5' }));
    const current = byId(state.rooms[0], 'wall-2').landings.end.offset;
    const refused = elevationReducer(state, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: current + 1, move: 'host',
    }));
    expect(refused).toEqual({ ...state, message: 'Measure from an end of Wall 3 to move Wall 3.' });
    expect(refused.rooms).toBe(state.rooms);
    const unchanged = elevationReducer(state, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: current, move: 'host',
    }));
    expect(unchanged.rooms).toEqual(state.rooms);
    expect(unchanged.message).toBeNull();
  });

  it('without an offset re-measures only, preserving the previous message and ignoring move', () => {
    const state = elevationReducer({ ...initial, message: 'old' }, setWallLanding({
      wallId: 'wall-2', endpoint: 'end', ref: 'left', move: 'ignored',
    }));
    expect(state.rooms[0]).toEqual({
      ...initial.rooms[0],
      walls: initial.rooms[0].walls.map((entry) => entry.id === 'wall-2' ? {
        ...entry, landings: { start: null, end: { ...entry.landings.end, ref: 'left', offset: 80.5 } },
      } : entry),
    });
    expect(state.message).toBe('old');
  });

  it('entering the current distance leaves all geometry unchanged', () => {
    for (const move of ['landed', 'host']) {
      const state = elevationReducer(initial, setWallLanding({
        wallId: 'wall-2', endpoint: 'end', offset: 39, move,
      }));
      expect(state.rooms).toEqual(initial.rooms);
      expect(state.message).toBeNull();
    }
  });

  it('ignores invalid typed offsets, moves, references, targets and endpoints', () => {
    for (const payload of [
      { offset: NaN }, { offset: Infinity }, { offset: '26' }, { offset: null },
      { offset: 26, move: 'other' }, { offset: 26, move: null },
      { offset: 26, ref: 'missing' }, { offset: 26, to: 'side' }, { offset: 26, endpoint: 'start' },
    ]) {
      expect(elevationReducer(initial, setWallLanding({
        wallId: 'wall-2', endpoint: 'end', ...payload,
      }))).toBe(initial);
    }
  });
});
