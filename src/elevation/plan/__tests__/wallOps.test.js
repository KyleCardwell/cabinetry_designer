import { describe, expect, it } from 'vitest';
import { cross, wallLength } from '../../model/geometry.js';
import {
  addWallWithConnections,
  connectWallEndpoints,
  disconnectWallEndpoint,
  moveConnectedEndpoint,
  setWallLength,
  snapPointOrtho,
} from '../wallOps.js';

function wall(id, x1, y1, x2, y2) {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    connections: { start: null, end: null },
  };
}

function roomR() {
  const walls = connectWallEndpoints(
    [wall('A', 0, 0, 120, 0), wall('B', 120, 0, 120, 96)],
    'A',
    'end',
    'B',
    'start',
  );
  return { walls };
}

describe('elevation plan wall operations', () => {
  it('connects a newly added wall at both requested endpoints', () => {
    const first = wall('a', 0, 0, 120, 0);
    const third = wall('c', 120, 96, 0, 96);
    const added = wall('b', 121, 1, 119, 95);
    const result = addWallWithConnections(
      [first, third],
      added,
      { wallId: 'a', endpoint: 'end' },
      { wallId: 'c', endpoint: 'start' },
    );

    expect(result.find((item) => item.id === 'b')).toMatchObject({
      x1: 120,
      y1: 0,
      x2: 120,
      y2: 96,
      connections: {
        start: { wallId: 'a', endpoint: 'end' },
        end: { wallId: 'c', endpoint: 'start' },
      },
    });
    expect(result.find((item) => item.id === 'a').connections.end)
      .toEqual({ wallId: 'b', endpoint: 'start' });
    expect(result.find((item) => item.id === 'c').connections.start)
      .toEqual({ wallId: 'b', endpoint: 'end' });
  });

  it('propagates an endpoint move to its connected neighbor', () => {
    const connected = connectWallEndpoints(
      [wall('a', 0, 0, 120, 0), wall('b', 120, 0, 120, 96)],
      'a',
      'end',
      'b',
      'start',
    );
    const result = moveConnectedEndpoint(connected, 'a', 'end', { x: 132, y: 12 });

    expect(result.find((item) => item.id === 'a')).toMatchObject({ x2: 132, y2: 12 });
    expect(result.find((item) => item.id === 'b')).toMatchObject({ x1: 132, y1: 12 });
  });

  it('disconnects both sides of a connection', () => {
    const connected = connectWallEndpoints(
      [wall('a', 0, 0, 120, 0), wall('b', 120, 0, 120, 96)],
      'a',
      'end',
      'b',
      'start',
    );
    const result = disconnectWallEndpoint(connected, 'a', 'end');

    expect(result.find((item) => item.id === 'a').connections.end).toBeNull();
    expect(result.find((item) => item.id === 'b').connections.start).toBeNull();
  });

  it('6. lengthens a connected right end without changing the neighbor direction', () => {
    const room = roomR();
    const result = setWallLength(room, 'A', 132, 'right');

    expect(result).toMatchObject({ ok: true, reason: null });
    expect(result.walls.find((item) => item.id === 'A'))
      .toMatchObject({ x1: 0, y1: 0, x2: 132, y2: 0 });
    expect(result.walls.find((item) => item.id === 'B'))
      .toMatchObject({ x1: 132, y1: 0, x2: 132, y2: 96 });
    expect(wallLength(result.walls.find((item) => item.id === 'B'))).toBe(96);
  });

  it('7. shortens a connected right end and translates its neighbor', () => {
    const result = setWallLength(roomR(), 'A', 108, 'right');

    expect(result.walls.find((item) => item.id === 'A'))
      .toMatchObject({ x1: 0, y1: 0, x2: 108, y2: 0 });
    expect(result.walls.find((item) => item.id === 'B'))
      .toMatchObject({ x1: 108, y1: 0, x2: 108, y2: 96 });
  });

  it('8. moves a free left end without moving the connected neighbor', () => {
    const room = roomR();
    const result = setWallLength(room, 'A', 132, 'left');

    expect(result.walls.find((item) => item.id === 'A'))
      .toMatchObject({ x1: -12, y1: 0, x2: 120, y2: 0 });
    expect(result.walls.find((item) => item.id === 'B'))
      .toMatchObject({ x1: 120, y1: 0, x2: 120, y2: 96 });
  });

  it('9. preserves directions and the requested length at a 60-degree corner', () => {
    const radians = Math.PI / 3;
    const neighbor = wall(
      'B',
      120,
      0,
      120 + 96 * Math.cos(radians),
      96 * Math.sin(radians),
    );
    const walls = connectWallEndpoints(
      [wall('A', 0, 0, 120, 0), neighbor],
      'A',
      'end',
      'B',
      'start',
    );
    const beforeB = walls.find((item) => item.id === 'B');
    const result = setWallLength({ walls }, 'A', 132, 'right');
    const afterA = result.walls.find((item) => item.id === 'A');
    const afterB = result.walls.find((item) => item.id === 'B');
    const beforeDirection = {
      x: beforeB.x2 - beforeB.x1,
      y: beforeB.y2 - beforeB.y1,
    };
    const afterDirection = {
      x: afterB.x2 - afterB.x1,
      y: afterB.y2 - afterB.y1,
    };

    expect(result.ok).toBe(true);
    expect(wallLength(afterA)).toBeCloseTo(132, 6);
    expect(afterA).toMatchObject({ x2: 132, y2: 0 });
    expect(afterB).toMatchObject({ x1: 132, y1: 0 });
    expect(cross(beforeDirection, afterDirection)).toBeCloseTo(0, 6);
  });

  it('10. rejects a length that would reverse a connected neighbor', () => {
    const radians = Math.PI / 3;
    const walls = connectWallEndpoints(
      [
        wall('A', 0, 0, 120, 0),
        wall('B', 120, 0, 120 + 5 * Math.cos(radians), 5 * Math.sin(radians)),
      ],
      'A',
      'end',
      'B',
      'start',
    );
    const room = { walls };
    const result = setWallLength(room, 'A', 150, 'right');

    expect(result).toEqual({
      ok: false,
      reason: 'neighbor-too-short',
      walls: room.walls,
    });
  });

  it('snaps to the nearest orthogonal axis relative to the fixed point', () => {
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 80, y: 35 }))
      .toEqual({ x: 80, y: 10 });
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 25, y: 90 }))
      .toEqual({ x: 10, y: 90 });
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 25, y: 90 }, false))
      .toEqual({ x: 25, y: 90 });
  });
});

describe('wall length from both ends', () => {
  it('58 splits the change between the free left end and the connected right end', () => {
    const result = setWallLength(roomR(), 'A', 132, 'both');
    expect(result).toMatchObject({ ok: true, reason: null });
    expect(result.walls.find((item) => item.id === 'A'))
      .toMatchObject({ x1: -6, y1: 0, x2: 126, y2: 0 });
    expect(result.walls.find((item) => item.id === 'B'))
      .toMatchObject({ x1: 126, y1: 0, x2: 126, y2: 96 });
    expect(setWallLength(roomR(), 'A', -1, 'both')).toMatchObject({ ok: false, reason: 'invalid-length' });
  });
});
