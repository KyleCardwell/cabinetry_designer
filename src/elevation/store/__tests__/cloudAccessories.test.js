import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessoryToRow } from '../../model/cloudRows.js';
import { newAccessory } from '../../model/accessories.js';
import { newRoomDocument } from '../../model/designProjects.js';
import { addAccessory, deleteAccessory, updateAccessory } from '../elevationSlice.js';
import { issueRoomVersion, openCloudRoom, openCloudWorkspace, openRoomVersion, openLocalWorkspace } from '../cloudThunks.js';
import { setupCloudSync } from '../cloudSync.js';
import { ELEVATION_SCHEMA_VERSION } from '../persistence.js';
import { resetPresenceForTests } from '../presenceThunks.js';
import { ALL, cloudStore, fakeDesignApi, fakeUuid, TEAM_ID } from './helpers/fakeDesignApi.js';

const services = [{ id: 7, name: 'Shop', active: true }, { id: 9, name: 'Install', active: false }];
const susan = () => ({ ...newAccessory([], fakeUuid()), name: 'Lazy susan 28', brand: 'Rev-A-Shelf', model: '6472-28',
  description: '28" kidney lazy susan', reportText: '6472-28 lazy susan', wholeSection: true,
  minOpening: { width: 27, depth: 22, height: null }, price: 185, actualCost: 112.4, labor: { '7': 15, '9': 5 } });
const rowFor = (accessory, version = 2) => ({ accessory_id: accessory.id, ...accessoryToRow(accessory), version, archived_at: null });
const syncs = [];
afterEach(() => {
  while (syncs.length) syncs.pop().stop();
  resetPresenceForTests();
  vi.useRealTimers();
});

async function open(options = {}, permissions = ALL, syncEnabled = false) {
  const api = fakeDesignApi({ teamServices: services, ...options });
  const store = cloudStore(api, permissions);
  let sync;
  if (syncEnabled) {
    sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
  }
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
  return { api, store, sync };
}

describe('IN12b c shop accessories', () => {
  it('loads an empty library and services without seeding, with or without manage permission (anchor 3)', async () => {
    for (const manage of [true, false]) {
      const { api, store, sync } = await open({}, { ...ALL, manage }, true);
      expect(store.getState().elevation.settings.accessories).toEqual([]);
      expect(store.getState().elevation.cloud.rows.accessories).toEqual({});
      expect(store.getState().elevation.teamServices).toEqual(services);
      expect(await sync.flush()).toEqual({ ok: true });
      expect(api.calls.filter(([name]) => name === 'saveAccessory')).toEqual([]);
    }
  });

  it('keeps the workspace open with empty services and a note when services fail (anchor 3b)', async () => {
    const api = fakeDesignApi();
    api.replies.listTeamServices = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
    expect(store.getState().elevation.teamServices).toEqual([]);
    expect(store.getState().elevation.message).toBe("The shop's services couldn't be loaded, so labour minutes can't be added right now.");
  });

  it('loads valid live rows in row order and notes skipped rows in singular and plural (anchor 4)', async () => {
    const first = susan();
    const second = { ...susan(), name: 'Tray divider' };
    const invalid = { ...rowFor(susan()), data: {} };
    const archived = { ...rowFor(susan()), archived_at: 't' };
    for (const count of [1, 2]) {
      const { store } = await open({ accessories: [rowFor(first), ...Array.from({ length: count }, () => ({ ...invalid, accessory_id: fakeUuid() })),
        ...(count === 2 ? [rowFor(second)] : []), archived] });
      const state = store.getState().elevation;
      expect(state.settings.accessories).toEqual(count === 1 ? [first] : [first, second]);
      expect(state.cloud.rows.accessories[first.id]).toEqual({ rowId: first.id, version: 2 });
      expect(state.cloud.rows.accessories).not.toHaveProperty(invalid.accessory_id);
      expect(state.message).toBe(count === 1 ? "1 accessory couldn't be read and was left out."
        : "2 accessories couldn't be read and were left out.");
    }
  });

  it('fails accessory fetches before saving anything and rejects conflicting names', async () => {
    const api = fakeDesignApi();
    api.replies.listAccessories = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: false, reason: 'network', message: "Couldn't load the shop data: Offline" });
    expect(store.getState().elevation.workspace.error).toBe("Couldn't load the shop data: Offline");
    expect(api.calls.some(([name]) => name.startsWith('save'))).toBe(false);
    delete api.replies.listAccessories;
    api.db.accessories = [rowFor(susan()), rowFor({ ...susan(), name: 'LAZY SUSAN 28' })];
    expect(await store.dispatch(openCloudWorkspace())).toMatchObject({ ok: false, reason: 'bad_input' });
    expect(store.getState().elevation.workspace.error).toContain('two accessories share a name');
  });

  it('saves new accessories and edits after 15 seconds, then flushes archiving (anchor 5)', async () => {
    vi.useFakeTimers();
    const original = susan();
    const { api, store, sync } = await open({ accessories: [rowFor(original)] }, ALL, true);
    const save = vi.spyOn(api, 'saveAccessory');
    store.dispatch(addAccessory());
    const added = store.getState().elevation.settings.accessories.at(-1);
    await vi.advanceTimersByTimeAsync(14999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ teamId: TEAM_ID, accessoryId: added.id,
      ...accessoryToRow(added), expectedVersion: 0 });
    expect(store.getState().elevation.cloud.rows.accessories[added.id]).toEqual({ rowId: added.id, version: 1 });
    const edited = { ...original, price: 200, labor: { '7': 20, '9': 5 } };
    store.dispatch(updateAccessory({ accessoryId: original.id, accessory: edited }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(save).toHaveBeenLastCalledWith({ teamId: TEAM_ID, accessoryId: original.id,
      ...accessoryToRow(edited), expectedVersion: 2 });
    expect(store.getState().elevation.cloud.rows.accessories[original.id].version).toBe(3);
    expect(api.db.accessories[0].data.labor).toEqual({ '7': 20, '9': 5 });
    store.dispatch(deleteAccessory({ accessoryId: original.id }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls.at(-1)).toEqual(['archiveLibraryItem', 'accessory', original.id, true]);
    expect(api.db.accessories[0].archived_at).toBe('t');
    expect(api.calls.some(([name]) => name === 'saveTeamSettings')).toBe(false);
  });

  it('pauses a conflict with the accessory name until reloading (anchor 5)', async () => {
    const original = susan();
    const { api, store, sync } = await open({ accessories: [rowFor(original)] }, ALL, true);
    api.db.accessories[0].version = 3;
    const edit = () => store.dispatch(updateAccessory({ accessoryId: original.id, accessory: { ...original, price: 200 } }));
    edit();
    expect(await sync.flush()).toEqual({ ok: false });
    expect(store.getState().elevation.cloud.conflict).toEqual({ target: `accessory:${original.id}`,
      what: 'Accessory "Lazy susan 28"', updatedByName: 'Other', updatedAt: 't' });
    await sync.flush();
    expect(api.calls.filter(([name]) => name === 'saveAccessory')).toHaveLength(1);
    await store.dispatch(openCloudWorkspace());
    edit();
    expect(await sync.flush()).toEqual({ ok: true });
    expect(store.getState().elevation.cloud.rows.accessories[original.id].version).toBe(4);
  });

  it('preserves services for shop rooms and clears them for issued versions and the sandbox', async () => {
    const { document } = newRoomDocument('Kitchen');
    const original = susan();
    const { store, api } = await open({ accessories: [rowFor(original)], project: {
      project: { est_project_id: 42 }, design: { overrides: {}, version: 1 },
      phases: [{ phase_id: 'ph-1', name: 'Phase 1', overrides: {}, version: 1, rooms: [{
        room_id: 'rm-1', phase_id: 'ph-1', name: 'Kitchen', document, schema_version: ELEVATION_SCHEMA_VERSION,
        version: 1, status: 'drafting', archived_at: null,
      }] }],
    } });
    expect(await store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ ok: true });
    expect(store.getState().elevation.teamServices).toEqual(services);
    const issued = await store.dispatch(issueRoomVersion({ label: 'Kitchen' }));
    expect(issued.ok).toBe(true);
    expect(await store.dispatch(openRoomVersion({ estProjectId: 42, roomId: 'rm-1', versionId: issued.versionId }))).toMatchObject({ ok: true });
    expect(store.getState().elevation.teamServices).toEqual([]);
    expect(store.getState().elevation.settings.accessories).toEqual([]);
    expect(store.getState().elevation.cloud.rows.accessories).toEqual({});
    expect(api.calls.filter(([name]) => name === 'saveAccessory')).toEqual([]);
    await store.dispatch(openCloudWorkspace());
    expect(store.getState().elevation.teamServices).toEqual(services);
    await store.dispatch(openLocalWorkspace());
    expect(store.getState().elevation.teamServices).toEqual([]);
  });
});
