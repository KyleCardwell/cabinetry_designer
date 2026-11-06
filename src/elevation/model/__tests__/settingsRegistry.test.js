import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { groupsFor } from '../settingGroups.js';
import { cleanOverrides, resolveSetting, withOverride } from '../settingsResolve.js';
import { LIBRARY_KEYS, PREF_KEYS, SETTING_LEVELS, SETTINGS_REGISTRY, allowedAt, registryEntry } from '../settingsRegistry.js';

function leaves(values, prefix = '') {
  return Object.entries(values).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? leaves(value, path) : [path];
  });
}

describe('DB1 a settings registry', () => {
  it('covers exactly 171 settings leaves, with 118 room settings and 15 team-only settings after SH7.4 a', () => {
    const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS)
      .filter(([key]) => ![...LIBRARY_KEYS, ...PREF_KEYS].includes(key)));
    const keys = SETTINGS_REGISTRY.map(({ key }) => key);
    expect(keys.toSorted()).toEqual(leaves(settings).toSorted());
    expect(new Set(keys).size).toBe(171);
    expect(SETTINGS_REGISTRY.filter(({ key }) => allowedAt(key, 'room'))).toHaveLength(118);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'team')).toHaveLength(15);
  });

  it('provides labels, kinds, choices, and managed metadata for every leaf', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.label).toEqual(expect.any(String));
      expect(entry.label.length).toBeGreaterThan(0);
      expect(['number', 'bool', 'choice', 'id', 'text', 'pull', 'slide']).toContain(entry.kind);
      expect(SETTING_LEVELS).toContain(entry.lowest);
      if (entry.highest) expect(SETTING_LEVELS).toContain(entry.highest);
      if (entry.kind === 'choice') expect(entry.choices.length).toBeGreaterThan(0);
      expect(registryEntry(entry.key)).toBe(entry);
    }
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'wall')).toHaveLength(17);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'face')).toHaveLength(18);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'cabinet')).toHaveLength(2);
    expect(SETTINGS_REGISTRY.filter(({ managedBy }) => managedBy)).toHaveLength(38);
    expect(registryEntry('defaultProfile.nosingProfileId').kind).toBe('id');
    expect(registryEntry('drawerSlideId')).toEqual({
      key: 'drawerSlideId', label: 'Drawer slide', kind: 'slide', lowest: 'room',
    });
    expect(registryEntry('sheetThickness')).toEqual({
      key: 'sheetThickness', label: 'Sheet thickness', kind: 'number', lowest: 'room',
    });
    expect(registryEntry('defaultStyle.cabinetStyleId').choices).toEqual([13, 14, 15]);
  });

  it('allows the declared override levels and rejects managed room edits (anchor 8)', () => {
    expect(SETTING_LEVELS).toEqual(['team', 'project', 'phase', 'room', 'wall', 'run', 'cabinet', 'face']);
    expect([allowedAt('baseDepth', 'room'), allowedAt('doorPanelDefault', 'room'), allowedAt('doorPanelDefault', 'team')])
      .toEqual([true, false, true]);
    for (const level of ['team', 'project', 'phase', 'room']) expect(allowedAt('roundTo', level)).toBe(true);
    for (const level of ['wall', 'run', 'cabinet', 'face', 'bogus']) expect(allowedAt('roundTo', level)).toBe(false);
    for (const entry of SETTINGS_REGISTRY.filter(({ managedBy }) => managedBy)) {
      for (const level of ['team', 'project', 'phase']) expect(allowedAt(entry.key, level)).toBe(true);
      for (const level of ['room', 'wall', 'run', 'cabinet', 'face']) expect(allowedAt(entry.key, level)).toBe(false);
    }
  });

  it('excludes the library, all seven prefs, and unknown keys', () => {
    expect(LIBRARY_KEYS).toEqual(['teamDoorStyle', 'doorDesigns', 'sectionProfiles', 'shapes', 'pulls', 'slides', 'accessories']);
    expect(PREF_KEYS).toEqual(['orthoWalls', 'showPartNumbers', 'plotScale', 'paperSize', 'planGrid', 'openingSnap', 'cornerSnapDistance']);
    for (const key of [...LIBRARY_KEYS, ...PREF_KEYS, 'bogus', 'insetFrame']) {
      expect(registryEntry(key)).toBeUndefined();
      expect(allowedAt(key, 'team')).toBe(false);
    }
  });
});

it('IN9 registers roll-out defaults with labels, room inheritance and reset', () => {
  for (const [key, value, label] of [
    ['rolloutHeight', 4.25, 'Roll-out height'], ['rolloutSpacer', 1.25, 'Roll-out hinge spacer'],
  ]) {
    expect(DEFAULT_SETTINGS[key]).toBe(value);
    expect(registryEntry(key)).toEqual({ key, label, kind: 'number', lowest: 'room' });
    expect(resolveSetting(key)).toEqual({ value, source: { level: 'default' } });
    const chain = ['team', 'project', 'phase', 'room'].map((level, index) => ({ level, values: { [key]: value + index + 1 } }));
    for (let index = 0; index < chain.length; index += 1) {
      expect(cleanOverrides(chain[index].values, chain[index].level)).toEqual(chain[index].values);
      expect(resolveSetting(key, chain.slice(0, index + 1)))
        .toEqual({ value: value + index + 1, source: { level: chain[index].level } });
    }
    chain[3].values = withOverride(chain[3].values, key, null);
    expect(resolveSetting(key, chain)).toEqual({ value: value + 3, source: { level: 'phase' } });
    for (const level of ['wall', 'run', 'cabinet', 'face']) {
      expect(allowedAt(key, level)).toBe(false);
      expect(cleanOverrides({ [key]: value }, level)).toEqual({});
    }
  }
});

it('IN8 / IN13b registers the shelf defaults and inherits/resets them through the room level', () => {
  const defaults = {
    floatingShelfSpacing: 11, shelfSpacing: 11, shelfWidthClearance: 1 / 16, zoneGap: 1, shelfSetback: 1 / 8,
    glassShelfThickness: 1 / 4, shelfNosingHeight: 1.5, shelfNosingThickness: 13 / 16,
    foldedNosingExtra: 2, shoeShelfAngle: 12, shoeShelfClear: 6,
  };
  expect(registryEntry('floatingShelfSpacing').label).toBe('Min clear between floating shelves');
  expect(registryEntry('zoneGap').label).toBe('Side-by-side zone gap');
  for (const [key, value] of Object.entries(defaults)) {
    expect(DEFAULT_SETTINGS[key]).toBe(value);
    expect(registryEntry(key)).toMatchObject({ kind: 'number', lowest: 'room' });
    expect(resolveSetting(key)).toEqual({ value, source: { level: 'default' } });
    const chain = ['team', 'project', 'phase', 'room'].map((level, i) => ({ level, values: { [key]: value + i + 1 } }));
    for (let i = 0; i < chain.length; i += 1) {
      expect(allowedAt(key, chain[i].level)).toBe(true);
      expect(cleanOverrides(chain[i].values, chain[i].level)).toEqual(chain[i].values);
      expect(resolveSetting(key, chain.slice(0, i + 1)))
        .toEqual({ value: value + i + 1, source: { level: chain[i].level } });
    }
    chain[3].values = withOverride(chain[3].values, key, null);
    expect(resolveSetting(key, chain)).toEqual({ value: value + 3, source: { level: 'phase' } });
    for (const level of ['wall', 'run', 'cabinet', 'face']) {
      expect(allowedAt(key, level)).toBe(false);
      expect(cleanOverrides({ [key]: value }, level)).toEqual({});
    }
  }
});


it('IN11a registers ProBox text defaults through room scope and company address only at team scope', () => {
  const defaults = {
    sideMaterial: 'Baltic Birch Ply', sideThickness: '5/8"', bottomMaterial: '1/4" Baltic Birch Ply',
    topEdge: 'Flat Flush', bottomPlacement: 'Standard', assembly: 'Pre-finished & assembled',
    comments: 'Cross Grain Bottoms',
  };
  const labels = ['Box side material', 'Box side thickness', 'Box bottom material', 'Box top edge',
    'Box bottom placement', 'Box assembly & finish', 'Box order comments'];
  expect(DEFAULT_SETTINGS.drawerBoxOrder).toEqual(defaults);
  Object.entries(defaults).forEach(([leaf, value], index) => {
    const key = `drawerBoxOrder.${leaf}`;
    expect(registryEntry(key)).toEqual({ key, label: labels[index], kind: 'text', lowest: 'room' });
    expect(resolveSetting(key).value).toBe(value);
    const chain = ['team', 'project', 'phase', 'room'].map((level) => ({
      level, values: { drawerBoxOrder: { [leaf]: `${level} pick` } },
    }));
    chain.forEach((layer, i) => {
      expect(cleanOverrides(layer.values, layer.level)).toEqual(layer.values);
      expect(resolveSetting(key, chain.slice(0, i + 1)).value).toBe(`${layer.level} pick`);
    });
    chain[3].values = withOverride(chain[3].values, key, null);
    expect(resolveSetting(key, chain).value).toBe('phase pick');
    for (const level of ['wall', 'run', 'cabinet', 'face']) {
      expect(allowedAt(key, level)).toBe(false);
      expect(cleanOverrides({ drawerBoxOrder: { [leaf]: 'Custom' } }, level)).toEqual({});
    }
  });
  for (const [leaf, label] of [['companyAddress', 'Address'], ['companyCity', 'City'],
    ['companyState', 'State'], ['companyZip', 'Zip']]) {
    const key = `report.${leaf}`;
    expect(DEFAULT_SETTINGS.report[leaf]).toBe('');
    expect(registryEntry(key)).toEqual({ key, label, kind: 'text', lowest: 'team' });
    expect(cleanOverrides({ report: { [leaf]: 'Shop' } }, 'team')).toEqual({ report: { [leaf]: 'Shop' } });
    for (const level of ['project', 'phase', 'room', 'wall', 'run', 'cabinet', 'face']) {
      expect(allowedAt(key, level)).toBe(false);
      expect(cleanOverrides({ report: { [leaf]: 'Other' } }, level)).toEqual({});
      expect(resolveSetting(key, [{ level, values: { report: { [leaf]: 'Other' } } }]).value).toBe('');
    }
  }
});

it('SH7.2 registers leg panel defaults with labels, room inheritance and Runs & ends grouping', () => {
  for (const [key, value, label] of [
    ['legPanelReveal', 0.25, 'Leg panel reveal'],
    ['legPanelTopClearance', 0, 'Leg panel top clearance'],
    ['legPanelBottomClearance', 0, 'Leg panel bottom clearance'],
  ]) {
    expect(DEFAULT_SETTINGS[key]).toBe(value);
    expect(registryEntry(key)).toEqual({ key, label, kind: 'number', lowest: 'room' });
    expect(resolveSetting(key)).toEqual({ value, source: { level: 'default' } });
    const chain = ['team', 'project', 'phase', 'room'].map((level, i) => ({ level, values: { [key]: i + 1 } }));
    chain.forEach((layer, i) => {
      expect(cleanOverrides(layer.values, layer.level)).toEqual(layer.values);
      expect(resolveSetting(key, chain.slice(0, i + 1))).toEqual({ value: i + 1, source: { level: layer.level } });
      expect(groupsFor(layer.level).find(({ id }) => id === 'runs-ends').keys).toContain(key);
    });
    for (const level of ['wall', 'run', 'cabinet', 'face']) expect(allowedAt(key, level)).toBe(false);
  }
});

it('SH7.3 registers leg panel return depth through room scope in Runs & ends', () => {
  const key = 'legPanelReturnDepth';
  expect(DEFAULT_SETTINGS[key]).toBe(4.5);
  expect(registryEntry(key)).toEqual({ key, label: 'Leg panel return depth', kind: 'number', lowest: 'room' });
  expect(resolveSetting(key)).toEqual({ value: 4.5, source: { level: 'default' } });
  const chain = ['team', 'project', 'phase', 'room'].map((level, i) => ({ level, values: { [key]: i + 2 } }));
  chain.forEach((layer, i) => {
    expect(cleanOverrides(layer.values, layer.level)).toEqual(layer.values);
    expect(resolveSetting(key, chain.slice(0, i + 1))).toEqual({ value: i + 2, source: { level: layer.level } });
    expect(groupsFor(layer.level).find(({ id }) => id === 'runs-ends').keys).toContain(key);
  });
  for (const level of ['wall', 'run', 'cabinet', 'face']) expect(allowedAt(key, level)).toBe(false);
});

it('SH7.4 registers square leg dimensions with defaults and Runs & ends inheritance through room scope', () => {
  for (const [key, label] of [['squareLegWidth', 'Square leg width'], ['squareLegDepth', 'Square leg depth']]) {
    expect(DEFAULT_SETTINGS[key]).toBe(3);
    expect(registryEntry(key)).toEqual({ key, label, kind: 'number', lowest: 'room' });
    expect(resolveSetting(key)).toEqual({ value: 3, source: { level: 'default' } });
    const chain = ['team', 'project', 'phase', 'room'].map((level, i) => ({ level, values: { [key]: i + 1 } }));
    chain.forEach((layer, i) => {
      expect(cleanOverrides(layer.values, layer.level)).toEqual(layer.values);
      expect(resolveSetting(key, chain.slice(0, i + 1))).toEqual({ value: i + 1, source: { level: layer.level } });
      expect(groupsFor(layer.level).find(({ id }) => id === 'runs-ends').keys).toContain(key);
    });
    chain[3].values = withOverride(chain[3].values, key, null);
    expect(resolveSetting(key, chain)).toEqual({ value: 3, source: { level: 'phase' } });
    for (const level of ['wall', 'run', 'cabinet', 'face']) expect(allowedAt(key, level)).toBe(false);
  }
});
