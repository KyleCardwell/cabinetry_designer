import { describe, expect, it } from 'vitest';
import { layoutDimensionRow } from '../dimensionLayout.js';

describe('layoutDimensionRow', () => {
  it('12. keeps a fitting label inline and pops out a narrow segment', () => {
    const result = layoutDimensionRow([
      { start: 0, end: 30 },
      { start: 30, end: 31.5 },
    ], { scale: 4, fontSize: 11 });

    expect(result.labels).toMatchObject([
      { text: '30"', mode: 'inline', level: 0 },
      { text: '1 1/2"', mode: 'popout', level: 1 },
    ]);
    expect(result.levels).toBe(1);
  });

  it('13. uses two popout levels, then hides a third colliding label', () => {
    const result = layoutDimensionRow([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ], { scale: 4, fontSize: 11 });

    expect(result.labels.map(({ mode, level }) => ({ mode, level }))).toEqual([
      { mode: 'popout', level: 1 },
      { mode: 'popout', level: 2 },
      { mode: 'hidden', level: 0 },
    ]);
    expect(result.labels.map((label) => label.center)).toEqual([2, 6, 10]);
    expect(result.labels[0].width).toBeCloseTo(14.6);
    expect(result.levels).toBe(2);
  });

  it('14. keeps a long single segment inline with no popout levels', () => {
    const result = layoutDimensionRow([{ start: 0, end: 60 }], {
      scale: 4,
      fontSize: 11,
    });

    expect(result.labels[0]).toMatchObject({ mode: 'inline', level: 0 });
    expect(result.levels).toBe(0);
  });
});
