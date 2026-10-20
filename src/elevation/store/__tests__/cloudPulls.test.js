import { afterEach, describe, expect, it, vi } from 'vitest';
import { pullToRow } from '../../model/cloudRows.js';
import { BUILT_IN_PULLS, isPullList } from '../../model/pulls.js';
import { addPull, deletePull, updatePull } from '../elevationSlice.js';
import { openCloudWorkspace } from '../cloudThunks.js';
import { setupCloudSync } from '../cloudSync.js';
import { ALL, cloudStore, fakeDesignApi, fakeUuid, TEAM_ID } from './helpers/fakeDesignApi.js';

const syncs = [];
afterEach(() => {
  while (syncs.length) syncs.pop().stop();
  vi.useRealTimers();
});

const rowFor = (pull, version = 2) => ({ pull_id: fakeUuid(), ...pullToRow(pull), version, archived_at: null });
const builtIns = () => BUILT_IN_PULLS.map((pull) => rowFor(pull));
const barRow = () => rowFor({ ...BUILT_IN_PULLS[0], id: fakeUuid(), name: 'Bar', length: 6, hardwarePullId: 3 });

async function open(options = {}, permissions = ALL, syncEnabled = false) {
  const api = fakeDesignApi(options);
  const store = cloudStore(api, permissions);
  let sync;
  if (syncEnabled) {
    sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
  }
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
  return { api, store, sync };
}

describe('HP3b c shop pulls', () => {
  it('seeds an empty team once, or uses unsaved built-ins without manage permission (anchor 3)', async () => {
    const { api, store } = await open();
    expect(api.calls.filter(([name]) => name === 'savePull')).toEqual([
      ['savePull', null, 0, '4" pull'], ['savePull', null, 0, '1 1/4" knob'],
    ]);
    expect(store.getState().elevation.settings.pulls).toEqual(BUILT_IN_PULLS);
    for (const row of api.db.pulls) {
      expect(store.getState().elevation.cloud.rows.pulls[row.data.seedId]).toEqual({ rowId: row.pull_id, version: row.version });
    }
    await store.dispatch(openCloudWorkspace());
    expect(api.calls.filter(([name]) => name === 'savePull')).toHaveLength(2);
    const viewer = await open({}, { view: true, edit: false, manage: false });
    expect(viewer.api.calls.filter(([name]) => name === 'savePull')).toEqual([]);
    expect(viewer.store.getState().elevation.settings.pulls).toEqual(BUILT_IN_PULLS);
    expect(viewer.store.getState().elevation.cloud.rows.pulls).toEqual({});
    expect(viewer.store.getState().elevation.message).toBeNull();
  });

  it('orders built-ins before team rows, skips invalid rows and excludes archived pulls (anchor 4)', async () => {
    const bar = barRow();
    const { api, store } = await open({ pulls: [bar, { ...bar, pull_id: fakeUuid(), data: {} },
      ...builtIns().reverse(), { ...bar, pull_id: fakeUuid(), name: 'Archived', archived_at: 't' }] });
    const state = store.getState().elevation;
    expect(state.settings.pulls.map((pull) => pull.id)).toEqual(['pull-4', 'knob-1-25', bar.pull_id]);
    expect(state.cloud.rows.pulls[bar.pull_id]).toEqual({ rowId: bar.pull_id, version: 2 });
    expect(state.message).toBe("1 pull couldn't be read and was left out.");
    expect(api.calls.filter(([name]) => name === 'savePull')).toEqual([]);
  });

  it('keeps failed seeds unsaved and gives colliding fallbacks unique names ignoring case', async () => {
    const clash = { ...barRow(), name: '4" PULL' };
    for (const manage of [true, false]) {
      const api = fakeDesignApi({ pulls: [clash] });
      api.replies.savePull = { ok: false, reason: 'duplicate', message: 'Name taken' };
      const store = cloudStore(api, { ...ALL, manage });
      expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
      const state = store.getState().elevation;
      expect(state.settings.pulls[0].name).toBe('4" pull (built-in)');
      expect(isPullList(state.settings.pulls)).toBe(true);
      expect(state.cloud.rows.pulls['pull-4']).toBeUndefined();
      expect(state.cloud.rows.pulls['knob-1-25']).toBeUndefined();
      if (manage) expect(state.message).toContain('The built-in "4" pull" pull couldn\'t be saved (Name taken); using it unsaved.');
      else expect(state.message).toBeNull();
    }
  });

  it('fails the open on a pulls fetch failure before seeding anything', async () => {
    const api = fakeDesignApi();
    api.replies.listPulls = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: false, reason: 'network', message: "Couldn't load the shop data: Offline" });
    expect(store.getState().elevation.workspace.error).toBe("Couldn't load the shop data: Offline");
    expect(api.calls.some(([name]) => name.startsWith('save'))).toBe(false);
  });

  it('saves an edit after 15 seconds, preserves its estimator link and archives removal (anchor 5)', async () => {
    vi.useFakeTimers();
    const bar = barRow();
    const { api, store, sync } = await open({ pulls: [...builtIns(), bar] }, ALL, true);
    const save = vi.spyOn(api, 'savePull');
    const pull = store.getState().elevation.settings.pulls.at(-1);
    store.dispatch(updatePull({ pullId: pull.id, pull: { ...pull, length: 5 } }));
    await vi.advanceTimersByTimeAsync(14999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ teamId: TEAM_ID, pullId: bar.pull_id, name: 'Bar',
      data: { kind: 'pull', length: 5, centers: 4, width: 0.375, projection: 1.25, price: null, actualCost: null, labor: {} }, hardwarePullId: 3, expectedVersion: 2 });
    expect(store.getState().elevation.cloud.rows.pulls[pull.id].version).toBe(3);
    expect(api.db.pulls.at(-1).hardware_pull_id).toBe(3);
    store.dispatch(deletePull({ pullId: pull.id }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls.at(-1)).toEqual(['archiveLibraryItem', 'pull', bar.pull_id, true]);
    expect(api.calls.some(([name]) => name === 'saveTeamSettings')).toBe(false);
  });

  it('pauses a conflicting pull until reload and labels it by name (anchor 5)', async () => {
    const bar = barRow();
    const { api, store, sync } = await open({ pulls: [...builtIns(), bar] }, ALL, true);
    api.db.pulls.at(-1).version = 3;
    const pull = store.getState().elevation.settings.pulls.at(-1);
    store.dispatch(updatePull({ pullId: pull.id, pull: { ...pull, length: 5 } }));
    expect(await sync.flush()).toEqual({ ok: false });
    expect(store.getState().elevation.cloud.conflict).toEqual({
      target: `pull:${pull.id}`, what: 'Pull "Bar"', updatedByName: 'Other', updatedAt: 't',
    });
    await sync.flush();
    expect(api.calls.filter(([name]) => name === 'savePull')).toHaveLength(1);
    await store.dispatch(openCloudWorkspace());
    store.dispatch(updatePull({ pullId: pull.id, pull: { ...pull, length: 5 } }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(store.getState().elevation.cloud.rows.pulls[pull.id].version).toBe(4);
  });

  it('flushes a new uuid pull and an edited unsaved built-in with expected version zero', async () => {
    const api = fakeDesignApi();
    api.replies.savePull = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    const sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
    await store.dispatch(openCloudWorkspace());
    api.calls.length = 0;
    delete api.replies.savePull;
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls).toEqual([]);
    store.dispatch(addPull());
    const added = store.getState().elevation.settings.pulls.at(-1);
    store.dispatch(updatePull({ pullId: 'pull-4', pull: { ...BUILT_IN_PULLS[0], length: 5 } }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls).toEqual([['savePull', null, 0, '4" pull'], ['savePull', added.id, 0, added.name]]);
    expect(api.db.pulls[0].data.seedId).toBe('pull-4');
    expect(api.db.pulls[1].data).not.toHaveProperty('seedId');
    expect(store.getState().elevation.cloud.rows.pulls[added.id]).toEqual({ rowId: added.id, version: 1 });
  });
});
