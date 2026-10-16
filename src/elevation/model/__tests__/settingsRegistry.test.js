import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { LIBRARY_KEYS, PREF_KEYS, SETTING_LEVELS, SETTINGS_REGISTRY, allowedAt, registryEntry } from '../settingsRegistry.js';

function leaves(values, prefix = '') {
  return Object.entries(values).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? leaves(value, path) : [path];
  });
}

describe('DB1 a settings registry', () => {
  it('covers exactly 125 settings leaves, with 75 room settings and 11 team-only settings after RP1', () => {
    const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS)
      .filter(([key]) => ![...LIBRARY_KEYS, ...PREF_KEYS].includes(key)));
    const keys = SETTINGS_REGISTRY.map(({ key }) => key);
    expect(keys.toSorted()).toEqual(leaves(settings).toSorted());
    expect(new Set(keys).size).toBe(125);
    expect(SETTINGS_REGISTRY.filter(({ key }) => allowedAt(key, 'room'))).toHaveLength(75);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'team')).toHaveLength(11);
  });

  it('provides labels, kinds, choices, and managed metadata for every leaf', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.label).toEqual(expect.any(String));
      expect(entry.label.length).toBeGreaterThan(0);
      expect(['number', 'bool', 'choice', 'id', 'text', 'pull']).toContain(entry.kind);
      expect(SETTING_LEVELS).toContain(entry.lowest);
      if (entry.highest) expect(SETTING_LEVELS).toContain(entry.highest);
      if (entry.kind === 'choice') expect(entry.choices.length).toBeGreaterThan(0);
      expect(registryEntry(entry.key)).toBe(entry);
    }
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'wall')).toHaveLength(17);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'face')).toHaveLength(18);
    expect(SETTINGS_REGISTRY.filter(({ lowest }) => lowest === 'cabinet')).toHaveLength(3);
    expect(SETTINGS_REGISTRY.filter(({ managedBy }) => managedBy)).toHaveLength(39);
    expect(registryEntry('defaultProfile.nosingProfileId').kind).toBe('id');
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
    expect(LIBRARY_KEYS).toEqual(['teamDoorStyle', 'doorDesigns', 'sectionProfiles', 'pulls']);
    expect(PREF_KEYS).toEqual(['orthoWalls', 'showPartNumbers', 'plotScale', 'paperSize', 'planGrid', 'openingSnap', 'cornerSnapDistance']);
    for (const key of [...LIBRARY_KEYS, ...PREF_KEYS, 'bogus', 'insetFrame']) {
      expect(registryEntry(key)).toBeUndefined();
      expect(allowedAt(key, 'team')).toBe(false);
    }
  });
});
