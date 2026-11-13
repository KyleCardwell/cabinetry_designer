import { describe, expect, it, vi } from 'vitest';
import { combinedViewOf } from '../../model/combinedElevations.js';
import { combinedDepthNote } from '../transform.js';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));
vi.mock('react-konva', () => ({
  Group: 'group', Layer: 'layer', Rect: 'rect', Text: 'text', Line: 'line',
  Shape: 'shape', Label: 'label', Tag: 'tag',
}));
vi.mock('../../model/cornerParts.js', () => {
  const cornerShapes = vi.fn(() => []);
  return { cornerShapes, combinedCornerShapes: (room, combined, settings) => new Map(combined.faces
    .map((face) => [face.key, cornerShapes(room, room.walls.find(({ id }) => id === face.wallId), face.side, settings)])) };
});
vi.mock('../../model/showThrough.js', () => ({ wallShowThrough: vi.fn(() => new Map()) }));

const wall = (id, x1, y1, x2, y2, start, end, runs = []) => ({
  id, name: '', x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
  runs, openings: [], recesses: [], soffits: [], connections: { start, end },
});
const to = (wallId, endpoint) => ({ wallId, endpoint });

/** A stepped wall: A, a 16" jog J, B set back 16", a jog K, then C; cabinets on A and C. */
function steppedRoom(extra = {}) {
  return {
    id: 'room-1',
    wallOrder: ['A', 'J', 'B', 'K', 'C'],
    walls: [
      wall('A', 0, 0, 100, 0, null, to('J', 'start'), [{ id: 'a' }]),
      wall('J', 100, 0, 100, 16, to('A', 'end'), to('B', 'start')),
      wall('B', 100, 16, 160, 16, to('J', 'end'), to('K', 'start')),
      wall('K', 160, 16, 160, 0, to('B', 'end'), to('C', 'start')),
      wall('C', 160, 0, 240, 0, to('K', 'end'), null, [{ id: 'c' }]),
    ],
    ...extra,
  };
}

const room = () => steppedRoom({ combinedElevations: [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }] });

describe('combined canvas faces', () => {
  it('notes depth from the opened face, including fractions and equal-depth tolerance', () => {
    const [a, b, c] = combinedViewOf(room(), 'A').faces;
    expect(combinedDepthNote(b, a)).toBe('16" back');
    expect(combinedDepthNote(c, a)).toBeNull();
    expect(combinedDepthNote(a, b)).toBe('16" out');
    expect(combinedDepthNote(c, b)).toBe('16" out');
    expect(combinedDepthNote({ depth: -16.5 }, a)).toBe('16 1/2" back');
    expect(combinedDepthNote({ depth: 1e-7 }, a)).toBeNull();
  });

});
