import { describe, expect, it, vi } from 'vitest';
import { outlineGeometry, outlinePath } from '../outlinePath.js';

const transform = { scale: 1, offsetX: 0, offsetY: 0, wallHeight: 0 };
const context = () => Object.fromEntries(
  ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fillStrokeShape'].map((name) => [name, vi.fn()]),
);

describe('SH3 step d open outlines', () => {
  it('anchor 4: traces a two-point line without closing it', () => {
    const ctx = context();
    outlinePath([[1, 2, 0], [4, 6, 0]], transform, { closed: false })(ctx);
    expect(ctx.moveTo.mock.calls).toEqual([[1, -2]]);
    expect(ctx.lineTo.mock.calls).toEqual([[4, -6]]);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.closePath).not.toHaveBeenCalled();
  });

  it('preserves an open arc through Konva geometry and ignores a final-point bulge', () => {
    const ctx = context();
    const shape = {};
    outlineGeometry([[0, 0, 1], [4, 0, -1]], transform, { closed: false }).sceneFunc(ctx, shape);
    expect(ctx.arc).toHaveBeenCalledOnce();
    expect(ctx.arc.mock.calls[0]).toEqual([2, 0, 2, Math.PI, 0, true]);
    expect(ctx.closePath).not.toHaveBeenCalled();
    expect(ctx.fillStrokeShape).toHaveBeenCalledWith(shape);
  });
});

describe('Step 477 true outline arcs', () => {
  it('turns the specified outline into a closed path with one radius-4 arc', () => {
    const ctx = context();
    outlinePath([[0, 0, 0], [4, 0, 0.414214], [0, 4, 0]], transform)(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo.mock.calls).toEqual([[4, 0]]);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    const [cx, cy, radius, start, end, anticlockwise] = ctx.arc.mock.calls[0];
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(0, 5);
    expect(radius).toBeCloseTo(4, 5);
    expect(end - start).toBeCloseTo(-Math.PI / 2, 5);
    expect(anticlockwise).toBe(true);
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });

  it('keeps two-coordinate outlines straight and fills/strokes the Konva shape', () => {
    const ctx = context();
    const shape = {};
    outlineGeometry([[0, 0], [4, 0], [0, 4]], transform).sceneFunc(ctx, shape);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.lineTo.mock.calls).toEqual([[4, 0], [0, -4]]);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.fillStrokeShape.mock.calls).toEqual([[shape]]);
  });

  it.each([1, -1])('traces a closing semicircle with bulge %s under zoom and pan', (bulge) => {
    const ctx = context();
    const view = { scale: 3, offsetX: 10, offsetY: 20, wallHeight: 8 };
    outlinePath([[0, 0], [4, 0], [4, 4, bulge]], view)(ctx);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    const [cx, cy, radius, start, end, anticlockwise] = ctx.arc.mock.calls[0];
    expect([cx, cy]).toEqual([16, 38]);
    expect(radius).toBeCloseTo(6 * Math.SQRT2);
    expect(end - start).toBeCloseTo(-bulge * Math.PI);
    expect(anticlockwise).toBe(bulge > 0);
    expect(cx + radius * Math.cos(end)).toBeCloseTo(10);
    expect(cy + radius * Math.sin(end)).toBeCloseTo(44);
  });
});
