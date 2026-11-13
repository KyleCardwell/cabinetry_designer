import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth, runsByDepth } from '../corners.js';

const run = (id, depth, extra = {}) => ({ id, depth, cabinetTypeId: 2, ends: {}, ...extra });

describe('runsByDepth', () => {
  it('paints shallower runs first so a deeper run\'s band returns cover them, keeping ties in wall order', () => {
    const runs = [run('tall', 26, { cabinetTypeId: 3 }), run('base', 24, { cabinetTypeId: 1 }), run('upper', 12), run('upper2', 12)];
    expect(runsByDepth(runs, DEFAULT_SETTINGS).map(({ id }) => id)).toEqual(['upper', 'upper2', 'base', 'tall']);
    expect(runs.map(({ id }) => id)).toEqual(['tall', 'base', 'upper', 'upper2']);
    const depths = runsByDepth(runs, DEFAULT_SETTINGS).map((entry) => frontDepth(entry, DEFAULT_SETTINGS));
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });
});
