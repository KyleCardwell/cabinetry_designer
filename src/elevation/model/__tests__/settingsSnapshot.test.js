import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { newSectionProfile } from '../sectionProfiles.js';
import { resolveSetting, resolveSettings } from '../settingsResolve.js';
import { buildSettingsSnapshot, isSettingsSnapshot, resolvedIssueSettings, settingsFromSnapshot } from '../settingsSnapshot.js';
import { BUILT_IN_PULLS } from '../pulls.js';
import { defaultVersionLabel, nameInitials } from '../roomVersions.js';
import { MICRO_SHAKER } from './fixtures/microShakerDesign.js';

const P_CROWN = '0192a1b2-c3d4-7e5f-8a9b-00000000c001';
const P_EDGE = '0192a1b2-c3d4-7e5f-8a9b-00000000e001';
const P_UNUSED = '0192a1b2-c3d4-7e5f-8a9b-00000000f001';
const D_SHAKER = '0192a1b2-c3d4-7e5f-8a9b-00000000d001';
const D_UNUSED = '0192a1b2-c3d4-7e5f-8a9b-00000000d002';

function library() {
  const profiles = [
    { ...newSectionProfile([], P_CROWN, null, 'crown'), name: 'Crown 4' },
    { ...newSectionProfile([], P_EDGE, null, 'door_outside'), name: 'Bead', archived: true },
    { ...newSectionProfile([], P_UNUSED, null, 'crown'), name: 'Unused' },
  ];
  const designs = [
    ...structuredClone(DOOR_DESIGNS),
    { ...MICRO_SHAKER, id: D_SHAKER },
    { ...MICRO_SHAKER, id: D_UNUSED, code: 'Other' },
  ];
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.defaultProfile = { ...settings.defaultProfile, crownProfileId: P_CROWN };
  settings.doorDesigns = designs;
  settings.sectionProfiles = profiles;
  return settings;
}

function roomDocument({ designId = D_SHAKER, outside = P_EDGE } = {}) {
  return {
    id: 'rm-1',
    name: 'Kitchen',
    doorStyles: [{ ...structuredClone(DEFAULT_DOOR_STYLE), id: 'ds-a', label: 'A', designId,
      profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside } }],
    walls: [],
  };
}

const layers = {
  project: { id: 42, values: { roundTo: 0.25 } },
  phase: { id: 'ph-1', values: { baseDepth: 25 } },
};

describe('DB8a version label', () => {
  it('prefills initials and an unpadded M/D/YY date', () => {
    expect(defaultVersionLabel('Kyle Cardwell', new Date(2026, 9, 13))).toBe('KC 10/13/26');
    expect(defaultVersionLabel('kyle e. cardwell', new Date(2027, 2, 5))).toBe('KEC 3/5/27');
    expect(defaultVersionLabel('', new Date(2026, 9, 13))).toBe('10/13/26');
    expect(nameInitials(null)).toBe('');
  });
});

describe('DB8a settings snapshot', () => {
  it('freezes the resolved team → project → phase settings and only the library the room draws with', () => {
    const settings = library();
    const snapshot = buildSettingsSnapshot({
      settings, layers, document: roomDocument(),
      rows: { profiles: { [P_CROWN]: { rowId: P_CROWN, version: 4 } }, doorDesigns: { [D_SHAKER]: { rowId: D_SHAKER, version: 2 } } },
      issuedFrom: { teamId: 't', estProjectId: 42, phaseId: 'ph-1', roomId: 'rm-1', roomVersion: 6 },
    });
    expect(snapshot.format).toBe(1);
    expect([snapshot.settings.roundTo, snapshot.settings.baseDepth]).toEqual([0.25, 25]);
    expect(snapshot.settings.defaultProfile.crownProfileId).toBe(P_CROWN);
    expect(snapshot.settings.teamDoorStyle).toEqual(DEFAULT_DOOR_STYLE);
    expect(snapshot.settings).not.toHaveProperty('doorDesigns');
    expect(snapshot.settings).not.toHaveProperty('sectionProfiles');
    expect(snapshot.settings).not.toHaveProperty('showPartNumbers');
    expect(snapshot.sectionProfiles.map((profile) => profile.id)).toEqual([P_CROWN, P_EDGE]);
    expect(snapshot.sectionProfiles[1].archived).toBe(true);
    expect(snapshot.doorDesigns.map((design) => design.id)).toEqual(['five-piece-square', 'slab', 'slab-mdf', D_SHAKER]);
    expect(snapshot.overrides).toEqual({ project: { roundTo: 0.25 }, phase: { baseDepth: 25 } });
    expect(snapshot.library).toEqual({ doorDesigns: { [D_SHAKER]: 2 }, profiles: { [P_CROWN]: 4 }, pulls: {} });
    expect(snapshot.missing).toEqual({ doorDesigns: [], profiles: [], pulls: [] });
    expect(snapshot.issuedFrom).toMatchObject({ estProjectId: 42, roomVersion: 6, teamVersion: null });
    expect(isSettingsSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
  });

  it('lists door designs and profiles the room names but the library no longer has', () => {
    const snapshot = buildSettingsSnapshot({ settings: library(), document: roomDocument({ designId: 'gone-design', outside: 'gone-profile' }) });
    expect(snapshot.missing).toEqual({ doorDesigns: ['gone-design'], profiles: ['gone-profile'], pulls: [] });
    expect(snapshot.sectionProfiles.map((profile) => profile.id)).toEqual([P_CROWN]);
  });

  it('opens back to the same values, with project / phase still named as the source', () => {
    const settings = library();
    const snapshot = JSON.parse(JSON.stringify(buildSettingsSnapshot({ settings, layers, document: roomDocument(),
      issuedFrom: { estProjectId: 42, phaseId: 'ph-1' } })));
    const frozen = settingsFromSnapshot(snapshot);
    expect(frozen.ok).toBe(true);
    expect(frozen.layers).toEqual(layers);
    expect(frozen.settings.sectionProfiles.map((profile) => profile.id)).toEqual([P_CROWN, P_EDGE]);
    const chain = [{ level: 'team', values: frozen.settings },
      { level: 'project', id: 42, values: frozen.layers.project.values }, { level: 'phase', id: 'ph-1', values: frozen.layers.phase.values }];
    const live = resolveSettings([{ level: 'team', values: settings },
      { level: 'project', id: 42, values: layers.project.values }, { level: 'phase', id: 'ph-1', values: layers.phase.values }]);
    const again = resolveSettings(chain);
    for (const key of ['roundTo', 'baseDepth', 'defaultProfile', 'teamDoorStyle']) expect(again[key]).toEqual(live[key]);
    expect(resolveSetting('roundTo', chain).source).toEqual({ level: 'project', id: 42 });
  });

  it('refuses a snapshot it cannot read', () => {
    expect(settingsFromSnapshot(null)).toMatchObject({ ok: false, reason: 'bad_snapshot' });
    expect(settingsFromSnapshot({ format: 2, settings: {}, doorDesigns: [], sectionProfiles: [] }).ok).toBe(false);
    const snapshot = buildSettingsSnapshot({ settings: library(), document: roomDocument() });
    expect(settingsFromSnapshot({ ...snapshot, doorDesigns: [] }).ok).toBe(false); // built-ins are always kept
  });
});

describe('HP3c step d pull snapshots', () => {
  const U = '0192a1b2-c3d4-7e5f-8a9b-00000000a001';
  const bar = { ...BUILT_IN_PULLS[0], id: U, name: 'Bar' };
  const settings = () => ({ ...library(), pulls: [...structuredClone(BUILT_IN_PULLS), { ...bar },
    { ...bar, id: 'unused', name: 'Unused' }] });
  const document = () => ({ ...roomDocument(), walls: [{ runs: [{ grid: {
    kind: 'cabinet', doorPullId: U, face: { type: 'door', pullId: null },
  } }] }] });

  it('anchor 1: clones built-ins and used pulls in list order, with only their known row versions', () => {
    const live = settings();
    const rows = { pulls: { 'pull-4': { version: 1 }, 'knob-1-25': { version: 1 }, [U]: { version: 3 }, unused: { version: 2 } } };
    const snapshot = buildSettingsSnapshot({ settings: live, document: document(), rows });
    expect(snapshot.pulls.map(({ id }) => id)).toEqual(['pull-4', 'knob-1-25', U]);
    expect(snapshot.library.pulls).toEqual({ 'pull-4': 1, 'knob-1-25': 1, [U]: 3 });
    expect(snapshot.missing.pulls).toEqual([]);
    live.pulls[2].name = 'Changed';
    expect(snapshot.pulls[2]).toEqual(bar);
    const reopened = settingsFromSnapshot(snapshot);
    expect(isSettingsSnapshot(snapshot)).toBe(true);
    expect(reopened.settings.pulls[2]).toEqual(bar);
    reopened.settings.pulls[2].length = 6;
    expect(snapshot.pulls[2].length).toBe(bar.length);
    const byString = buildSettingsSnapshot({ settings: settings(), document: { note: U } });
    expect(byString.pulls.map(({ id }) => id)).toEqual(['pull-4', 'knob-1-25', U]);
    expect(byString.library.pulls).toEqual({});
  });

  it('anchors 2 and 4: finds keyed missing strings in the document and resolved settings, excluding none', () => {
    const doc = document();
    const run = doc.walls[0].runs[0];
    run.drawerPullId = 'none';
    run.grid.face.pullId = 'gone';
    const snapshot = buildSettingsSnapshot({ settings: settings(), document: doc });
    expect(snapshot.missing.pulls).toEqual(['gone']);
    const overrides = { project: { values: { doorPullId: U } }, phase: { values: { drawerPullId: 'aaa' } } };
    const live = { ...settings(), doorPullId: 'overridden' };
    expect(resolvedIssueSettings(live)).not.toHaveProperty('pulls');
    expect(resolvedIssueSettings(live).doorPullId).toBe('overridden');
    const resolved = resolvedIssueSettings(live, overrides);
    expect(resolved).not.toHaveProperty('pulls');
    expect(resolved.doorPullId).toBe(U);
    expect(resolved.drawerPullId).toBe('aaa');
    const withSettings = buildSettingsSnapshot({ settings: live, layers: overrides, document: {
      ...doc, settingsOverrides: { drawerPullId: 'gone' }, ignored: 'not-a-pull', invalidPullId: 42,
    } });
    expect(withSettings.missing.pulls).toEqual(['aaa', 'gone']);
    expect(withSettings.settings.doorPullId).toBe(U);
    expect(withSettings.settings.drawerPullId).toBe('aaa');
    const settingsOnly = buildSettingsSnapshot({ settings: settings(), layers: overrides, document: roomDocument() });
    expect(settingsOnly.pulls.map(({ id }) => id)).toEqual(['pull-4', 'knob-1-25', U]);
    expect(settingsOnly.missing.pulls).toEqual(['aaa']);
  });

  it('anchor 3: opens legacy snapshots with cloned built-ins and rejects malformed pull lists', () => {
    const snapshot = buildSettingsSnapshot({ settings: settings(), document: document() });
    delete snapshot.pulls;
    expect(isSettingsSnapshot(snapshot)).toBe(true);
    const legacy = settingsFromSnapshot(snapshot);
    expect(legacy.settings.pulls).toEqual(BUILT_IN_PULLS);
    legacy.settings.pulls[0].length = 6;
    expect(settingsFromSnapshot(snapshot).settings.pulls).toEqual(BUILT_IN_PULLS);
    for (const pulls of [null, {}, [], [...BUILT_IN_PULLS, bar, { ...bar, id: 'other', name: 'BAR' }]]) {
      expect(isSettingsSnapshot({ ...snapshot, pulls })).toBe(false);
      expect(settingsFromSnapshot({ ...snapshot, pulls })).toMatchObject({ ok: false, reason: 'bad_snapshot' });
    }
  });
});
