import { describe, expect, it } from 'vitest';
import { glassMarks } from '../index.js';

describe('IN14 glass drafting marks', () => {
  it('anchor 1: returns the centered long line followed by upper-left and lower-right short lines', () => {
    expect(glassMarks({ x: 0, z: 0, width: 12, height: 24 })).toEqual([
      { x1: 4.585786, z1: 10.585786, x2: 7.414214, z2: 13.414214 },
      { x1: 4.444365, z1: 11.858579, x2: 6.141421, z2: 13.555635 },
      { x1: 5.858579, z1: 10.444365, x2: 7.555635, z2: 12.141421 },
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
});
