import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerAt } from '../corners.js';
import { wallFrame } from '../geometry.js';
import { syncRoom } from '../room.js';
import {
  chainOrientation,
  nextWallId,
  normalizeWallName,
  wallComponents,
  wallLabel,
  wallNumbers,
  wallNumberWarnings,
} from '../topology.js';

function wall(id, x1, y1, x2, y2, connections = { start: null, end: null }) {
  return {
    id,
    name: '',
    numberOverride: null,
    x1,
    y1,
    x2,
    y2,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections,
    profile: {},
    runs: [],
  };
}

function roomR() {
  return {
    id: 'R',
    name: 'Room R',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: [],
    walls: [
      wall('A', 0, 0, 120, 0, {
        start: null,
        end: { wallId: 'B', endpoint: 'start' },
      }),
      wall('B', 120, 0, 120, 96, {
        start: { wallId: 'A', endpoint: 'end' },
        end: null,
      }),
    ],
  };
}

function roomWithC() {
  const room = roomR();
  room.wallOrder = ['A', 'B'];
  room.walls[0].connections.start = { wallId: 'C', endpoint: 'end' };
  room.walls.push(wall('C', 0, 96, 0, 0, {
    start: null,
    end: { wallId: 'A', endpoint: 'start' },
  }));
  return syncRoom(room, DEFAULT_SETTINGS);
}

describe('wall topology and numbering', () => {
  it('1. traverses and numbers room R as A then B', () => {
    const room = syncRoom(roomR(), DEFAULT_SETTINGS);
    const components = wallComponents(room);
    expect(components).toEqual([{
      kind: 'path',
      walls: [
        { wallId: 'A', from: 'start', to: 'end' },
        { wallId: 'B', from: 'start', to: 'end' },
      ],
    }]);
    expect(chainOrientation(room, components[0])).toBe(1);
    expect(room.wallOrder).toEqual(['A', 'B']);
    expect([...wallNumbers(room)]).toEqual([['A', 1], ['B', 2]]);
  });

  it('2. prepends C when it connects to A left and uses chain normals', () => {
    const room = roomWithC();
    expect(room.wallOrder).toEqual(['C', 'A', 'B']);
    expect(wallNumbers(room).get('C')).toBe(1);
    expect(wallFrame(room, room.walls.find(({ id }) => id === 'C')).n).toEqual({ x: 1, y: 0 });
    expect(wallFrame(room, room.walls.find(({ id }) => id === 'A')).n).toEqual({ x: 0, y: 1 });
    expect(wallFrame(room, room.walls.find(({ id }) => id === 'B')).n).toEqual({ x: -1, y: 0 });
  });

  it('3. produces the same order and normals when every wall is drawn backwards', () => {
    const room = syncRoom({
      ...roomR(),
      wallOrder: ['A', 'B'],
      walls: [
        wall('A', 120, 0, 0, 0, {
          start: { wallId: 'B', endpoint: 'end' },
          end: { wallId: 'C', endpoint: 'start' },
        }),
        wall('B', 120, 96, 120, 0, {
          start: null,
          end: { wallId: 'A', endpoint: 'start' },
        }),
        wall('C', 0, 0, 0, 96, {
          start: { wallId: 'A', endpoint: 'end' },
          end: null,
        }),
      ],
    }, DEFAULT_SETTINGS);
    expect(room.wallOrder).toEqual(['C', 'A', 'B']);
    expect(wallFrame(room, room.walls[2]).n).toEqual({ x: 1, y: 0 });
    expect(wallFrame(room, room.walls[0]).n).toEqual({ x: 0, y: 1 });
    expect(wallFrame(room, room.walls[1]).n).toEqual({ x: -1, y: 0 });
  });

  it('4. keeps C first when the chain closes into a cycle', () => {
    const room = roomWithC();
    room.walls.find(({ id }) => id === 'B').connections.end = {
      wallId: 'D', endpoint: 'start',
    };
    room.walls.find(({ id }) => id === 'C').connections.start = {
      wallId: 'D', endpoint: 'end',
    };
    room.walls.push(wall('D', 120, 96, 0, 96, {
      start: { wallId: 'B', endpoint: 'end' },
      end: { wallId: 'C', endpoint: 'start' },
    }));
    const synced = syncRoom(room, DEFAULT_SETTINGS);
    expect(wallComponents(synced)[0].kind).toBe('cycle');
    expect(synced.wallOrder).toEqual(['C', 'A', 'B', 'D']);
  });

  it('5. reserves overrides and reports duplicate overrides', () => {
    const room = roomWithC();
    room.walls.find(({ id }) => id === 'B').numberOverride = 1;
    expect([...wallNumbers(room)]).toEqual([['B', 1], ['C', 2], ['A', 3]]);
    room.walls.find(({ id }) => id === 'A').numberOverride = 1;
    expect(wallNumberWarnings(room)).toEqual([{
      code: 'duplicate-wall-number',
      wallIds: ['A', 'B'],
    }]);
  });

  it('6. labels custom names and normalizes generated legacy names', () => {
    const room = roomWithC();
    const wallA = room.walls.find(({ id }) => id === 'A');
    expect(wallLabel(room, wallA)).toBe('Wall 2');
    wallA.name = 'Sink wall';
    expect(wallLabel(room, wallA)).toBe('Wall 2 · Sink wall');
    expect(normalizeWallName('Wall 7')).toBe('');
  });

  it('7. keeps the first chain stable when extending a second chain', () => {
    const room = syncRoom({
      ...roomR(),
      walls: [...roomR().walls, wall('E', 200, 0, 260, 0)],
    }, DEFAULT_SETTINGS);
    const extended = {
      ...room,
      walls: room.walls.map((candidate) => candidate.id === 'E'
        ? { ...candidate, connections: { ...candidate.connections, end: { wallId: 'F', endpoint: 'start' } } }
        : candidate),
    };
    extended.walls.push(wall('F', 260, 0, 300, 0, {
      start: { wallId: 'E', endpoint: 'end' },
      end: null,
    }));
    const synced = syncRoom(extended, DEFAULT_SETTINGS);
    expect(synced.wallOrder).toEqual(['A', 'B', 'E', 'F']);
    expect(wallNumbers(synced).get('A')).toBe(1);
    expect(wallNumbers(synced).get('B')).toBe(2);
  });

  it('8. preserves the SPEC-2 frame and corner behavior', () => {
    const room = syncRoom(roomR(), DEFAULT_SETTINGS);
    expect(wallFrame(room, room.walls[0])).toMatchObject({
      n: { x: 0, y: 1 },
      leftEndpoint: 'start',
    });
    expect(wallFrame(room, room.walls[1])).toMatchObject({
      n: { x: -1, y: 0 },
      leftEndpoint: 'start',
    });
    expect(cornerAt(room, room.walls[0], 'right')).toMatchObject({
      type: 'inside',
      angle: 90,
      neighborWallId: 'B',
      neighborSide: 'left',
    });
  });

  it('16. navigates wall order and wraps at both ends', () => {
    const room = roomWithC();
    expect(nextWallId(room, 'C', 1)).toBe('A');
    expect(nextWallId(room, 'B', 1)).toBe('C');
    expect(nextWallId(room, 'C', -1)).toBe('B');
    expect(nextWallId(room, 'A', -1)).toBe('C');

    const single = { ...room, wallOrder: ['A'], walls: [room.walls[0]] };
    expect(nextWallId(single, 'A', 1)).toBe('A');
    expect(nextWallId(single, 'A', -1)).toBe('A');
  });
});
