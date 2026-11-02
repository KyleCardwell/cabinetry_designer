import { describe, expect, it } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { landingEndLabel } from '../index.js';

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

describe('WL1 d: named landing ends', () => {
  it('anchor 1: labels the back left corner and back right free end in Room K', () => {
    expect(landingEndLabel(K, K.walls[2], 'back', 'left')).toBe('Wall 4 corner');
    expect(landingEndLabel(K, K.walls[2], 'back', 'right')).toBe('Free end');
  });

  it('anchor 2: labels the front left as the free start endpoint', () => {
    expect(landingEndLabel(K, K.walls[2], 'front', 'left')).toBe('Free end');
    expect(landingEndLabel(K, K.walls[2], 'front', 'right')).toBe('Wall 4 corner');
  });

  it('labels landed ends and uses wallLabel names and number overrides', () => {
    const named = { ...K, walls: K.walls.map((candidate) => candidate.id === 'wall-3'
      ? { ...candidate, name: 'Host', numberOverride: 8 } : candidate) };
    expect(landingEndLabel(named, named.walls[1], 'front', 'right')).toBe('On Wall 8 · Host');
    expect(landingEndLabel(named, named.walls[1], 'back', 'left')).toBe('On Wall 8 · Host');
  });
});
