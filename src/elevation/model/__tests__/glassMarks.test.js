import { describe, expect, it } from 'vitest';
import { glassMarks } from '../index.js';
import { glassMarkStrokePx } from '../glassMarks.js';

const anchors = [
  { width: 12, height: 24, lines: [
    { x1: 0, z1: 3.789513, x2: 11.66853, z2: 24, weight: 70 },
    { x1: 0, z1: 1.607695, x2: 12, z2: 22.392305, weight: 100 },
    { x1: 0.33147, z1: 0, x2: 12, z2: 20.210487, weight: 35 },
  ] },
  { width: 48, height: 14, lines: [
    { x1: 18.488929, z1: 0, x2: 26.571833, z2: 14, weight: 70 },
    { x1: 19.958548, z1: 0, x2: 28.041452, z2: 14, weight: 100 },
    { x1: 21.428167, z1: 0, x2: 29.511071, z2: 14, weight: 35 },
  ] },
  { width: 14, height: 40, lines: [
    { x1: 0, z1: 10.421099, x2: 14, z2: 34.66981, weight: 70 },
    { x1: 0, z1: 7.875644, x2: 14, z2: 32.124356, weight: 100 },
    { x1: 0, z1: 5.33019, x2: 14, z2: 29.578901, weight: 35 },
  ] },
  { width: 30, height: 40, lines: [
    { x1: 1.143594, z1: 0, x2: 24.237604, z2: 40, weight: 70 },
    { x1: 3.452995, z1: 0, x2: 26.547005, z2: 40, weight: 100 },
    { x1: 5.762396, z1: 0, x2: 28.856406, z2: 40, weight: 35 },
  ] },
];

describe('GM2 glass drafting marks', () => {
  it.each(anchors)('matches the $width × $height anchor exactly', ({ width, height, lines }) => {
    expect(glassMarks({ x: 0, z: 0, width, height })).toEqual(lines);
  });

  it('omits marks below two inches, including degenerate rectangles; two inches is included', () => {
    for (const [width, height] of [[1.5, 30], [30, 1.5], [0, 12], [12, -1]]) {
      expect(glassMarks({ x: 0, z: 0, width, height })).toEqual([]);
    }
    expect(glassMarks({ x: 0, z: 0, width: 2, height: 30 })).toHaveLength(3);
  });

  it('omits nonnumeric and nonfinite rectangles', () => {
    for (const field of ['x', 'z', 'width', 'height']) {
      for (const value of [NaN, Infinity, -Infinity, undefined, null, '12', 12n, Symbol('invalid')]) {
        expect(glassMarks({ x: 0, z: 0, width: 12, height: 24, [field]: value })).toEqual([]);
      }
    }
  });

  it('translates without changing the input or weights', () => {
    const rect = Object.freeze({ x: -20, z: 40, width: 14, height: 40 });
    const before = { ...rect };
    const centered = glassMarks({ ...rect, x: 0, z: 0 });
    glassMarks(rect).forEach((line, index) => {
      expect(line.x1).toBeCloseTo(centered[index].x1 + rect.x, 6);
      expect(line.x2).toBeCloseTo(centered[index].x2 + rect.x, 6);
      expect(line.z1).toBeCloseTo(centered[index].z1 + rect.z, 6);
      expect(line.z2).toBeCloseTo(centered[index].z2 + rect.z, 6);
      expect(line.weight).toBe(centered[index].weight);
    });
    expect(rect).toEqual(before);
  });

  it('clips every 60° line to the edges and uses the perpendicular gap, capped at two inches', () => {
    for (const { width, height } of [...anchors, { width: 2, height: 30 }, { width: 2, height: 2 }]) {
      const x = -20;
      const z = 40;
      const lines = glassMarks({ x, z, width, height });
      expect(lines.map(({ weight }) => weight)).toEqual([70, 100, 35]);
      lines.forEach(({ x1, z1, x2, z2 }, index) => {
        expect(Math.atan2(z2 - z1, x2 - x1) * 180 / Math.PI).toBeCloseTo(60, 4);
        expect(Math.hypot(x2 - x1, z2 - z1)).toBeGreaterThanOrEqual(1e-6);
        for (const [px, pz] of [[x1, z1], [x2, z2]]) {
          expect(px).toBeGreaterThanOrEqual(x);
          expect(px).toBeLessThanOrEqual(x + width);
          expect(pz).toBeGreaterThanOrEqual(z);
          expect(pz).toBeLessThanOrEqual(z + height);
          expect(px === x || px === x + width || pz === z || pz === z + height).toBe(true);
        }
        const offset = -(x1 - x - width / 2) * Math.sin(Math.PI / 3)
          + (z1 - z - height / 2) * Math.cos(Math.PI / 3);
        expect(offset).toBeCloseTo((1 - index) * Math.min(Math.min(width, height) / 11, 2), 5);
      });
    }
  });
});

describe('glassMarkStrokePx', () => {
  it('converts paper weights using the plot scale and canvas zoom', () => {
    expect(glassMarkStrokePx(100, { plotScale: 32 }, { scale: 8 })).toBeCloseTo(10.0787401575, 8);
    expect(glassMarkStrokePx(70, { plotScale: 16 }, { scale: 8 })).toBeCloseTo(3.5275590551, 8);
    expect(glassMarkStrokePx(35, undefined, { scale: 4 })).toBeCloseTo(1.3228346457, 8);
  });

  it('keeps strokes at least 0.75 pixels at low zoom', () => {
    for (const weight of [70, 100, 35]) {
      expect(glassMarkStrokePx(weight, { plotScale: 12 }, { scale: 0.1 })).toBe(0.75);
    }
  });
});
