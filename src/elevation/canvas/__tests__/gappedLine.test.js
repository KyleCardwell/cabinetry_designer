import { describe, expect, it } from 'vitest';
import { gappedLine } from '../gappedLine.js';

describe('gappedLine', () => {
  it('DM7 anchors: splits horizontal and vertical lines and preserves any direction', () => {
    expect(gappedLine({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10))
      .toEqual([[0, 0, 40, 0], [60, 0, 100, 0]]);
    expect(gappedLine({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 50 }, 10))
      .toEqual([[0, 0, 0, 40], [0, 60, 0, 100]]);
    expect(gappedLine({ x: 0, y: 100 }, { x: 0, y: 0 }, { x: 0, y: 50 }, 10))
      .toEqual([[0, 100, 0, 60], [0, 40, 0, 0]]);
    expect(gappedLine({ x: 10, y: 20 }, { x: 70, y: 100 }, { x: 40, y: 60 }, 10))
      .toEqual([[10, 20, 34, 52], [46, 68, 70, 100]]);
  });

  it('DM7 anchor: clips gaps past either end, including fully covered or untouched lines', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    expect(gappedLine(start, end, { x: 5, y: 0 }, 10)).toEqual([[15, 0, 100, 0]]);
    expect(gappedLine(start, end, { x: 95, y: 0 }, 10)).toEqual([[0, 0, 85, 0]]);
    expect(gappedLine(start, end, { x: 50, y: 0 }, 60)).toEqual([]);
    expect(gappedLine(start, end, { x: -20, y: 0 }, 10)).toEqual([[0, 0, 100, 0]]);
    expect(gappedLine(start, end, { x: 120, y: 0 }, 10)).toEqual([[0, 0, 100, 0]]);
    expect(gappedLine(start, end, { x: 50, y: 0 }, 0)).toEqual([[0, 0, 100, 0]]);
  });

  it('drops pieces shorter than 0.5px, retaining exactly 0.5px', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    expect(gappedLine(start, end, { x: 50, y: 0 }, 49.5))
      .toEqual([[0, 0, 0.5, 0], [99.5, 0, 100, 0]]);
    expect(gappedLine(start, end, { x: 50, y: 0 }, 49.6)).toEqual([]);
    expect(gappedLine(start, start, start, 10)).toEqual([]);
    expect(gappedLine(start, { x: 0.4, y: 0 }, start, 0)).toEqual([]);
    // Plan coordinates at 10px/in: retain screen-visible pieces shorter than 0.5in.
    expect(gappedLine(start, { x: 3.5, y: 0 }, { x: 1.75, y: 0 }, 1.5, 0.05))
      .toEqual([[0, 0, 0.25, 0], [3.25, 0, 3.5, 0]]);
  });
});
