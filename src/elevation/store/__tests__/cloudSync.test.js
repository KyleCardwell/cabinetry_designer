import { afterEach, describe, expect, it } from 'vitest';
import { DOOR_DESIGNS } from '../../model/doorStyles.js';
import {
  addDoorDesign,
  addSectionProfile,
  deleteDoorDesign,
  importSectionProfiles,
  setLayerSetting,
  setSectionProfileArchived,
  setSetting,
  updateDoorDesign,
  updateSectionProfile,
} from '../elevationSlice.js';
import { loadProjectLayers, openCloudWorkspace, openLocalWorkspace } from '../cloudThunks.js';
import { setupCloudSync } from '../cloudSync.js';
import { cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';

const syncs = [];
afterEach(() => { while (syncs.length) syncs.pop().stop(); });

async function openStore(options = {}, permissions) {
  const api = fakeDesignApi(options);
  const store = cloudStore(api, permissions);
  const sync = setupCloudSync(store, { getDesignApi: async () => api, delay: 5 });
  syncs.push(sync);
  await store.dispatch(openCloudWorkspace());
  api.calls.length = 0;
  return { api, store, sync };
}

const saves = (api) => api.calls.filter(([name]) => !['loadTeamSettings', 'listProfiles', 'listDoorDesigns', 'getProject'].includes(name));

describe('DB4 f cloud sync', () => {
  it('saves nothing just because the shop data loaded', async () => {
    const { api, sync } = await openStore();
    expect((await sync.flush()).ok).toBe(true);
    expect(saves(api)).toEqual([]);
  });

  it('first shop-standard save inserts (version 0), the next one updates', async () => {
    const { api, store, sync } = await openStore();
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    await sync.flush();
    store.dispatch(setSetting({ key: 'baseDepth', value: 25 }));
    await sync.flush();
    expect(saves(api)).toEqual([['saveTeamSettings', 0], ['saveTeamSettings', 1]]);
    expect(api.db.teamSettings.settings.roundTo).toBe(0.25);
    expect(api.db.teamSettings.settings.baseDepth).toBe(25);
    expect(api.db.teamSettings.settings).not.toHaveProperty('sectionProfiles');
    expect(store.getState().elevation.cloud.teamVersion).toBe(2);
    expect(store.getState().elevation.cloud.pending).toBe(0);
  });

  it('coalesces quick edits into one save', async () => {
    const { api, store, sync } = await openStore();
    for (const value of [0.25, 0.125, 1]) store.dispatch(setSetting({ key: 'roundTo', value }));
    await sync.flush();
    expect(saves(api)).toEqual([['saveTeamSettings', 0]]);
    expect(api.db.teamSettings.settings.roundTo).toBe(1);
  });

  it('pauses on a conflict and reports who saved', async () => {
    const { api, store, sync } = await openStore({ teamSettings: { settings: {}, version: 2 } });
    api.db.teamSettings.version = 3; // someone else saved meanwhile
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    expect((await sync.flush()).ok).toBe(false);
    expect(store.getState().elevation.cloud.conflict).toEqual({
      target: 'team', what: 'Shop settings', updatedByName: 'Other', updatedAt: 't',
    });
    store.dispatch(setSetting({ key: 'roundTo', value: 0.5 }));
    await sync.flush();
    expect(saves(api)).toEqual([['saveTeamSettings', 2]]);
    // Reloading starts clean, on the newer version.
    await store.dispatch(openCloudWorkspace());
    store.dispatch(setSetting({ key: 'roundTo', value: 0.125 }));
    expect((await sync.flush()).ok).toBe(true);
    expect(saves(api).at(-1)).toEqual(['saveTeamSettings', 3]);
  });

  it('pauses on an error and saves again on retry', async () => {
    const { api, store, sync } = await openStore();
    api.failNext = { ok: false, reason: 'network', message: 'Failed to fetch' };
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    await sync.flush();
    expect(store.getState().elevation.cloud.error).toEqual({ target: 'team', what: 'Shop settings', message: 'Failed to fetch' });
    expect((await sync.retry()).ok).toBe(true);
    expect(store.getState().elevation.cloud.error).toBeNull();
    expect(api.db.teamSettings.settings.roundTo).toBe(0.25);
  });

  it('inserts a new profile with its own uuid, updates it, archives instead of deleting', async () => {
    const { api, store, sync } = await openStore();
    store.dispatch(addSectionProfile({ kind: 'crown' }));
    await sync.flush();
    const profile = store.getState().elevation.settings.sectionProfiles[0];
    expect(api.db.profiles.map((row) => row.profile_id)).toEqual([profile.id]);
    store.dispatch(updateSectionProfile({ profileId: profile.id, profile: { ...profile, name: 'Crown 6' } }));
    store.dispatch(setSectionProfileArchived({ profileId: profile.id, archived: true }));
    await sync.flush();
    expect(saves(api)).toEqual([
      ['saveProfile', profile.id, 0],
      ['saveProfile', profile.id, 1],
      ['archiveLibraryItem', 'profile', profile.id, true],
    ]);
    expect(api.db.profiles[0]).toMatchObject({ name: 'Crown 6', version: 2, archived_at: 't' });
  });

  it('gives imported old-style profile ids a uuid in the shop library', async () => {
    const { api, store, sync } = await openStore();
    store.dispatch(addSectionProfile({ kind: 'crown' }));
    const template = store.getState().elevation.settings.sectionProfiles[0];
    store.dispatch(importSectionProfiles({ profiles: [{ ...template, id: 'sp-bead5', name: 'Old' }] }));
    await sync.flush();
    const ids = store.getState().elevation.settings.sectionProfiles.map((profile) => profile.id);
    expect(ids).not.toContain('sp-bead5');
    expect(api.db.profiles.map((row) => row.profile_id).sort()).toEqual([...ids].sort());
  });

  it('saves a built-in design edit to its row, a new design under its id, and archives a deleted one', async () => {
    const { api, store, sync } = await openStore();
    const seedRow = api.db.doorDesigns[0];
    store.dispatch(updateDoorDesign({ designId: 'five-piece-square', design: { ...DOOR_DESIGNS[0], code: '110' } }));
    store.dispatch(addDoorDesign({ baseId: 'five-piece-square' }));
    await sync.flush();
    const added = store.getState().elevation.settings.doorDesigns.at(-1);
    expect(seedRow).toMatchObject({ code: '110', version: 2 });
    expect(seedRow.data.seedId).toBe('five-piece-square');
    expect(api.db.doorDesigns.at(-1).design_id).toBe(added.id);
    store.dispatch(deleteDoorDesign({ designId: added.id, reassignTo: 'five-piece-square' }));
    await sync.flush();
    expect(saves(api).at(-1)).toEqual(['archiveLibraryItem', 'door_design', added.id, true]);
  });

  it('saves project and phase overrides with their versions', async () => {
    const { api, store, sync } = await openStore({ project: {
      project: { est_project_id: 42 },
      design: { overrides: {}, version: 3 },
      phases: [{ phase_id: 'ph-1', overrides: {}, version: 1, rooms: [] }],
    } });
    await store.dispatch(loadProjectLayers({ estProjectId: 42, phaseId: 'ph-1' }));
    store.dispatch(setLayerSetting({ level: 'project', key: 'roundTo', value: 0.25 }));
    store.dispatch(setLayerSetting({ level: 'phase', key: 'baseDepth', value: 25 }));
    await sync.flush();
    expect(saves(api)).toEqual([['saveProjectOverrides', 42, 3], ['savePhaseOverrides', 'ph-1', 1]]);
    expect(api.db.project.design.overrides).toEqual({ roundTo: 0.25 });
    expect(store.getState().elevation.cloud.layerVersions).toEqual({ project: 4, phase: 2 });
  });

  it('refuses to send without permission and says so', async () => {
    const { api, store, sync } = await openStore({}, { view: true, edit: false, manage: false });
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    await sync.flush();
    expect(saves(api)).toEqual([]);
    expect(store.getState().elevation.cloud.error.what).toBe('Shop settings');
  });

  it('counts pending saves while one is in flight', async () => {
    const { api, store, sync } = await openStore();
    api.hold();
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    const flushing = sync.flush();
    await Promise.resolve();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(store.getState().elevation.cloud.pending).toBeGreaterThan(0);
    api.release();
    await flushing;
    expect(store.getState().elevation.cloud.pending).toBe(0);
  });

  it('does nothing in the local sandbox', async () => {
    const { api, store, sync } = await openStore();
    store.dispatch(openLocalWorkspace());
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    await sync.flush();
    expect(saves(api)).toEqual([]);
  });
});
