import { describe, expect, it } from 'vitest';
import { flattenOutline, outlineBounds, sectionProfileOutline, transformOutline } from '../sectionProfileOutline.js';

const cove35 = {
  geometry: {
    points: { a: [0, 0], b: [3, 0], c: [3, -0.5], d: [0.5, -3], e: [0.5, -3.5], f: [0, -3.5] },
    loops: [{ closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'line', from: 'b', to: 'c' },
      { type: 'arc', from: 'c', to: 'd', center: [3, -3], ccw: true },
      { type: 'line', from: 'd', to: 'e' },
      { type: 'line', from: 'e', to: 'f' },
      { type: 'line', from: 'f', to: 'a' },
    ] }],
  },
};

describe('SPEC-50.3 step 475 true arc outlines', () => {
  it('keeps the cove arc and its inward bounds (anchors 1 and 3)', () => {
    const outline = sectionProfileOutline(cove35.geometry);
    expect(outline).toEqual([[0, 0, 0], [3, 0, 0], [3, -0.5, 0.414214], [0.5, -3, 0], [0.5, -3.5, 0], [0, -3.5, 0]]);
    expect(outlineBounds(outline)).toEqual({ minX: 0, maxX: 3, minY: -3.5, maxY: 0 });
  });

  it('splits a 270-degree arc into two 135-degree bulges (anchor 2)', () => {
    const geometry = { points: { a: [1, 0], b: [0, -1] }, loops: [{ closed: true, segs: [
      { type: 'arc', from: 'a', to: 'b', center: [0, 0], ccw: true },
      { type: 'line', from: 'b', to: 'a' },
    ] }] };
    const outline = sectionProfileOutline(geometry);
    expect(outline.map((point) => point.map((n) => Math.round(n * 1e6) / 1e6)))
      .toEqual([[1, 0, 0.668179], [-0.707107, 0.707107, 0.668179], [0, -1, 0]]);
    geometry.loops[0].segs[0] = { type: 'arc', from: 'b', to: 'a', center: [0, 0], ccw: false };
    geometry.loops[0].segs[1] = { type: 'line', from: 'a', to: 'b' };
    expect(sectionProfileOutline(geometry).map(([, , bulge]) => bulge)).toEqual([-0.668179, -0.668179, 0]);
  });

  it('flattens wrapping arcs within the sagitta limit and transforms legacy and curved outlines', () => {
    const pairs = [[1, 0], [-1, 0]];
    expect(flattenOutline(pairs)).toEqual(pairs);
    expect(transformOutline(pairs, ([x, y]) => [x + 2, y - 3]))
      .toEqual([[3, -3, 0], [1, -3, 0]]);
    for (const bulge of [-1, 1]) {
      const outline = [[-1, 0, 0], [1, 0, bulge]];
      for (const sagitta of [0.001, 0.0001, 2]) {
        const flattened = flattenOutline(outline, sagitta);
        expect(flattened.slice(0, 2)).toEqual(pairs.toReversed());
        expect(flattened.at(-1)).not.toEqual(flattened[0]);
        for (let i = 1; i < flattened.length; i += 1) {
          const [x, y] = flattened[i];
          const [nx, ny] = flattened[(i + 1) % flattened.length];
          expect(Math.hypot(x, y)).toBeCloseTo(1, 10);
          expect(1 - Math.hypot((x + nx) / 2, (y + ny) / 2)).toBeLessThanOrEqual(sagitta + 1e-12);
        }
      }
      const bounds = outlineBounds(outline);
      expect(bulge > 0 ? bounds.maxY : bounds.minY).toBeCloseTo(bulge, 3);
      expect(transformOutline(outline, ([x, y]) => [-x + 2, y + 3], true))
        .toEqual([[3, 3, 0], [1, 3, -bulge]]);
      const geometry = { points: { a: [1, 0], b: [-1, 0], c: [0, 0.5] }, loops: [
        { closed: true, segs: [{ type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' }, { type: 'line', from: 'c', to: 'a' }] },
        { closed: true, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, 0], ccw: bulge > 0 }, { type: 'line', from: 'b', to: 'a' }] },
      ] };
      expect(sectionProfileOutline(geometry)).toEqual([[1, 0, bulge], [-1, 0, 0]]);
    }
    expect(() => flattenOutline(pairs, 0)).toThrow(RangeError);
  });
});
