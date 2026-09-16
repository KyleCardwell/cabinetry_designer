import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { createRun, defaultsForType, inferRunType } from '../runDefaults.js';

describe('run defaults', () => {
  it.each([
    [2, 30, CABINET_TYPE_IDS.BASE],
    [50, 80, CABINET_TYPE_IDS.UPPER],
    [1, 90, CABINET_TYPE_IDS.TALL],
  ])('infers the type for bottom %s and top %s', (bottomZ, topZ, expected) => {
    expect(inferRunType(bottomZ, topZ)).toBe(expected);
  });

  it('creates a base run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 2, topZ: 30 }, DEFAULT_SETTINGS);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      z: 4,
      height: 30.5,
      depth: 24,
    });
  });

  it('creates an upper run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 50, topZ: 80 }, DEFAULT_SETTINGS);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      z: 54,
      height: 30,
      depth: 12,
    });
  });

  it('creates a tall run with snapped default geometry', () => {
    const run = createRun({ x: 0, width: 60, bottomZ: 1, topZ: 90 }, DEFAULT_SETTINGS);

    expect(run).toMatchObject({
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      z: 4,
      height: 84,
      depth: 24,
    });
  });

  it('rounds drawn geometry when height snapping is disabled', () => {
    const settings = { ...DEFAULT_SETTINGS, snapHeightsToDefaults: false };
    const run = createRun({ x: 1.24, width: 60.26, bottomZ: 49.74, topZ: 80.26 }, settings);

    expect(run).toMatchObject({ x: 1, width: 60.5, z: 49.5, height: 30.5 });
  });

  it('returns the configured defaults for each type', () => {
    expect(defaultsForType(CABINET_TYPE_IDS.BASE, DEFAULT_SETTINGS)).toEqual({ z: 4, height: 30.5, depth: 24 });
    expect(defaultsForType(CABINET_TYPE_IDS.UPPER, DEFAULT_SETTINGS)).toEqual({ z: 54, height: 30, depth: 12 });
    expect(defaultsForType(CABINET_TYPE_IDS.TALL, DEFAULT_SETTINGS)).toEqual({ z: 4, height: 84, depth: 24 });
  });
});
