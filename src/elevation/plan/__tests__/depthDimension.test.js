import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { auto, room, run, wall } from '../../../test/builders.js';
import { depthDimension, planDepthLabels } from '../depthDimension.js';

describe('depthDimension', () => {
  it('fits at padded text width plus two 4px line lengths, and pops out just below it', () => {
    // "24": 2 × 0.6 × 13 + 8 padding + 8 minimum line = 31.6px.
    const scale = 31.6 / 24;
    const base = run({ x: 20, width: 60 });
    expect(depthDimension(base, 24, scale, undefined, 50)).toEqual({
      x: 50, fits: true, label: { x: 50, offset: 12 }, leader: null,
    });
    expect(depthDimension(base, 24, (31.6 - 0.001) / 24, undefined, 50).fits).toBe(false);
    // Also reject the previous textPx + 4 boundary.
    expect(depthDimension(base, 24, 27.6 / 24, undefined, 50).fits).toBe(false);
  });

  it('uses the supplied x and type pop-out side when labels do not fit', () => {
    // 62.1875px leaves less than two 4px line lengths around the padded 54.8px text.
    expect(depthDimension(run({ x: 20, width: 60 }), 24.875, 2.5, undefined, 50).fits).toBe(false);
    expect(depthDimension(run({ x: 20, width: 60 }), 24.875, 4, undefined, 50)).toEqual({
      x: 50, fits: true, label: { x: 50, offset: 12.4375 }, leader: null,
    });
    expect(depthDimension(run({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 100, width: 60 }), 12.875, 2, undefined, 116)).toEqual({
      x: 116, fits: false, label: { x: 106.75, offset: 6.4375 }, leader: { x1: 116, x2: 111, offset: 6.4375 },
    });
    expect(depthDimension(run({ cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 0, width: 24 }), 24.875, 1, undefined, 18)).toEqual({
      x: 18, fits: false, label: { x: 36.5, offset: 12.4375 }, leader: { x1: 18, x2: 28, offset: 12.4375 },
    });
  });

  it('tries the lane side, opposite side, three longer leaders and finally the original label', () => {
    for (const [blockers, expected] of [
      [[], 68.5], [[68.5], 31.5], [[68.5, 31.5], 82.5],
      [[68.5, 31.5, 82.5], 96.5], [[68.5, 31.5, 82.5, 96.5], 110.5],
      [[68.5, 31.5, 82.5, 96.5, 110.5], 68.5],
    ]) {
      const input = room({ walls: [wall({ runs: [
        run({ id: 'target', depth: 24, items: [{ ...auto('t'), kind: 'panel' }] }),
        ...blockers.map((x, index) => run({ id: `block-${index}`, depth: 100,
          items: [{ ...auto(`b-${index}`), kind: 'panel' }] })),
      ] })] });
      const positions = new Map([['target', { x: 50 }],
        ...blockers.map((x, index) => [`block-${index}`, { x }])]);
      const labels = planDepthLabels(input, DEFAULT_SETTINGS, positions, { scale: 1, fontSize: 13, gap: 28 });
      expect(labels.get('target').label.x).toBe(expected);
      expect(labels.get('target').leader.x2).toBe(expected - Math.sign(expected - 50) * 8.5);
    }
    // The blocker text overlaps the first candidate even though its line is clear.
    const input = room({ walls: [wall({ runs: [run({ id: 'target' }), run({ id: 'text', depth: 18 })] })] });
    const positions = new Map([['target', { x: 50 }], ['text', { x: 50 }]]);
    const labels = planDepthLabels(input, DEFAULT_SETTINGS, positions, { scale: 1, fontSize: 13, gap: 28 });
    expect(labels.get('target').label.x).toBe(31.5);

    // One blocked face reverses both popped halves, preserving opposite island sides.
    const pair = { front: 'front', back: 'back' };
    const island = room({ walls: [wall({ x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4.5, runs: [
      run({ id: 'front', items: [{ ...auto('f'), kind: 'panel' }] }),
      run({ id: 'back', wallSide: 'back', items: [{ ...auto('b'), kind: 'panel' }] }),
      run({ id: 'block', depth: 100, items: [{ ...auto('block'), kind: 'panel' }] }),
    ] })] });
    const pairedPositions = new Map([
      ['front', { x: 50, pair }], ['back', { x: 50, pair }], ['block', { x: 68.5 }],
    ]);
    const pairedLabels = planDepthLabels(island, DEFAULT_SETTINGS, pairedPositions, { scale: 1, fontSize: 13, gap: 28 });
    expect(pairedLabels.get('front').label.x).toBe(31.5);
    expect(pairedLabels.get('back').label.x).toBe(31.5);
  });
});
