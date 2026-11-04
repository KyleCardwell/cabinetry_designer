import { describe, expect, it } from 'vitest';
import { autoStackCount, spacedStack } from '../spacedStack.js';
import { floatingShelfLayout, shelfParts } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';

describe('IN15a spacing rule and floating shelves', () => {
  it.each([
    [1, 36, { count: 2 }, 2, 11, [11, 23.5], []],
    [2, 36, { count: 2, bottom: 6 }, 2, 13.5, [6, 21], []],
    [3, 36, { count: 3, bottom: 6, top: 0 }, 3, 12.75, [6, 20.25, 34.5], []],
    [4, 48, {}, 2, 15, [15, 31.5], []],
    [5, 48, { bottom: 4, top: 0 }, 4, 12 + 2 / 3, [4, 18 + 1 / 6, 32 + 1 / 3, 46.5], []],
    [6, 36, { count: 1, bottom: 10, top: 2 }, 1, null, [10], [{ code: 'stack-top-ignored' }]],
  ])('anchor %i: places shelves at the specified clear gap',
    (_case, height, picks, count, gap, positions, warnings) => {
      // Repeat above floor level to check conversion of stored offsets to absolute heights.
      for (const z of [0, 40]) {
        const piece = { id: 's', kind: 'shelves', x: 3, z, width: 30, height, depth: 24,
          shelves: { back: true, ...picks } };
        const layout = floatingShelfLayout(piece, DEFAULT_SETTINGS);
        expect(layout.count).toBe(count);
        expect(layout.countSource).toBe(picks.count === undefined ? 'auto' : 'manual');
        expect(layout.warnings).toEqual(warnings);
        if (gap === null) expect(layout.gap).toBeNull();
        else expect(layout.gap).toBeCloseTo(gap, 10);
        expect(layout.positions).toHaveLength(positions.length);
        layout.positions.forEach((position, index) => expect(position).toBeCloseTo(z + positions[index], 10));
        const [back, ...parts] = shelfParts(piece, DEFAULT_SETTINGS);
        expect(back).toEqual({ id: 's:back', kind: 'panel', x: 3, z, width: 30, height, depth: 0.75 });
        expect(parts.map((part) => part.z)).toEqual(layout.positions);
        expect(parts).toHaveLength(count);
        parts.forEach((part, index) => expect(part).toEqual({ id: `s:shelf-${index + 1}`,
          kind: 'shelf', x: 3, z: layout.positions[index], width: 30, height: 1.5, depth: 23.25 }));
      }
    });

  it('shares gaps for unequal heights, including an automatic bottom and typed top', () => {
    expect(spacedStack({ floor: 10, ceiling: 50, heights: [2, 4], top: 40 }))
      .toEqual({ positions: [22, 36], gap: 12, warnings: [] });
    expect(spacedStack({ floor: 0, ceiling: 36, heights: [1.5, 1.5, 1.5] }).gap).toBe(7.875);
    expect(spacedStack({ floor: 0, ceiling: 48, heights: [1.5, 1.5, 1.5] }).gap).toBe(10.875);
  });

  it('handles empty and single-item stacks with zero, one or two equal gaps', () => {
    expect(spacedStack({ floor: 10, ceiling: 30, heights: [] }))
      .toEqual({ positions: [], gap: null, warnings: [] });
    for (const [picks, positions, gap] of [
      [{}, [19], 9], [{ bottom: 12 }, [12], 16], [{ top: 28 }, [26], 16],
    ]) {
      expect(spacedStack({ floor: 10, ceiling: 30, heights: [2], ...picks }))
        .toEqual({ positions, gap, warnings: [] });
    }
  });

  it('keeps negative-gap placements and warns instead of moving or dropping items', () => {
    const crowded = spacedStack({ floor: 0, ceiling: 2, heights: [2, 2] });
    expect(crowded.warnings).toEqual([{ code: 'stack-doesnt-fit' }]);
    expect(crowded.gap).toBe(-2 / 3);
    expect(crowded.positions[0]).toBeCloseTo(-2 / 3, 10);
    expect(crowded.positions[1]).toBeCloseTo(2 / 3, 10);
    expect(spacedStack({ floor: 0, ceiling: 10, heights: [2, 2], bottom: 7, top: 9 }))
      .toEqual({ positions: [7, 7], gap: -2, warnings: [{ code: 'stack-doesnt-fit' }] });
  });

  it('respects count limits, minimum fallback, tolerance and the single-item Bottom-wins rule', () => {
    const options = { floor: 0, ceiling: 36, height: 1.5, minClear: 11, min: 1, max: 12 };
    expect(autoStackCount(options)).toBe(2);
    expect(autoStackCount({ ...options, ceiling: 36 - 1e-9 })).toBe(2);
    expect(autoStackCount({ ...options, ceiling: 36 - 1e-7 })).toBe(1);
    expect(autoStackCount({ ...options, ceiling: 1000 })).toBe(12);
    expect(autoStackCount({ ...options, ceiling: 1, min: 2 })).toBe(2);
    expect(autoStackCount({ ...options, bottom: 34.5, top: 34.5, min: 0 })).toBe(1);
    expect(autoStackCount({ ...options, bottom: 35, top: 36, min: 0 })).toBe(0);
    // When one cannot fit, return min even if that minimum is greater than one.
    expect(autoStackCount({ ...options, bottom: 36, top: 36, min: 2 })).toBe(2);
    const piece = { z: 0, height: 1, shelves: { back: false } };
    expect(floatingShelfLayout(piece, DEFAULT_SETTINGS)).toMatchObject({ count: 1,
      countSource: 'auto', warnings: [{ code: 'stack-doesnt-fit' }] });
    expect(floatingShelfLayout({ ...piece, height: 48 },
      { ...DEFAULT_SETTINGS, floatingShelfSpacing: 6 })).toMatchObject({ count: 5, gap: 6.75 });
  });
});
