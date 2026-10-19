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

  it('validates finite numbers, strict booleans and choices while rejecting managed edits at room and below', () => {
    const input = { roundTo: 0, baseDepth: Infinity, upperDepth: NaN, tallDepth: '24',
      snapHeightsToDefaults: false, autoEndPanelOnFreeEnd: 1, openingsHaveCasing: null,
      defaultEnds: { left: 'none', right: 'bogus' }, defaultSoffitMolding: 'topMold',
      defaultOpeningMeasureMode: 'casing', insetFrame: { stile: -0.25, rail: null },
      defaultProfile: { nosingProfileId: 'profile', crownProfileId: null, baseKind: 'toe_kick' },
      defaultStyle: { cabinetStyleId: 13 }, maxCabinetWidth: 42 };
    const expected = { roundTo: 0, snapHeightsToDefaults: false, defaultEnds: { left: 'none' },
      defaultSoffitMolding: 'topMold', defaultOpeningMeasureMode: 'casing', insetFrame: { stile: -0.25 } };
    expect(cleanOverrides(input, 'room')).toEqual(expected);
    // DB4: above room, managed keys are plain settings (project heights, styles, max width).
    const aboveRoom = { ...expected, maxCabinetWidth: 42,
      defaultProfile: { nosingProfileId: 'profile', crownProfileId: null, baseKind: 'toe_kick' },
      defaultStyle: { cabinetStyleId: 13 } };
    expect(cleanOverrides(input, 'project')).toEqual(aboveRoom);
    expect(cleanOverrides(input, 'team')).toEqual(aboveRoom);
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


describe('RP1 a report settings', () => {
  it('resolves project wood over team wood (anchor 1)', () => {
    expect(resolveSetting('report.wood', [
      { level: 'team', values: { report: { wood: 'PAINT GRADE' } } },
      { level: 'project', values: { report: { wood: 'MAPLE' } } },
    ])).toEqual({ value: 'MAPLE', source: { level: 'project' } });
  });

  it('allows Job # from project through room, excluding team (anchor 2)', () => {
    const values = { report: { jobNumber: '573' } };
    expect(cleanOverrides(values, 'team')).toEqual({});
    for (const level of ['project', 'phase', 'room']) expect(cleanOverrides(values, level)).toEqual(values);
    for (const level of ['wall', 'run', 'cabinet', 'face', 'bogus']) expect(cleanOverrides(values, level)).toEqual({});
    expect(resolveSetting('report.jobNumber', [{ level: 'team', values }]).value).toBe('');
  });

  it('rejects room company overrides and permits company fields only at team (anchor 3)', () => {
    expect(cleanOverrides({ report: { companyName: 'X' } }, 'room')).toEqual({});
    const report = { companyName: 'X', companyPhone: '555', companyFax: '556', doorFormNote: 'No midrails' };
    expect(cleanOverrides({ report }, 'team')).toEqual({ report });
    for (const level of ['project', 'phase', 'room', 'wall', 'run', 'cabinet', 'face']) {
      expect(cleanOverrides({ report }, level)).toEqual({});
      expect(resolveSetting('report.companyName', [{ level, values: { report } }]).value).toBe('');
    }
  });

  it('validates trimmed strings up to 120 characters (anchor 4)', () => {
    expect(isValidSettingValue('report.wood', 12)).toBe(false);
    expect(isValidSettingValue('report.wood', 'x'.repeat(121))).toBe(false);
    expect(isValidSettingValue('report.wood', 'OAK')).toBe(true);
    expect(isValidSettingValue('report.wood', ` ${'x'.repeat(120)} `)).toBe(true);
    for (const value of [null, undefined, {}, [], true]) expect(isValidSettingValue('report.wood', value)).toBe(false);
  });

  it('defaults every report text to blank and wire brushed to false (anchor 5)', () => {
    expect(resolveSettings().report).toEqual({
      companyAddress: '', companyCity: '', companyState: '', companyZip: '',
      companyName: '', companyPhone: '', companyFax: '', doorFormNote: '', jobNumber: '',
      wood: '', finish: '', boxMaterial: '', wireBrushed: false, edgebandAlert: '',
    });
  });

  it('trims stored text, prunes blank overrides and inherits past blank or invalid stored text', () => {
    const values = { report: { wood: ' OAK ', finish: '   ', wireBrushed: false } };
    expect(cleanOverrides(values, 'room')).toEqual({ report: { wood: 'OAK', wireBrushed: false } });
    expect(values.report.wood).toBe(' OAK ');
    expect(withOverride(values, 'report.wood', ' MAPLE ').report.wood).toBe('MAPLE');
    expect(withOverride({ report: { wood: 'OAK' } }, 'report.wood', '  ')).toEqual({});
    for (const wood of ['  ', 12, 'x'.repeat(121)]) {
      expect(resolveSetting('report.wood', [team({ report: { wood: ' OAK ' } }), room({ report: { wood } })]))
        .toEqual({ value: 'OAK', source: { level: 'team', id: 'shop' } });
    }
  });
});


it('IN4b d validates slide IDs and resolves only through room level', () => {
  const key = 'drawerSlideId';
  expect(resolveSetting(key)).toEqual({ value: 'blum-562h', source: { level: 'default' } });
  for (const level of ['team', 'project', 'phase', 'room']) {
    for (const value of ['accuride-3832', 'gone']) {
      expect(isValidSettingValue(key, value)).toBe(true);
      expect(cleanOverrides({ [key]: value }, level)).toEqual({ [key]: value });
      expect(resolveSetting(key, [{ level, values: { [key]: value } }]))
        .toEqual({ value, source: { level } });
    }
    for (const value of ['', null, 3, false, [], {}]) {
      expect(isValidSettingValue(key, value)).toBe(false);
      expect(cleanOverrides({ [key]: value }, level)).toEqual({});
      expect(resolveSetting(key, [team({ [key]: 'accuride-3832' }), { level, values: { [key]: value } }]).value)
        .toBe('accuride-3832');
    }
  }
  const chain = ['team', 'project', 'phase', 'room'].map((level, index) => ({ level, values: { [key]: `slide-${index}` } }));
  expect(resolveSettings(chain).drawerSlideId).toBe('slide-3');
  for (const level of ['wall', 'run', 'cabinet', 'face']) {
    expect(cleanOverrides({ [key]: 'accuride-3832' }, level)).toEqual({});
    expect(resolveSetting(key, [{ level, values: { [key]: 'accuride-3832' } }]).value).toBe('blum-562h');
  }
});
