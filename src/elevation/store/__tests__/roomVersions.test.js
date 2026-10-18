import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRoomDocument } from '../../model/designProjects.js';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { newSectionProfile } from '../../model/sectionProfiles.js';
import { profileToRow, pullToRow, slideToRow } from '../../model/cloudRows.js';
import { BUILT_IN_SLIDES } from '../../model/slides.js';
import { BUILT_IN_PULLS } from '../../model/pulls.js';
import { settingsFor } from '../slices/helpers.js';
import { setRoomPartNumberStart, setSetting, updateSlide, updateSectionProfile } from '../elevationSlice.js';
import {
  issueRoomVersion,
  issueSnapshotOf,
  loadRoomVersions,
  openCloudRoom,
  openCloudWorkspace,
  openRoomVersion,
  setRoomStatus,
} from '../cloudThunks.js';
import { cloudSync, setupCloudSync } from '../cloudSync.js';
import { ELEVATION_SCHEMA_VERSION, persistElevationDocument } from '../persistence.js';
import { createMemoryDraftStore } from '../roomDrafts.js';
import { resetPresenceForTests } from '../presenceThunks.js';
import { ALL, TEAM_ID, cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const CROWN = '0192a1b2-c3d4-7e5f-8a9b-00000000c001';
const VIEW_ONLY = { view: true, edit: false, manage: false };

const syncs = [];
afterEach(() => {
  cloudSync.register(null);
  resetPresenceForTests();
  vi.unstubAllGlobals();
  while (syncs.length) syncs.pop().stop();
});

function roomRow(extra = {}, documentExtra = {}) {
  const { document } = newRoomDocument('Kitchen');
  return { room_id: 'rm-1', phase_id: 'ph-1', name: 'Kitchen', document: { ...document, ...documentExtra },
    schema_version: ELEVATION_SCHEMA_VERSION, status: 'drafting', status_at: null, version: 5,
    sort: 0, archived_at: null, last_version: null, updated_at: 't0', ...extra };
}

function versionApi(row = roomRow()) {
  const crown = { ...newSectionProfile([], CROWN, null, 'crown'), name: 'Crown 4' };
  return fakeDesignApi({
    teamSettings: { settings: { roundTo: 0.5, defaultProfile: { crownProfileId: CROWN }, teamDoorStyle: DEFAULT_DOOR_STYLE }, version: 3 },
    profiles: [{ ...profileToRow(crown), version: 7, archived_at: null }],
    project: {
      project: { est_project_id: 42 },
      design: { overrides: { roundTo: 0.25 }, version: 3 },
      phases: [{ phase_id: 'ph-1', name: 'Phase 1', overrides: { baseDepth: 25 }, version: 2, rooms: [row] }],
    },
  });
}

async function setup({ api = versionApi(), permissions = ALL } = {}) {
  const drafts = createMemoryDraftStore();
  const store = cloudStore(api, permissions, TEAM_ID, { drafts, userName: 'Kyle Cardwell' });
  const sync = setupCloudSync(store, { getDesignApi: async () => api, delay: 5, drafts, draftDelay: 5 });
  cloudSync.register(sync);
  syncs.push(sync);
  await store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
  api.calls.length = 0;
  return { api, store, sync };
}

const elevationOf = (store) => store.getState().elevation;
const dbRoom = (api) => api.db.project.phases[0].rooms[0];
const callNames = (api) => api.calls.map(([name]) => name);
const editPart = (store, value) => store.dispatch(setRoomPartNumberStart({ value }));
const renameCrown = (store, name) => {
  const profile = elevationOf(store).settings.sectionProfiles.find((entry) => entry.id === CROWN);
  store.dispatch(updateSectionProfile({ profileId: CROWN, profile: { ...profile, name } }));
};

describe('DB8a issue', () => {
  const U = '0192a1b2-c3d4-7e5f-8a9b-00000000a001';
  const pullWalls = (pullId = null) => stateWithRun(run({ autoCount: false, drawerPullId: 'none', items: [
    { ...auto('c1'), doorPullId: U, face: { type: 'door', size: null, pullId } },
  ] })).rooms[0].walls;
  const bar = { ...BUILT_IN_PULLS[0], id: U, name: 'Bar' };

  it('HP3c step d: issues the used pulls with row versions and opens their frozen library', async () => {
    const api = versionApi(roomRow({}, { walls: pullWalls() }));
    api.db.pulls.push({ pull_id: U, ...pullToRow(bar), version: 3, archived_at: null });
    const ctx = await setup({ api });
    const issued = await ctx.store.dispatch(issueRoomVersion({ label: 'KC Pulls' }));
    expect(issued.ok).toBe(true);
    const snapshot = api.db.versions[0].settings_snapshot;
    expect(snapshot.pulls.map(({ id }) => id)).toEqual(['pull-4', 'knob-1-25', U]);
    expect(snapshot.library.pulls).toEqual({ 'pull-4': 1, 'knob-1-25': 1, [U]: 3 });
    expect(snapshot.missing.pulls).toEqual([]);
    api.db.pulls.find(({ pull_id }) => pull_id === U).archived_at = 'later';
    expect((await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: issued.versionId }))).ok).toBe(true);
    const elevation = elevationOf(ctx.store);
    expect(elevation.source).toBe('version');
    expect(elevation.settings.slides).toEqual(BUILT_IN_SLIDES);
    expect(elevation.cloud.rows.slides).toEqual({});
    expect(callNames(ctx.api)).not.toContain('listSlides');
    expect(elevation.settings.pulls).toEqual(snapshot.pulls);
    expect(settingsFor(elevation, elevation.rooms[0]).pulls.at(-1)).toEqual(bar);
  });

  it('HP3c step d anchor 2: refuses missing room or resolved pulls, reporting door designs first', async () => {
    for (const where of ['face', 'settings', 'both']) {
      const style = { ...structuredClone(DEFAULT_DOOR_STYLE), id: 'ds-a', label: 'A', designId: 'gone-design' };
      const api = versionApi(roomRow({}, {
        walls: pullWalls(where === 'settings' ? null : 'gone'),
        ...(where === 'both' ? { doorStyles: [style] } : {}),
      }));
      api.db.pulls.push({ pull_id: U, ...pullToRow(bar), version: 3, archived_at: null });
      if (where === 'settings') api.db.project.phases[0].overrides.drawerPullId = 'gone';
      const ctx = await setup({ api });
      expect(issueSnapshotOf(ctx.store.getState()).missing.pulls).toEqual(['gone']);
      const reply = await ctx.store.dispatch(issueRoomVersion({ label: 'KC Pulls' }));
      expect(reply).toMatchObject({ ok: false, reason: 'missing_library', missing: { pulls: ['gone'] } });
      expect(reply.message).toBe(where === 'both'
        ? 'This room uses a door design that is no longer in the library. Pick a replacement, then issue.'
        : 'This room uses a pull that is no longer in the library. Pick a replacement, then issue.');
      expect(callNames(api)).not.toContain('issueRoomVersion');
      expect(api.db.versions).toEqual([]);
    }
  });

  it('RP1 b freezes room and team style material and restores both when opening the issue', async () => {
    const style = { ...DEFAULT_DOOR_STYLE, id: 'a', label: 'A', material: 'MAPLE/MDF' };
    const api = versionApi(roomRow({}, { doorStyles: [style] }));
    api.db.teamSettings.settings.teamDoorStyle = { ...DEFAULT_DOOR_STYLE, material: 'WHITE OAK' };
    const ctx = await setup({ api });
    const issued = await ctx.store.dispatch(issueRoomVersion({ label: 'KC Material' }));
    expect(issued.ok).toBe(true);
    const [version] = api.db.versions;
    expect(version.document.doorStyles[0].material).toBe('MAPLE/MDF');
    expect(version.settings_snapshot.settings.teamDoorStyle.material).toBe('WHITE OAK');
    dbRoom(api).document.doorStyles[0].material = 'CHERRY';
    api.db.teamSettings.settings.teamDoorStyle.material = 'WALNUT';
    const reply = await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: issued.versionId }));
    expect(reply.ok).toBe(true);
    const elevation = elevationOf(ctx.store);
    expect(elevation.rooms[0].doorStyles[0].material).toBe('MAPLE/MDF');
    expect(elevation.settings.teamDoorStyle.material).toBe('WHITE OAK');
  });

  it('saves pending edits first, then freezes that version with its settings snapshot', async () => {
    const ctx = await setup();
    editPart(ctx.store, 7);
    const reply = await ctx.store.dispatch(issueRoomVersion({ label: '  KC 10/15/26 ', note: '  ' }));
    expect(reply).toEqual({ ok: true, versionId: expect.any(String), seq: 1, label: 'KC 10/15/26', issuedAt: 't-issued-1' });
    expect(callNames(ctx.api)).toEqual(['saveRoomDocument', 'issueRoomVersion']);
    expect(ctx.api.calls[1]).toEqual(['issueRoomVersion', 'rm-1', 'KC 10/15/26', null, 6]);

    const [version] = ctx.api.db.versions;
    expect(version.document.partNumberStart).toBe(7);
    const snapshot = version.settings_snapshot;
    expect([snapshot.settings.roundTo, snapshot.settings.baseDepth]).toEqual([0.25, 25]);
    expect(snapshot.overrides).toEqual({ project: { roundTo: 0.25 }, phase: { baseDepth: 25 } });
    expect(snapshot.sectionProfiles.map((profile) => profile.name)).toEqual(['Crown 4']);
    expect(snapshot.library.profiles).toEqual({ [CROWN]: 7 });
    expect(snapshot.issuedFrom).toEqual({ teamId: TEAM_ID, estProjectId: 42, phaseId: 'ph-1', roomId: 'rm-1',
      roomVersion: 6, teamVersion: 3, projectVersion: 3, phaseVersion: 2 });
    expect(elevationOf(ctx.store).cloud.room.lastVersion).toEqual({ seq: 1, label: 'KC 10/15/26', issuedAt: 't-issued-1' });
    expect(elevationOf(ctx.store).cloud.room.version).toBe(6); // issuing doesn't bump the room's counter
  });

  it('refuses when someone saved the room since it was opened', async () => {
    const ctx = await setup();
    dbRoom(ctx.api).version = 9;
    const reply = await ctx.store.dispatch(issueRoomVersion({ label: 'KC' }));
    expect(reply).toMatchObject({ ok: false, reason: 'conflict', updatedByName: 'Other', version: 9 });
    expect(reply.message).toMatch(/Other saved this room/);
    expect(ctx.api.db.versions).toEqual([]);
  });

  it('refuses an empty label, unsaved changes, a view-only room and a missing door design', async () => {
    const ctx = await setup();
    expect((await ctx.store.dispatch(issueRoomVersion({ label: '  ' }))).reason).toBe('bad_input');

    editPart(ctx.store, 7);
    dbRoom(ctx.api).version = 9; // the save conflicts and pauses
    expect((await ctx.store.dispatch(issueRoomVersion({ label: 'KC' }))).reason).toBe('unsaved');
    expect(callNames(ctx.api)).not.toContain('issueRoomVersion');

    const viewer = await setup({ permissions: VIEW_ONLY });
    expect((await viewer.store.dispatch(issueRoomVersion({ label: 'KC' }))).reason).toBe('permission');

    const style = { ...structuredClone(DEFAULT_DOOR_STYLE), id: 'ds-a', label: 'A', designId: 'gone-design' };
    const missing = await setup({ api: versionApi(roomRow({}, { doorStyles: [style] })) });
    const reply = await missing.store.dispatch(issueRoomVersion({ label: 'KC' }));
    expect(reply).toMatchObject({ ok: false, reason: 'missing_library', missing: { doorDesigns: ['gone-design'] } });
    expect(issueSnapshotOf(missing.store.getState()).missing.doorDesigns).toEqual(['gone-design']);
  });

  it('lists versions newest first', async () => {
    const ctx = await setup();
    await ctx.store.dispatch(issueRoomVersion({ label: 'KC 1' }));
    await ctx.store.dispatch(issueRoomVersion({ label: 'KC 2', note: 'Moved the sink' }));
    const reply = await ctx.store.dispatch(loadRoomVersions());
    expect(reply.versions.map(({ seq, label, note, issuedByName }) => ({ seq, label, note, issuedByName }))).toEqual([
      { seq: 2, label: 'KC 2', note: 'Moved the sink', issuedByName: 'Me' },
      { seq: 1, label: 'KC 1', note: null, issuedByName: 'Me' },
    ]);
  });
});

describe('DB8a room status', () => {
  it('approves against the room version and records who', async () => {
    const ctx = await setup();
    editPart(ctx.store, 7);
    expect(await ctx.store.dispatch(setRoomStatus('approved'))).toEqual({ ok: true, status: 'approved', statusAt: 't-status' });
    expect(ctx.api.calls).toEqual([['saveRoomDocument', 'rm-1', 5, false], ['setRoomStatus', 'rm-1', 'approved', 6]]);
    expect(elevationOf(ctx.store).cloud.room).toMatchObject({ status: 'approved', statusAt: 't-status', statusByName: 'Kyle Cardwell' });
  });

  it('refuses an unknown status and a stale room', async () => {
    const ctx = await setup();
    expect((await ctx.store.dispatch(setRoomStatus('done'))).reason).toBe('bad_input');
    dbRoom(ctx.api).version = 9;
    expect((await ctx.store.dispatch(setRoomStatus('released'))).reason).toBe('conflict');
    expect(elevationOf(ctx.store).cloud.room.status).toBe('drafting');
  });
});

describe('DB8a opening an issued version', () => {
  async function issuedThenChanged() {
    const ctx = await setup();
    editPart(ctx.store, 7);
    const issued = await ctx.store.dispatch(issueRoomVersion({ label: 'KC 10/15/26', note: 'For approval' }));
    // Afterwards the room, the shop standard, the project settings and the library all change.
    editPart(ctx.store, 9);
    renameCrown(ctx.store, 'Crown 4 (fixed)');
    ctx.store.dispatch(updateSlide({ slideId: 'blum-562h', slide: { ...BUILT_IN_SLIDES[0], name: 'Shop Blum' } }));
    await ctx.sync.flush();
    ctx.api.db.teamSettings.settings.baseDepth = 30;
    ctx.api.db.project.design.overrides = { roundTo: 0.125 };
    ctx.api.calls.length = 0;
    return { ...ctx, issued };
  }

  it('draws the frozen room with its own snapshot, read-only, saving nothing', async () => {
    const ctx = await issuedThenChanged();
    expect(ctx.api.db.profiles[0].name).toBe('Crown 4 (fixed)');
    const reply = await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }));
    expect(reply).toEqual({ ok: true, version: { versionId: ctx.issued.versionId, seq: 1, label: 'KC 10/15/26',
      note: 'For approval', issuedAt: 't-issued-1', issuedByName: 'Me' } });

    const elevation = elevationOf(ctx.store);
    expect(elevation.source).toBe('version');
    expect(elevation.settings.slides).toEqual(BUILT_IN_SLIDES);
    expect(elevation.cloud.rows.slides).toEqual({});
    expect(callNames(ctx.api)).not.toContain('listSlides');
    expect(elevation.rooms.map((room) => [room.id, room.partNumberStart])).toEqual([['rm-1', 7]]);
    expect(elevation.settings.sectionProfiles.map((profile) => profile.name)).toEqual(['Crown 4']);
    const settings = settingsFor(elevation, elevation.rooms[0]);
    expect([settings.roundTo, settings.baseDepth]).toEqual([0.25, 25]);
    expect(elevation.cloud.room).toMatchObject({ id: 'rm-1', readOnly: true, readOnlyReason: 'version', version: null,
      status: 'drafting', lastVersion: { seq: 1, label: 'KC 10/15/26', issuedAt: 't-issued-1' },
      issued: { seq: 1, label: 'KC 10/15/26' } });

    editPart(ctx.store, 11);
    ctx.store.dispatch(setSetting({ key: 'roundTo', value: 1 }));
    renameCrown(ctx.store, 'Changed');
    expect(elevationOf(ctx.store)).toBe(elevation);
    await ctx.sync.flush();
    expect(ctx.api.calls.filter(([name]) => name.startsWith('save'))).toEqual([]);

    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    persistElevationDocument(elevation);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('opening the room again brings back the live draft, standard and library', async () => {
    const ctx = await issuedThenChanged();
    await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }));
    expect((await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).ok).toBe(true);
    const elevation = elevationOf(ctx.store);
    expect(elevation.source).toBe('cloud');
    expect(elevation.cloud.room.readOnly).toBe(false);
    expect(elevation.rooms[0].partNumberStart).toBe(9);
    expect(elevation.settings.sectionProfiles[0].name).toBe('Crown 4 (fixed)');
    expect(settingsFor(elevation, elevation.rooms[0]).roundTo).toBe(0.125);
  });

  it('fails readably for a version of another room and an unreadable snapshot', async () => {
    const ctx = await issuedThenChanged();
    expect((await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-2', versionId: ctx.issued.versionId }))).reason).toBe('not_found');
    expect((await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: 'nope' }))).reason).toBe('not_found');
    ctx.api.db.versions[0].settings_snapshot = { format: 99 };
    const reply = await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }));
    expect(reply).toMatchObject({ ok: false, reason: 'bad_snapshot' });
  });

  it('a view-only user can open a version too', async () => {
    const ctx = await issuedThenChanged();
    const viewer = cloudStore(ctx.api, VIEW_ONLY);
    expect((await viewer.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }))).ok).toBe(true);
    expect(viewer.getState().elevation.cloud.permissions).toEqual(VIEW_ONLY);
    expect((await cloudStore(ctx.api, { view: false, edit: false, manage: false })
      .dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }))).reason).toBe('permission');
  });

  it('the Library reopens live shop data after a version', async () => {
    const ctx = await issuedThenChanged();
    await ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: ctx.issued.versionId }));
    await ctx.store.dispatch(openCloudWorkspace());
    expect(elevationOf(ctx.store).source).toBe('cloud');
    expect(elevationOf(ctx.store).settings.sectionProfiles[0].name).toBe('Crown 4 (fixed)');
  });
});


describe('IN5 e issued slides', () => {
  const C = { ...structuredClone(BUILT_IN_SLIDES[0]), id: '0192a1b2-c3d4-7e5f-8a9b-00000000a001', name: 'Custom slide' };
  const walls = (slideId) => stateWithRun(run({ autoCount: false, items: [
    { ...auto('c1'), drawerSlideId: slideId, face: { type: 'drawer_front', size: null } },
  ] })).rooms[0].walls;

  it('anchor 4: opens a custom slide from its frozen snapshot and falls back for legacy snapshots', async () => {
    const api = versionApi(roomRow({}, { walls: walls(C.id) }));
    api.db.slides.push({ slide_id: C.id, ...slideToRow(C), version: 3, archived_at: null });
    const ctx = await setup({ api });
    const issued = await ctx.store.dispatch(issueRoomVersion({ label: 'Slides' }));
    expect(issued.ok).toBe(true);
    const snapshot = api.db.versions[0].settings_snapshot;
    expect(snapshot.slides).toEqual([...BUILT_IN_SLIDES, C]);
    expect(snapshot.library.slides).toEqual({ 'blum-562h': 1, 'accuride-3832': 1, 'accuride-4034': 1, [C.id]: 3 });
    api.db.slides.find(({ slide_id }) => slide_id === C.id).archived_at = 'later';
    api.calls.length = 0;
    const open = () => ctx.store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: issued.versionId }));
    expect((await open()).ok).toBe(true);
    expect(elevationOf(ctx.store).settings.slides).toEqual([...BUILT_IN_SLIDES, C]);
    expect(settingsFor(elevationOf(ctx.store), elevationOf(ctx.store).rooms[0]).slides).toEqual([...BUILT_IN_SLIDES, C]);
    expect(callNames(api)).not.toContain('listSlides');
    delete api.db.versions[0].settings_snapshot.slides;
    expect((await open()).ok).toBe(true);
    expect(elevationOf(ctx.store).settings.slides).toEqual(BUILT_IN_SLIDES);
  });

  it('anchor 3: refuses missing room and resolved-setting slides before calling the issue API', async () => {
    for (const where of ['room', 'settings']) {
      const api = versionApi(roomRow({}, { walls: walls(where === 'room' ? C.id : 'accuride-3832') }));
      if (where === 'settings') api.db.project.phases[0].overrides.drawerSlideId = C.id;
      const ctx = await setup({ api });
      expect(issueSnapshotOf(ctx.store.getState()).missing.slides).toEqual([C.id]);
      const reply = await ctx.store.dispatch(issueRoomVersion({ label: 'Slides' }));
      expect(reply).toMatchObject({ ok: false, reason: 'missing_library', missing: { slides: [C.id] },
        message: 'This room uses a slide that is no longer in the library. Pick a replacement, then issue.' });
      expect(callNames(api)).not.toContain('issueRoomVersion');
    }
  });
});
