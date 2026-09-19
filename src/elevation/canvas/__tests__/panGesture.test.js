import { describe, expect, it } from 'vitest';
import { panExceedsThreshold } from '../panGesture.js';

describe('pan gesture', () => {
  it('1. treats travel at the threshold as a click', () => {
    expect(panExceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(panExceedsThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('2. measures diagonal jitter as distance, not per-axis', () => {
    expect(panExceedsThreshold({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(panExceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
  });

  it('3. honors a custom threshold and rejects a missing point', () => {
    expect(panExceedsThreshold({ x: 0, y: 0 }, { x: 6, y: 0 }, 8)).toBe(false);
    expect(panExceedsThreshold(null, { x: 99, y: 99 })).toBe(false);
  });
});
