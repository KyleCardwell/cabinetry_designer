import { describe, expect, it } from 'vitest';
import {
  clampAndSnapWallPoint,
  dragPointsToRunInput,
  screenPointToWallSnapped,
} from '../drag.js';

describe('elevation drag helpers', () => {
  it('clamps points to the wall and snaps them to half inches', () => {
    const wall = { length: 120, height: 96 };

    expect(clampAndSnapWallPoint({ x: 12.24, z: 97 }, wall)).toEqual({ x: 12, z: 96 });
    expect(clampAndSnapWallPoint({ x: -4, z: 30.26 }, wall)).toEqual({ x: 0, z: 30.5 });
  });

  it('converts screen points before clamping and snapping', () => {
    const wall = { length: 120, height: 96 };
    const transform = {
      scale: 2,
      offsetX: 10,
      offsetY: 20,
      wallHeight: 96,
    };

    expect(screenPointToWallSnapped({ x: 35.2, y: 163.4 }, wall, transform)).toEqual({
      x: 12.5,
      z: 24.5,
    });
  });

  it('normalizes drags made in either direction', () => {
    expect(dragPointsToRunInput(
      { x: 80, z: 70 },
      { x: 20, z: 10 },
    )).toEqual({
      x: 20,
      width: 60,
      bottomZ: 10,
      topZ: 70,
    });
  });
});
