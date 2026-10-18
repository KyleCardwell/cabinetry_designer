import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { drawerBoxHeights, isTallDrawerBox } from '../drawerBoxes.js';

describe('IN4a drawer box preset heights', () => {
  it('gives the ProBox presets by default: 2 1/4..10 1/4, then 11 1/8..22 1/8, by 1"', () => {
    const heights = drawerBoxHeights(DEFAULT_SETTINGS);
    expect(heights).toHaveLength(21);
    expect(heights.slice(0, 3)).toEqual([2.25, 3.25, 4.25]);
    expect(heights.slice(7, 11)).toEqual([9.25, 10.25, 11.125, 12.125]);
    expect(heights.at(-1)).toBe(22.125);
    expect(drawerBoxHeights(undefined)).toEqual(heights);
  });

  it('follows overrides, never passes the tallest box, and survives a bad step', () => {
    expect(drawerBoxHeights({ drawerBoxHeights: { max: 15.125 } }).at(-1)).toBe(15.125);
    expect(drawerBoxHeights({ drawerBoxHeights: { max: 8.25 } })).toEqual([2.25, 3.25, 4.25, 5.25, 6.25, 7.25, 8.25]);
    expect(drawerBoxHeights({ drawerBoxHeights: { step: 0.5, to: 4.25, max: 12.125 } }))
      .toEqual([2.25, 2.75, 3.25, 3.75, 4.25, 11.125, 11.625, 12.125]);
    expect(drawerBoxHeights({ drawerBoxHeights: { step: 0 } })).toEqual(drawerBoxHeights(DEFAULT_SETTINGS));
  });

  it('warns above 15 1/8" (the standard ROT box) only', () => {
    expect(isTallDrawerBox(15.125, DEFAULT_SETTINGS)).toBe(false);
    expect(isTallDrawerBox(16.125, DEFAULT_SETTINGS)).toBe(true);
    expect(isTallDrawerBox(16.125, { drawerBoxHeights: { warnAbove: 22.125 } })).toBe(false);
  });
});
