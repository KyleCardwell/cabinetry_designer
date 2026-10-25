import { describe, expect, it } from 'vitest';
import { glassMarks } from '../index.js';

describe('IN14 / GM1 glass drafting marks', () => {
  it('anchor 1: returns the centered long line followed by upper-left and lower-right short lines', () => {
    expect(glassMarks({ x: 0, z: 0, width: 12, height: 24 })).toEqual([
      { x1: 5, z1: 10.267949, x2: 7, z2: 13.732051 },
      { x1: 4.82265, z1: 11.294103, x2: 6.02265, z2: 13.372564 },
      { x1: 5.97735, z1: 10.627436, x2: 7.17735, z2: 12.705897 },
    ]);
  });

  it('anchor 2: omits marks below two inches in either dimension, including degenerate rectangles', () => {
    for (const [width, height] of [[1.5, 30], [30, 1.5], [0, 12], [12, -1]]) {
      expect(glassMarks({ x: 0, z: 0, width, height })).toEqual([]);
    }
    expect(glassMarks({ x: 0, z: 0, width: 2, height: 30 })).toHaveLength(3);
  });

  it('uses the smaller dimension and translates without changing the input', () => {
    const rect = { x: -20, z: 40, width: 24, height: 12 };
    const before = { ...rect };
    const lines = glassMarks(rect);
    const centered = glassMarks({ x: 0, z: 0, width: 12, height: 24 });
    lines.forEach((line, index) => {
      expect(line.x1).toBeCloseTo(centered[index].x1 - 14, 6);
      expect(line.x2).toBeCloseTo(centered[index].x2 - 14, 6);
      expect(line.z1).toBeCloseTo(centered[index].z1 + 34, 6);
      expect(line.z2).toBeCloseTo(centered[index].z2 + 34, 6);
    });
    expect(rect).toEqual(before);
  });

  it('GM1 anchor: lines run at 60 degrees', () => {
    for (const { x1, z1, x2, z2 } of glassMarks({ x: 0, z: 0, width: 18, height: 40 })) {
      expect(Math.atan2(z2 - z1, x2 - x1) * 180 / Math.PI).toBeCloseTo(60, 4);
    }
  });

  it('GM1 anchor: over 24 x 24 gets a 24-size set 3 in from the top-left and bottom-right corners', () => {
    const lines = glassMarks({ x: 0, z: 0, width: 30, height: 60 });
    expect(lines).toHaveLength(6);
    const xs = (set) => set.flatMap(({ x1, x2 }) => [x1, x2]);
    const zs = (set) => set.flatMap(({ z1, z2 }) => [z1, z2]);
    const [topLeft, bottomRight] = [lines.slice(0, 3), lines.slice(3)];
    expect(Math.min(...xs(topLeft))).toBeCloseTo(3, 6);
    expect(Math.max(...zs(topLeft))).toBeCloseTo(57, 6);
    expect(Math.max(...xs(bottomRight))).toBeCloseTo(27, 6);
    expect(Math.min(...zs(bottomRight))).toBeCloseTo(3, 6);
    expect(Math.hypot(lines[0].x2 - lines[0].x1, lines[0].z2 - lines[0].z1)).toBeCloseTo(8, 6);
    expect(glassMarks({ x: 0, z: 0, width: 24, height: 60 })).toHaveLength(3);
    expect(glassMarks({ x: 0, z: 0, width: 24.01, height: 24.01 })).toHaveLength(6);
  });
});
