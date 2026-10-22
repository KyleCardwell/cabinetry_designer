import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { depthDimension } from '../depthDimension.js';

const run = (cabinetTypeId, x, width) => ({ cabinetTypeId, x, width });

describe('depthDimension', () => {
  it('fits at padded text width plus two 4px line lengths, and pops out just below it', () => {
    // "24": 2 × 0.6 × 13 + 8 padding + 8 minimum line = 31.6px.
    const scale = 31.6 / 24;
    const base = run(CABINET_TYPE_IDS.BASE, 20, 60);
    expect(depthDimension(base, 24, scale)).toEqual({
      x: 50, fits: true, label: { x: 50, offset: 12 }, leader: null,
    });
    expect(depthDimension(base, 24, (31.6 - 0.001) / 24).fits).toBe(false);
    // Also reject the previous textPx + 4 boundary.
    expect(depthDimension(base, 24, 27.6 / 24).fits).toBe(false);
  });

  it('184. assigns type lanes and pops out labels that do not fit', () => {
    // 62.1875px leaves less than two 4px line lengths around the padded 54.8px text.
    expect(depthDimension(run(CABINET_TYPE_IDS.BASE, 20, 60), 24.875, 2.5).fits).toBe(false);
    expect(depthDimension(run(CABINET_TYPE_IDS.BASE, 20, 60), 24.875, 4)).toEqual({
      x: 50, fits: true, label: { x: 50, offset: 12.4375 }, leader: null,
    });
    expect(depthDimension(run(CABINET_TYPE_IDS.UPPER, 100, 60), 12.875, 2)).toEqual({
      x: 116, fits: false, label: { x: 106.75, offset: 6.4375 }, leader: { x1: 116, x2: 111, offset: 6.4375 },
    });
    expect(depthDimension(run(CABINET_TYPE_IDS.TALL, 0, 24), 24.875, 1)).toEqual({
      x: 18, fits: false, label: { x: 36.5, offset: 12.4375 }, leader: { x1: 18, x2: 28, offset: 12.4375 },
    });
  });
});
