import { describe, expect, it } from 'vitest';
import {
  endpointAlignmentTargets,
  runAlignmentTargets,
  snapAxis,
  snapToAlignment,
} from '../alignment.js';

describe('alignment snapping', () => {
  it('1. takes the nearest candidate inside tolerance', () => {
    expect(snapAxis(12.4, [0, 12, 24], 1)).toBe(12);
    expect(snapAxis(12.4, [0, 24], 1)).toBeNull();
  });

  it('2. breaks a tie in favor of the smaller candidate', () => {
    expect(snapAxis(12, [11.5, 12.5], 1)).toBe(11.5);
  });

  it('3. moves both axes and reports both guides', () => {
    expect(snapToAlignment(
      { x: 12.4, y: 47.6 },
      { x: [12], y: [48] },
      1,
    )).toEqual({
      point: { x: 12, y: 48 },
      guides: [{ axis: 'x', value: 12 }, { axis: 'y', value: 48 }],
    });
  });

  it('4. restricts snapping to the requested axes', () => {
    expect(snapToAlignment(
      { x: 12.4, y: 47.6 },
      { x: [12], y: [48] },
      1,
      ['x'],
    )).toEqual({
      point: { x: 12, y: 47.6 },
      guides: [{ axis: 'x', value: 12 }],
    });
  });

  it('5. leaves the point alone when nothing is in range', () => {
    expect(snapToAlignment(
      { x: 5, z: 5 },
      { x: [40], z: [40] },
      1,
    )).toEqual({
      point: { x: 5, z: 5 },
      guides: [],
    });
  });

  it('6. builds endpoint targets and excludes a named wall', () => {
    const walls = [
      { id: 'a', x1: 0, y1: 0, x2: 120, y2: 0 },
      { id: 'b', x1: 120, y1: 0, x2: 120, y2: 96 },
    ];

    expect(endpointAlignmentTargets(walls)).toEqual({
      x: [0, 120, 120, 120],
      y: [0, 0, 0, 96],
    });
    expect(endpointAlignmentTargets(walls, 'b')).toEqual({
      x: [0, 120],
      y: [0, 0],
    });
  });

  it('7. reads resolved run boxes and excludes one', () => {
    const wall = {
      runs: [
        { id: 'r1', x: 12, width: 36, z: 4, height: 30.5 },
        { id: 'r2', x: 60, width: 24, z: 54, height: 30 },
      ],
    };

    expect(runAlignmentTargets(wall, 'r1')).toEqual({
      x: [60, 84],
      z: [54, 84],
    });
  });
});
