import { describe, expect, it } from 'vitest';
import {
  layoutPartBadges,
  partBadgeLevels,
  partBadgeWidth,
} from '../partNumberLayout.js';

describe('part number badge layout', () => {
  it('204. sizes badges and assigns lift levels in a single left-to-right sweep', () => {
    const entries = [
      { key: 'wide', text: '1', left: 0, right: 100 },
      { key: 'thin-a', text: '2', left: 100, right: 108 },
      { key: 'thin-b', text: '3', left: 108, right: 116 },
      { key: 'thin-c', text: '4', left: 116, right: 124 },
    ];

    expect(partBadgeWidth('1')).toBe(23);
    expect(partBadgeWidth('123')).toBe(41);
    expect(layoutPartBadges(entries).map(({ level }) => level)).toEqual([0, 1, 2, 3]);
    expect(layoutPartBadges(entries).map(({ lifted }) => lifted)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(layoutPartBadges(entries)[0].center).toBe(50);
    expect(layoutPartBadges(entries)[0].width).toBe(23);
    expect(layoutPartBadges(entries, { maxLevels: 1 }).map(({ level }) => level)).toEqual([
      0,
      1,
      1,
      1,
    ]);
    expect(layoutPartBadges(entries, { maxLevels: 0 }).map(({ level }) => level)).toEqual([
      0,
      0,
      0,
      0,
    ]);
    expect(layoutPartBadges(entries, { maxLevels: 0 }).map(({ lifted }) => lifted)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(partBadgeLevels(305)).toBe(3);
    expect(partBadgeLevels(150)).toBe(1);
    expect(partBadgeLevels(100)).toBe(0);
    expect(partBadgeLevels(0)).toBe(0);
  });
});
