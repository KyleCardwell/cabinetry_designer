import { describe, expect, it } from 'vitest';
import { newAccessory } from '../accessories.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { newSectionProfile } from '../sectionProfiles.js';
import { resolveSetting, resolveSettings } from '../settingsResolve.js';
import { buildSettingsSnapshot, isSettingsSnapshot, resolvedIssueSettings, settingsFromSnapshot } from '../settingsSnapshot.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import { BUILT_IN_PULLS } from '../pulls.js';
import { defaultVersionLabel, nameInitials } from '../roomVersions.js';
import { MICRO_SHAKER } from './fixtures/microShakerDesign.js';

const P_CROWN = '0192a1b2-c3d4-7e5f-8a9b-00000000c001';
const P_EDGE = '0192a1b2-c3d4-7e5f-8a9b-00000000e001';
const P_UNUSED = '0192a1b2-c3d4-7e5f-8a9b-00000000f001';
const D_SHAKER = '0192a1b2-c3d4-7e5f-8a9b-00000000d001';
const D_UNUSED = '0192a1b2-c3d4-7e5f-8a9b-00000000d002';

it('LP1 anchor 5: opens pre-LP1 snapshots with pricing defaults and independent labor', () => {
  const snapshot = buildSettingsSnapshot({ settings: library(), document: roomDocument() });
  for (const key of ['pulls', 'slides']) {
    for (const item of snapshot[key]) {
      delete item.price;
      delete item.actualCost;
      delete item.labor;
    }
  }
  const before = structuredClone(snapshot);
  expect(isSettingsSnapshot(snapshot)).toBe(true);
  const restored = settingsFromSnapshot(snapshot);
  expect(restored.ok).toBe(true);
  expect(restored.settings.pulls).toEqual(BUILT_IN_PULLS);
  expect(restored.settings.slides).toEqual(BUILT_IN_SLIDES);
  expect(snapshot).toEqual(before);
  for (const key of ['pulls', 'slides']) {
    Object.assign(snapshot[key][0], { price: 12, actualCost: 8, labor: { '7': 4 } });
    const priced = settingsFromSnapshot(snapshot);
    expect(priced.settings[key][0]).toMatchObject({ price: 12, actualCost: 8, labor: { '7': 4 } });
    priced.settings[key][0].labor['7'] = 10;
    expect(snapshot[key][0].labor).toEqual({ '7': 4 });
    for (const [field, value] of [['price', 'x'], ['actualCost', -1], ['labor', null]]) {
      const invalid = structuredClone(snapshot);
      invalid[key][0][field] = value;
      expect(isSettingsSnapshot(invalid)).toBe(false);
      expect(settingsFromSnapshot(invalid)).toMatchObject({ ok: false, reason: 'bad_snapshot' });
    }
  }
});

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
    expect(snapshot.library).toEqual({ doorDesigns: { [D_SHAKER]: 2 }, profiles: { [P_CROWN]: 4 }, pulls: {}, slides: {}, accessories: {} });
    expect(snapshot.missing).toEqual({ doorDesigns: [], profiles: [], pulls: [], slides: [], accessories: [] });
    expect(snapshot.issuedFrom).toMatchObject({ estProjectId: 42, roomVersion: 6, teamVersion: null });
    expect(isSettingsSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
  });

  it('lists door designs and profiles the room names but the library no longer has', () => {
    const snapshot = buildSettingsSnapshot({ settings: library(), document: roomDocument({ designId: 'gone-design', outside: 'gone-profile' }) });
    expect(snapshot.missing).toEqual({ doorDesigns: ['gone-design'], profiles: ['gone-profile'], pulls: [], slides: [], accessories: [] });
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


describe('IN5 step e slide snapshots', () => {
  it('anchors 3 and 4: freezes used slides and row versions, reports missing ids and opens legacy snapshots', () => {
    const U = '0192a1b2-c3d4-7e5f-8a9b-00000000a001';
    const C = { ...structuredClone(BUILT_IN_SLIDES[0]), id: 'custom', name: 'Custom' };
    const live = { ...library(), slides: [...structuredClone(BUILT_IN_SLIDES), C,
      { ...C, id: 'settings-slide', name: 'Settings slide' }, { ...C, id: 'unused', name: 'Unused' }],
      drawerSlideId: 'overridden' };
    const document = { ...roomDocument(), walls: [{ runs: [{ grid: {
      kind: 'cabinet', drawerSlideId: 'accuride-3832', face: { type: 'drawer_front', drawerBox: { slideId: U } },
    } }] }] };
    const missing = buildSettingsSnapshot({ settings: live, layers: { project: { values: { drawerSlideId: 'blum-562h' } } }, document });
    expect(missing.slides).toEqual(BUILT_IN_SLIDES);
    expect(missing.missing.slides).toEqual([U]);
    document.walls[0].runs[0].grid.drawerSlideId = C.id;
    const snapshot = buildSettingsSnapshot({ settings: live, document,
      layers: { phase: { values: { drawerSlideId: 'settings-slide' } } },
      rows: { slides: { 'blum-562h': { version: 2 }, custom: { version: 3 }, unused: { version: 9 } } } });
    expect(snapshot.format).toBe(1);
    expect(snapshot.settings).not.toHaveProperty('slides');
    expect(snapshot.slides.map(({ id }) => id)).toEqual([...BUILT_IN_SLIDES.map(({ id }) => id), C.id, 'settings-slide']);
    expect(snapshot.library.slides).toEqual({ 'blum-562h': 2, custom: 3 });
    expect(snapshot.missing.slides).toEqual([U]);
    const frozen = settingsFromSnapshot(snapshot);
    expect(frozen.settings.slides).toEqual(snapshot.slides);
    expect(frozen.settings.slides).not.toBe(snapshot.slides);
    C.name = 'Changed later';
    C.lengths[0].nominal = 1;
    expect(frozen.settings.slides[3].name).toBe('Custom');
    expect(snapshot.slides[3].lengths[0].nominal).toBe(9);
    const { slides, ...legacy } = snapshot;
    expect(slides).toHaveLength(5);
    expect(settingsFromSnapshot(legacy).settings.slides).toEqual(BUILT_IN_SLIDES);
    expect(settingsFromSnapshot(legacy).settings.slides).not.toBe(BUILT_IN_SLIDES);
    for (const slides of [null, {}, [], [...BUILT_IN_SLIDES, { ...BUILT_IN_SLIDES[0], id: 'bad' }]]) {
      expect(settingsFromSnapshot({ ...snapshot, slides })).toMatchObject({ ok: false, reason: 'bad_snapshot' });
    }
  });
});


it('IN12b f anchors 4–5: freezes only keyed accessories in library order, restores deep copies and accepts legacy snapshots', () => {
  const susan = { ...newAccessory([], 'susan'), name: 'Susan', labor: { '7': 15 } };
  const tray = { ...newAccessory([], 'tray'), name: 'Tray' };
  const live = { ...library(), accessories: [susan, tray] };
  const document = { walls: [{ runs: [{ grid: { interior: { accessories: [{ accessoryId: susan.id }] } } }] }], note: tray.id };
  const snapshot = buildSettingsSnapshot({ settings: live, document,
    rows: { accessories: { susan: { version: 4 }, tray: { version: 9 } } } });
  expect(snapshot.accessories).toEqual([susan]);
  expect(snapshot.accessories[0]).not.toBe(susan);
  expect(snapshot.library.accessories).toEqual({ susan: 4 });
  expect(snapshot.missing.accessories).toEqual([]);
  expect(snapshot.settings).not.toHaveProperty('accessories');
  const restored = settingsFromSnapshot(snapshot);
  expect(restored.settings.accessories).toEqual([susan]);
  restored.settings.accessories[0].labor['7'] = 25;
  live.accessories[0].minOpening.width = 27;
  expect(snapshot.accessories[0].labor).toEqual({ '7': 15 });
  expect(snapshot.accessories[0].minOpening.width).toBeNull();
  document.extra = [{ accessoryId: 'gone' }, { accessoryId: 'aaa' }, { accessoryId: 'gone' }];
  expect(buildSettingsSnapshot({ settings: live, document }).missing.accessories).toEqual(['aaa', 'gone']);
  // Settings references count as well, but unrelated strings and suffixed keys do not.
  live.accessoryId = tray.id;
  expect(buildSettingsSnapshot({ settings: live, document: { accessoryId: susan.id, otherAccessoryId: 'ignored' } }).accessories)
    .toEqual([susan, tray]);
  expect(buildSettingsSnapshot({ settings: library(), document: {} })).toMatchObject({
    accessories: [], library: { accessories: {} }, missing: { accessories: [] },
  });
  const legacy = { ...snapshot };
  delete legacy.accessories;
  expect(settingsFromSnapshot(legacy).settings.accessories).toEqual([]);
  for (const accessories of [null, {}, [{ ...susan, price: -1 }], [susan, { ...tray, name: 'SUSAN' }]]) {
    expect(settingsFromSnapshot({ ...snapshot, accessories })).toMatchObject({ ok: false, reason: 'bad_snapshot' });
  }
});
