import { describe, expect, it } from 'vitest';
import { textScales } from '../textScale.js';

describe('textScales', () => {
  it.each([
    [1, 1, 1],
    [0.5, 1, 1],
    [2, 2, 1.4142135623730951],
    [4, 4, 2],
    [9, 4, 2.5],
    [20, 4, 2.5],
  ])('scales text at zoom %s to label %s and dimension %s', (zoom, label, dimension) => {
    const result = textScales(zoom);
    expect(result.label).toBe(label);
    expect(result.dimension).toBeCloseTo(dimension, 10);
  });

  it('uses fit-size text for non-finite or nonpositive zoom', () => {
    for (const zoom of [NaN, 0, -1, Infinity, -Infinity]) {
      expect(textScales(zoom)).toEqual({ label: 1, dimension: 1 });
    }
  });
});
