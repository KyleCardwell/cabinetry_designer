import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PULLS, BUILT_IN_PULL_IDS, DEFAULT_SETTINGS, PULL_KINDS, PULL_SIZE_KEYS,
  defaultPullSizes, findPull, isPull, isPullList, newPull,
} from '../index.js';
import { copySettings } from '../../store/slices/helpers.js';

const BAR = {
  id: 'p1', name: 'Bar', kind: 'pull', length: 5, centers: 4, width: 0.375,
  projection: 1.25, hardwarePullId: null,
};
const KNOB = { id: 'k', name: 'Knob', kind: 'knob', diameter: 1.25, projection: 1, hardwarePullId: null };
const TAB = { id: 't', name: 'Tab', kind: 'tab', length: 3, height: 0.5, projection: 1, hardwarePullId: null };

describe('HP3b step a pull model', () => {
  it('validates bar sizes, optional centers and the estimator link (anchor 1)', () => {
    const withoutCenters = { ...BAR };
    delete withoutCenters.centers;
    expect(isPull(BAR)).toBe(true);
    expect(isPull(withoutCenters)).toBe(true);
    expect(isPull({ ...BAR, centers: 5 })).toBe(true);
    expect(isPull({ ...BAR, hardwarePullId: 3 })).toBe(true);
    for (const patch of [
      { centers: 6 }, { centers: undefined }, { diameter: 1 },
      ...[-1, '3', 0, 1.5, Infinity, NaN, undefined].map((hardwarePullId) => ({ hardwarePullId })),
    ]) expect(isPull({ ...BAR, ...patch })).toBe(false);
  });

  it('requires the exact sizes for knobs and tabs and finite positive sizes for every kind (anchor 2)', () => {
    expect(isPull(KNOB)).toBe(true);
    expect(isPull(TAB)).toBe(true);
    const withoutProjection = { ...KNOB };
    delete withoutProjection.projection;
    for (const invalid of [
      { ...KNOB, diameter: 0 }, { ...KNOB, name: ' Knob' }, withoutProjection,
      { ...KNOB, kind: 'finger' }, { ...KNOB, length: 1 }, { ...TAB, centers: 2 },
      { ...TAB, diameter: 1 }, { ...KNOB, name: '' }, { ...KNOB, name: 'Knob ' },
      { ...KNOB, id: '' }, { ...KNOB, extra: true }, { ...KNOB, [Symbol('extra')]: true },
      Object.create(KNOB), [], null, undefined,
    ]) expect(isPull(invalid)).toBe(false);
    for (const pull of [BAR, KNOB, TAB]) {
      for (const key of [...PULL_SIZE_KEYS[pull.kind], 'projection']) {
        for (const value of [0, -1, NaN, Infinity, -Infinity, '1', null, undefined]) {
          expect(isPull({ ...pull, [key]: value })).toBe(false);
        }
        if (key !== 'centers') {
          const missing = { ...pull };
          delete missing[key];
          expect(isPull(missing)).toBe(false);
        }
      }
    }
  });

  it('requires unique identities and case-insensitive names plus both built-in kinds (anchor 3)', () => {
    expect(isPullList(BUILT_IN_PULLS)).toBe(true);
    expect(isPullList([...BUILT_IN_PULLS, BAR, TAB])).toBe(true);
    expect(isPullList(BUILT_IN_PULLS.map((pull) => ({ ...pull, name: `${pull.name} edited`, projection: 2 })))).toBe(true);
    for (const list of [
      [...BUILT_IN_PULLS, BAR, { ...BAR, id: 'p2', name: 'bar' }],
      [...BUILT_IN_PULLS, BAR, { ...BAR, name: 'Other' }],
      [BUILT_IN_PULLS[0]],
      [{ ...KNOB, id: 'pull-4', diameter: 1 }, BUILT_IN_PULLS[1]],
      [BUILT_IN_PULLS[0], { ...BAR, id: 'knob-1-25' }],
      [...BUILT_IN_PULLS, null], [], null, {},
    ]) expect(isPullList(list)).toBe(false);
  });

  it('copies kind and sizes with a fresh identity, unique name and cleared estimator link (anchor 4)', () => {
    const before = structuredClone(BUILT_IN_PULLS);
    const copy = newPull(BUILT_IN_PULLS, BUILT_IN_PULLS[0], 'x');
    expect(copy).toEqual({
      id: 'x', name: '4" pull copy', kind: 'pull', length: 4.75, centers: 4,
      width: 0.375, projection: 1.25, hardwarePullId: null,
    });
    expect(newPull([...BUILT_IN_PULLS, copy], BUILT_IN_PULLS[0], 'y').name).toBe('4" pull copy 2');
    const list = [...BUILT_IN_PULLS, { ...copy, name: copy.name.toUpperCase() },
      { ...copy, id: 'y', name: '4" pull copy 2' }];
    expect(newPull(list, BUILT_IN_PULLS[0], 'z').name).toBe('4" pull copy 3');
    for (const base of [BAR, KNOB, TAB]) {
      expect(newPull([], { ...base, hardwarePullId: 3 }, 'new'))
        .toEqual({ ...base, id: 'new', name: `${base.name} copy`, hardwarePullId: null });
    }
    expect(copy).not.toBe(BUILT_IN_PULLS[0]);
    expect(BUILT_IN_PULLS).toEqual(before);
  });

  it('provides editor defaults, lookup and independently cloned settings libraries', () => {
    expect(PULL_KINDS).toEqual(['pull', 'knob', 'tab']);
    expect(PULL_SIZE_KEYS).toEqual({ pull: ['length', 'centers', 'width'], knob: ['diameter'], tab: ['length', 'height'] });
    expect(BUILT_IN_PULL_IDS).toEqual(['pull-4', 'knob-1-25']);
    expect(defaultPullSizes('pull')).toEqual({ length: 4.75, centers: 4, width: 0.375 });
    expect(defaultPullSizes('knob')).toEqual({ diameter: 1.25 });
    expect(defaultPullSizes('tab')).toEqual({ length: 3, height: 0.5 });
    const sizes = defaultPullSizes('pull');
    sizes.length = 99;
    expect(defaultPullSizes('pull').length).toBe(4.75);
    expect(BUILT_IN_PULLS[1]).toEqual({
      id: 'knob-1-25', name: '1 1/4" knob', kind: 'knob', diameter: 1.25, projection: 1, hardwarePullId: null,
    });
    expect(findPull('p1', [BAR])).toBe(BAR);
    expect(findPull('missing', [BAR])).toBeNull();
    expect(DEFAULT_SETTINGS.pulls).toBe(BUILT_IN_PULLS);
    for (const settings of [undefined, { ...DEFAULT_SETTINGS, pulls: undefined }, { ...DEFAULT_SETTINGS, pulls: [BAR] }]) {
      const expected = settings?.pulls ?? BUILT_IN_PULLS;
      const copy = copySettings(settings);
      expect(copy.pulls).toEqual(expected);
      expect(copy.pulls).not.toBe(expected);
      expect(copy.pulls[0]).not.toBe(expected[0]);
      copy.pulls[0].length = 99;
      expect(expected[0].length).not.toBe(99);
    }
  });
});
