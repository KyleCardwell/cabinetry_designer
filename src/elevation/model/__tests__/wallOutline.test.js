import { describe, expect, it } from 'vitest';
import { wallOutline } from '../wallOutline.js';

function connectedRoom(overrides = {}) {
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
    profile: {},
    wallOrder: ['A', 'B'],
    walls: [wallA, wallB],
  };
}

describe('wallOutline', () => {
  it('9. miters both outlines at room R corner', () => {
    const room = connectedRoom();
    expect(wallOutline(room, room.walls[0])).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 124.5, y: -4.5 },
      { x: 0, y: -4.5 },
    ]);
    expect(wallOutline(room, room.walls[1])).toEqual([
      { x: 120, y: 0 },
      { x: 120, y: 96 },
      { x: 124.5, y: 96 },
      { x: 124.5, y: -4.5 },
    ]);
  });

  it('10. uses both wall thicknesses for a shared miter', () => {
    const room = connectedRoom({ wallB: { thickness: 6 } });
    expect(wallOutline(room, room.walls[0])[2]).toEqual({ x: 126, y: -4.5 });
    expect(wallOutline(room, room.walls[1])[3]).toEqual({ x: 126, y: -4.5 });
  });

  it('11. intersects the back lines at a 135-degree corner', () => {
    const room = connectedRoom({
      wallB: { x2: 120 + 67.8823, y2: 67.8823 },
    });
    const backEnd = wallOutline(room, room.walls[0])[2];
    expect(backEnd.x).toBeCloseTo(121.864, 3);
    expect(backEnd.y).toBeCloseTo(-4.5, 6);
  });

  it('12. keeps plain offsets for parallel lines and over-limit miters', () => {
    const collinear = connectedRoom({ wallB: { x2: 200, y2: 0 } });
    expect(wallOutline(collinear, collinear.walls[0])[2]).toEqual({ x: 120, y: -4.5 });
    expect(wallOutline(collinear, collinear.walls[1])[3]).toEqual({ x: 120, y: -4.5 });

    const acute = connectedRoom({ wallB: { x2: 20, y2: 1 } });
    expect(wallOutline(acute, acute.walls[0])[2]).toEqual({ x: 120, y: -4.5 });
  });
});
