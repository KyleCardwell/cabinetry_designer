import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cleanOverrides, isValidSettingValue, resolveSetting, resolveSettings, withOverride } from '../settingsResolve.js';

const team = (values) => ({ level: 'team', id: 'shop', values });
const room = (values) => ({ level: 'room', id: 'kitchen', values });

describe('DB1 a settings resolver', () => {
  it('returns the deepest leaf and its source (anchor 2)', () => {
    expect(resolveSetting('roundTo', [team({ roundTo: 0.5 }), room({ roundTo: 0.25 })]))
      .toEqual({ value: 0.25, source: { level: 'room', id: 'kitchen' } });
  });

  it('falls back to code defaults for absent leaves (anchor 3)', () => {
    expect(resolveSetting('roundTo', [team({}), room({})]))
      .toEqual({ value: 0.5, source: { level: 'default' } });
    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges nested settings by leaf rather than by block (anchor 4)', () => {
    expect(resolveSettings([team({ insetFrame: { stile: 1 } }), room({ insetFrame: { rail: 2 } })]).insetFrame)
      .toEqual({ stile: 1, rail: 2, midRail: 1.5, mullion: 1.5, upperDrop: 0.75, thickness: 0.8125 });
  });

  it('reports an equal inherited value as a deliberate room pin (anchor 5)', () => {
    expect(resolveSetting('roundTo', [team({ roundTo: 0.5 }), room({ roundTo: 0.5 })]))
      .toEqual({ value: 0.5, source: { level: 'room', id: 'kitchen' } });
  });

  it('cleans room overrides, pruning invalid and managed parents (anchor 6)', () => {
    expect(cleanOverrides({
      roundTo: 0.25, doorPanelDefault: 0.75, bogus: 1,
      faceReveals: { 1: { top: 0 } }, insetFrame: { stile: 'x' },
    }, 'room')).toEqual({ roundTo: 0.25 });
  });

  it('sets and removes leaves without mutating, pruning empty parents (anchor 7)', () => {
    const original = {};
    const set = withOverride(original, 'insetFrame.stile', 1);
    expect(set).toEqual({ insetFrame: { stile: 1 } });
    expect(withOverride(set, 'insetFrame.stile', null)).toEqual({});
    expect(withOverride(set, 'insetFrame.stile', undefined)).toEqual({});
    expect(original).toEqual({});
    expect(set).toEqual({ insetFrame: { stile: 1 } });
    const siblings = { insetFrame: { stile: 1, rail: 2 }, roundTo: 0.5 };
    expect(withOverride(siblings, 'insetFrame.stile', null)).toEqual({ insetFrame: { rail: 2 }, roundTo: 0.5 });
    expect(siblings.insetFrame.stile).toBe(1);
    const deep = withOverride({}, 'faceReveals.1.top', 0);
    expect(deep).toEqual({ faceReveals: { 1: { top: 0 } } });
    expect(withOverride(deep, 'faceReveals.1.top', null)).toEqual({});
    expect(withOverride({}, '__proto__.polluted', true)).toEqual({});
    expect({}.polluted).toBeUndefined();
  });

  it('supports project and phase layers, absent IDs, and explicit null profile picks', () => {
    const chain = [team({ roundTo: 1 }),
      { level: 'project', id: 'job', values: { roundTo: 0.5 } },
      { level: 'phase', values: { roundTo: 0.25 } },
      room({ roundTo: undefined, defaultProfile: { nosingProfileId: null, wallHeight: 108 } })];
    expect(resolveSetting('roundTo', chain)).toEqual({ value: 0.25, source: { level: 'phase' } });
    expect(resolveSetting('defaultProfile.nosingProfileId', chain))
      .toEqual({ value: null, source: { level: 'room', id: 'kitchen' } });
    const profile = resolveSettings(chain).defaultProfile;
    expect(profile.wallHeight).toBe(108);
    expect(profile.nosingProfileId).toBeNull();
    expect(profile.toeKickHeight).toBe(DEFAULT_SETTINGS.defaultProfile.toeKickHeight);
  });

  it('validates finite numbers, strict booleans and choices while rejecting all managed edits', () => {
    const input = { roundTo: 0, baseDepth: Infinity, upperDepth: NaN, tallDepth: '24',
      snapHeightsToDefaults: false, autoEndPanelOnFreeEnd: 1, openingsHaveCasing: null,
      defaultEnds: { left: 'none', right: 'bogus' }, defaultSoffitMolding: 'topMold',
      defaultOpeningMeasureMode: 'casing', insetFrame: { stile: -0.25, rail: null },
      defaultProfile: { nosingProfileId: 'profile', crownProfileId: null, baseKind: 'toe_kick' },
      defaultStyle: { cabinetStyleId: 13 }, maxCabinetWidth: 42 };
    const expected = { roundTo: 0, snapHeightsToDefaults: false, defaultEnds: { left: 'none' },
      defaultSoffitMolding: 'topMold', defaultOpeningMeasureMode: 'casing', insetFrame: { stile: -0.25 } };
    expect(cleanOverrides(input, 'room')).toEqual(expected);
    expect(cleanOverrides(input, 'project')).toEqual(expected);
    expect(cleanOverrides(input, 'team')).toEqual(expected);
    expect(cleanOverrides({ doorPanelDefault: 0.75 }, 'team')).toEqual({ doorPanelDefault: 0.75 });
    expect(cleanOverrides(input, 'wall')).toEqual({});
    expect(cleanOverrides(input, 'bogus')).toEqual({});
    for (const value of [null, undefined, 1, []]) expect(cleanOverrides(value, 'room')).toEqual({});
  });

  it('passes library, prefs and unknown values through only from the team layer', () => {
    const teamValues = { teamDoorStyle: { id: 'custom' }, doorDesigns: [], sectionProfiles: [{ id: 'profile' }],
      plotScale: 48, extra: { nested: 7 }, insetFrame: { extra: 'team' } };
    const resolved = resolveSettings([team(teamValues), room({ teamDoorStyle: { id: 'room' },
      doorDesigns: ['ignored'], sectionProfiles: [], plotScale: 12, extra: { nested: 8 },
      roomOnly: true, insetFrame: { extra: 'room' } })]);
    for (const key of ['teamDoorStyle', 'doorDesigns', 'sectionProfiles', 'plotScale', 'extra']) {
      expect(resolved[key]).toEqual(teamValues[key]);
    }
    expect(resolved.insetFrame.extra).toBe('team');
    expect(resolved.roomOnly).toBeUndefined();
    expect(resolveSetting('extra.nested', [team(teamValues), room({ extra: { nested: 8 } })]))
      .toEqual({ value: 7, source: { level: 'team', id: 'shop' } });
  });

  it('keeps inputs and defaults unchanged when resolved outputs are edited or overrides cleaned', () => {
    const chain = [team({ insetFrame: { stile: 1 }, extra: { nested: [1] } }), room({ insetFrame: { rail: 2 } })];
    const before = structuredClone(chain);
    const defaults = structuredClone(DEFAULT_SETTINGS);
    const resolved = resolveSettings(chain);
    resolved.insetFrame.stile = 99;
    resolved.extra.nested.push(2);
    resolved.defaultProfile.wallHeight = 200;
    resolved.doorDesigns.length = 0;
    const clean = cleanOverrides(chain[1].values, 'room');
    clean.insetFrame.rail = 99;
    expect(chain).toEqual(before);
    expect(DEFAULT_SETTINGS).toEqual(defaults);
  });
});

describe('DB2 c setting value validation', () => {
  it('checks registry kinds without rejecting managed keys (anchor 6)', () => {
    expect(isValidSettingValue('roundTo', 0.25)).toBe(true);
    expect(isValidSettingValue('roundTo', NaN)).toBe(false);
    expect(isValidSettingValue('defaultEnds.left', 'none')).toBe(true);
    expect(isValidSettingValue('nope', 1)).toBe(false);
    for (const value of [Infinity, '0.25', null, undefined]) {
      expect(isValidSettingValue('roundTo', value)).toBe(false);
    }
    expect(isValidSettingValue('openingsHaveCasing', false)).toBe(true);
    expect(isValidSettingValue('openingsHaveCasing', 0)).toBe(false);
    expect(isValidSettingValue('defaultEnds.left', 'bogus')).toBe(false);
    expect(isValidSettingValue('defaultProfile.nosingProfileId', 'profile')).toBe(true);
    expect(isValidSettingValue('defaultProfile.nosingProfileId', null)).toBe(true);
    expect(isValidSettingValue('defaultProfile.nosingProfileId', 1)).toBe(false);
    expect(isValidSettingValue('maxCabinetWidth', 30)).toBe(true);
    expect(isValidSettingValue(undefined, 1)).toBe(false);
  });
});
