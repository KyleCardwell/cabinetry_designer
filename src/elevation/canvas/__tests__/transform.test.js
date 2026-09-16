import { describe, expect, it } from 'vitest';
import {
  fitWallToViewport,
  screenToWall,
  wallRectToScreen,
  wallToScreen,
} from '../transform.js';

describe('elevation canvas transform', () => {
  it('fits and centers a wall inside the padded viewport', () => {
    const transform = fitWallToViewport(
      { length: 120, height: 60 },
      { width: 340, height: 220 },
      20,
    );

    expect(transform).toEqual({
      scale: 2.5,
      offsetX: 20,
      offsetY: 35,
      wallHeight: 60,
    });
  });

  it('flips the vertical axis and converts points both ways', () => {
    const transform = {
      scale: 2,
      offsetX: 10,
      offsetY: 20,
      wallHeight: 96,
    };
    const screen = wallToScreen({ x: 12, z: 24 }, transform);

    expect(screen).toEqual({ x: 34, y: 164 });
    expect(screenToWall(screen, transform)).toEqual({ x: 12, z: 24 });
  });

  it('converts bottom-left wall rectangles to top-left screen rectangles', () => {
    const transform = {
      scale: 2,
      offsetX: 10,
      offsetY: 20,
      wallHeight: 96,
    };

    expect(wallRectToScreen({ x: 3, z: 4, width: 30, height: 20 }, transform)).toEqual({
      x: 16,
      y: 164,
      width: 60,
      height: 40,
    });
  });
});
