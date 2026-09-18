import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  counterTop,
  crownOverlap,
  moldingStack,
  resolveProfile,
  resolveVertical,
} from '../profile.js';

function run(type, overrides = {}) {
  return {
    id: `run-${type}`,
    cabinetTypeId: type,
    x: 0,
    width: 60,
    z: 0,
    height: 1,
    depth: type === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    heightMode: 'auto',
    overrides: {},
    ...overrides,
  };
}

const room = { profile: { ...DEFAULT_SETTINGS.defaultProfile } };
const wall = { profile: {}, height: 96 };

describe('height profiles', () => {
  it('1. computes the molding stack and default box top', () => {
    const profile = resolveProfile(DEFAULT_SETTINGS, room, wall);
    expect(moldingStack(profile)).toBe(6);
    expect(moldingStack({
      ...profile,
      topMoldHeight: 3,
      crownHeight: 6,
      crownStackHeight: 6,
    })).toBe(6);
    expect(crownOverlap({
      ...profile,
      topMoldHeight: 3,
      crownHeight: 6,
      crownStackHeight: 6,
    })).toBe(3);
    expect(profile.crownTop - moldingStack(profile)).toBe(90);
    expect(counterTop(profile)).toBe(36);
  });

  it('2. reports a negative overlap as a gap between molding parts', () => {
    expect(crownOverlap({
      ...DEFAULT_SETTINGS.defaultProfile,
      topMoldHeight: 3,
      crownHeight: 4.5,
      crownStackHeight: 9,
    })).toBe(-1.5);
  });

  it('resolves default auto heights and ceiling warnings', () => {
    const profile = resolveProfile(DEFAULT_SETTINGS, room, wall);
    expect(resolveVertical(run(CABINET_TYPE_IDS.BASE), profile, [], wall)).toMatchObject({
      z: 4,
      height: 30.5,
      warnings: [],
      errors: [],
    });
    expect(resolveVertical(run(CABINET_TYPE_IDS.TALL), profile, [], wall)).toMatchObject({
      z: 4,
      height: 86,
      warnings: [],
    });
    expect(resolveVertical(run(CABINET_TYPE_IDS.UPPER), profile, [], wall)).toMatchObject({
      z: 54,
      height: 36,
      warnings: [],
    });
    expect(resolveVertical(
      run(CABINET_TYPE_IDS.UPPER),
      profile,
      [],
      { height: 95 },
    ).warnings).toContainEqual({ code: 'crown-above-ceiling' });
  });

  it('3. honors base countertop and upper-clearance overrides', () => {
    const profile = resolveProfile(DEFAULT_SETTINGS, room, wall);
    const base = run(CABINET_TYPE_IDS.BASE, {
      overrides: { countertopThickness: 3 },
    });
    expect(resolveVertical(run(CABINET_TYPE_IDS.UPPER), profile, [base], wall)).toMatchObject({
      z: 55.5,
      height: 34.5,
    });
    expect(resolveVertical(run(CABINET_TYPE_IDS.UPPER, {
      overrides: { upperClearance: 20 },
    }), profile, [], wall)).toMatchObject({ z: 56, height: 34 });
  });

  it('4. applies a wall crown-top override', () => {
    const profile = resolveProfile(
      DEFAULT_SETTINGS,
      room,
      { ...wall, profile: { crownTop: 90 } },
    );
    expect(resolveVertical(run(CABINET_TYPE_IDS.UPPER), profile, [], wall)).toMatchObject({
      z: 54,
      height: 30,
    });
    expect(resolveVertical(run(CABINET_TYPE_IDS.TALL), profile, [], wall)).toMatchObject({
      z: 4,
      height: 80,
    });
  });

  it('5. uses the tallest overlapping counter and warns for mixed heights', () => {
    const profile = resolveProfile(DEFAULT_SETTINGS, room, wall);
    const bases = [
      run(CABINET_TYPE_IDS.BASE, { id: 'base-a' }),
      run(CABINET_TYPE_IDS.BASE, {
        id: 'base-b',
        overrides: { countertopThickness: 3 },
      }),
    ];
    const result = resolveVertical(run(CABINET_TYPE_IDS.UPPER), profile, bases, wall);
    expect(result).toMatchObject({ z: 55.5, height: 34.5 });
    expect(result.warnings).toContainEqual({ code: 'mixed-counter-heights' });
  });

  it('6. reports no room for an upper box under a low crown top', () => {
    const profile = resolveProfile(
      DEFAULT_SETTINGS,
      { profile: { ...DEFAULT_SETTINGS.defaultProfile, crownTop: 60 } },
      wall,
    );
    expect(resolveVertical(run(CABINET_TYPE_IDS.UPPER), profile, [], wall).errors)
      .toContainEqual({ code: 'no-room-for-box' });
  });
});
