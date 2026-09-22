import { describe, expect, it } from 'vitest';
import { readableFlip, readableRotation } from '../textRotation.js';

describe('textRotation', () => {
  it('187. folds rotations into [-90, 90)', () => {
    const cases = [
      [0, 0],
      [45, 45],
      [89.9, 89.9],
      [90, -90],
      [90.1, -89.9],
      [135, -45],
      [180, 0],
      [-45, -45],
      [-90, -90],
      [-135, 45],
      [-180, 0],
      [225, 45],
      [270, -90],
      [315, -45],
    ];

    cases.forEach(([input, expected]) => {
      expect(readableRotation(input), String(input)).toBeCloseTo(expected, 9);
    });
  });

  it('188. reports whether the readable rotation flipped', () => {
    expect([0, 45, -45, -90, 270, 315].map(readableFlip)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    expect([90, 135, 180, -135, -180, 269.9].map(readableFlip)).toEqual([
      -1, -1, -1, -1, -1, -1,
    ]);
  });
});
