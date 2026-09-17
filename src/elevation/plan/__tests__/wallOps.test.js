import { describe, expect, it } from 'vitest';
import {
  addWallWithConnections,
  connectWallEndpoints,
  disconnectWallEndpoint,
  moveConnectedEndpoint,
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

  it('snaps to the nearest orthogonal axis relative to the fixed point', () => {
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 80, y: 35 }))
      .toEqual({ x: 80, y: 10 });
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 25, y: 90 }))
      .toEqual({ x: 10, y: 90 });
    expect(snapPointOrtho({ x: 10, y: 10 }, { x: 25, y: 90 }, false))
      .toEqual({ x: 25, y: 90 });
  });
});
