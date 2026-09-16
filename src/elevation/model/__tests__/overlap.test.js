import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runsConflict, validateRunPlacement } from '../overlap.js';

function run(id, cabinetTypeId, overrides = {}) {
  return {
    id,
    cabinetTypeId,
    x: 0,
    width: 36,
    z: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: cabinetTypeId === CABINET_TYPE_IDS.TALL ? 84 : 30.5,
    ...overrides,
  };
}

describe('runsConflict', () => {
  it('does not conflict a base and upper run at the same x', () => {
    expect(runsConflict(
      run('base', CABINET_TYPE_IDS.BASE),
      run('upper', CABINET_TYPE_IDS.UPPER, { height: 30 }),
      DEFAULT_SETTINGS,
    )).toBe(false);
  });

  it('conflicts an overlapping base and tall run', () => {
    expect(runsConflict(
      run('base', CABINET_TYPE_IDS.BASE),
      run('tall', CABINET_TYPE_IDS.TALL, { x: 12 }),
      DEFAULT_SETTINGS,
    )).toBe(true);
  });

  it('does not conflict base runs that touch at their horizontal edges', () => {
    expect(runsConflict(
      run('left', CABINET_TYPE_IDS.BASE),
      run('right', CABINET_TYPE_IDS.BASE, { x: 36 }),
      DEFAULT_SETTINGS,
    )).toBe(false);
  });

  it('ignores horizontal overlap at or below the epsilon', () => {
    expect(runsConflict(
      run('left', CABINET_TYPE_IDS.BASE),
      run('right', CABINET_TYPE_IDS.BASE, { x: 36 - 1e-6 }),
      DEFAULT_SETTINGS,
    )).toBe(false);
  });

  it('treats any positive vertical overlap as a conflict', () => {
    expect(runsConflict(
      run('base', CABINET_TYPE_IDS.BASE),
      run('upper', CABINET_TYPE_IDS.UPPER, { z: 34.4999995, height: 30 }),
      DEFAULT_SETTINGS,
    )).toBe(true);
  });
});

describe('validateRunPlacement', () => {
  it('accepts a bounded run that does not conflict', () => {
    const existing = run('existing', CABINET_TYPE_IDS.BASE);
    const candidate = run('candidate', CABINET_TYPE_IDS.UPPER, { width: 60, height: 30 });
    const wall = { length: 144, height: 96, runs: [existing] };

    expect(validateRunPlacement(wall, candidate, DEFAULT_SETTINGS)).toEqual({ ok: true, reason: null });
  });

  it('rejects out-of-bounds and conflicting runs while ignoring the edited run itself', () => {
    const existing = run('existing', CABINET_TYPE_IDS.BASE);
    const wall = { length: 144, height: 96, runs: [existing] };

    expect(validateRunPlacement(
      wall,
      run('outside', CABINET_TYPE_IDS.BASE, { x: 120, width: 30 }),
      DEFAULT_SETTINGS,
    )).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(validateRunPlacement(
      wall,
      run('conflict', CABINET_TYPE_IDS.BASE, { x: 12 }),
      DEFAULT_SETTINGS,
    )).toEqual({ ok: false, reason: 'conflict' });
    expect(validateRunPlacement(
      wall,
      { ...existing, width: 40 },
      DEFAULT_SETTINGS,
    )).toEqual({ ok: true, reason: null });
  });
});
