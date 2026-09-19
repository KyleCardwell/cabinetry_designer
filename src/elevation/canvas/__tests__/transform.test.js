import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  fitWallToViewport,
  panView,
  screenToWall,
  wallRectToScreen,
  wallToScreen,
  withView,
  zoomViewAt,
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

  it('leaves the fitted transform unchanged at the default view', () => {
    const base = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };

    expect(withView(base, DEFAULT_VIEW)).toEqual(base);
  });

  it('keeps the wall point under the pointer fixed while zooming', () => {
    const base = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
    const pointer = { x: 130, y: 100 };
    const wallPoint = screenToWall(pointer, withView(base, DEFAULT_VIEW));
    const view = zoomViewAt(base, DEFAULT_VIEW, pointer, 2);
    const screenPoint = wallToScreen(wallPoint, withView(base, view));

    expect(view.zoom).toBe(2);
    expect(screenPoint.x).toBeCloseTo(pointer.x, 6);
    expect(screenPoint.y).toBeCloseTo(pointer.y, 6);
  });

  it('returns the view unchanged when zoom is already clamped', () => {
    const base = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
    const pointer = { x: 130, y: 100 };
    const maximum = { zoom: 8, panX: 3, panY: 4 };
    const minimum = { zoom: 0.25, panX: 3, panY: 4 };

    expect(zoomViewAt(base, maximum, pointer, 2)).toBe(maximum);
    expect(zoomViewAt(base, minimum, pointer, 0.5)).toBe(minimum);
  });

  it('adds pan deltas and shifts screen positions by the pan', () => {
    const base = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
    const point = { x: 12, z: 24 };
    const before = wallToScreen(point, withView(base, DEFAULT_VIEW));
    const view = panView(DEFAULT_VIEW, 17, -9);
    const after = wallToScreen(point, withView(base, view));

    expect(view).toEqual({ zoom: 1, panX: 17, panY: -9 });
    expect(after.x - before.x).toBe(17);
    expect(after.y - before.y).toBe(-9);
  });

  it('5. composes repeated pointer-centered zoom with an intervening pan', () => {
    const base = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
    const pointer = { x: 300, y: 200 };
    const initialPoint = screenToWall(pointer, withView(base, DEFAULT_VIEW));
    const firstZoom = zoomViewAt(base, DEFAULT_VIEW, pointer, 2);
    expect(screenToWall(pointer, withView(base, firstZoom))).toEqual(initialPoint);

    const panned = panView(firstZoom, -40, 15);
    const pointAfterPan = screenToWall(pointer, withView(base, panned));
    const secondZoom = zoomViewAt(base, panned, pointer, 2);

    // SPEC-QUESTION: panning necessarily changes the wall point under a fixed
    // screen coordinate, so the invariant is asserted across each zoom step.
    expect(screenToWall(pointer, withView(base, secondZoom))).toEqual(pointAfterPan);
    expect(panned).toMatchObject({ panX: firstZoom.panX - 40, panY: firstZoom.panY + 15 });
  });
});
