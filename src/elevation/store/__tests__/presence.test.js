import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPresenceService, presenceEntries, presenceTopic } from '../../../api/presence.js';
import { newRoomDocument } from '../../model/designProjects.js';
import elevationReducer, {
  ROOM_EDIT_ACTION_TYPES,
  addRun,
  setRoomPartNumberStart,
  setSelection,
  setSetting,
  setView,
} from '../elevationSlice.js';
import { cloudRoomPatch } from '../elevationSlice.js';
import { editRoomAnyway, leaveCloudRoom, openCloudRoom } from '../cloudThunks.js';
import { cloudSync, setupCloudSync } from '../cloudSync.js';
import { ELEVATION_SCHEMA_VERSION } from '../persistence.js';
import { selectOpenRooms, selectRoomEditors, selectRoomViewers } from '../presenceSlice.js';
import { joinProjectPresence, leaveProjectPresence, resetPresenceForTests } from '../presenceThunks.js';
import { createMemoryDraftStore } from '../roomDrafts.js';
import { ALL, TEAM_ID, cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';
import { fakePresenceHub } from './helpers/fakePresence.js';

const syncs = [];
afterEach(() => {
  cloudSync.register(null);
  resetPresenceForTests();
  while (syncs.length) syncs.pop().stop();
});

function sharedApi() {
  const { document } = newRoomDocument('Kitchen');
  const room = (id, name) => ({ room_id: id, phase_id: 'ph-1', name, document: { ...document, name },
    schema_version: ELEVATION_SCHEMA_VERSION, status: 'drafting', status_at: null, version: 5,
    sort: 0, archived_at: null, last_version: null, updated_at: 't0' });
  return fakeDesignApi({ project: {
    project: { est_project_id: 42 }, design: { overrides: {}, version: 1 },
    phases: [{ phase_id: 'ph-1', name: 'Phase 1', overrides: {}, version: 1, rooms: [room('rm-1', 'Kitchen'), room('rm-2', 'Bath')] }],
  } });
}

/** One browser tab: its own store, sync and draft cache, on a shared API and presence hub. */
function tab(api, hub, { key, userName, permissions = ALL, drafts = createMemoryDraftStore(), presenceTimeout } = {}) {
  const store = cloudStore(api, permissions, TEAM_ID, {
    drafts, getPresence: async () => hub.service(), presenceKey: key, userName, userId: `user-${key}`, presenceTimeout,
  });
  const sync = setupCloudSync(store, { getDesignApi: async () => api, delay: 5, drafts, draftDelay: 5 });
  syncs.push(sync);
  return { store, sync, drafts };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('DB6a.1 presence service', () => {
  it('flattens presence state to one entry per tab key', () => {
    expect(presenceEntries({
      a: [{ userName: 'Jane', roomId: 'rm-1', phx_ref: 'x' }],
      b: [{ userName: 'Old', phx_ref: '1' }, { userName: 'Kyle', roomId: null, phx_ref: '2', phx_ref_prev: '1' }],
      c: [],
    })).toEqual([{ key: 'a', userName: 'Jane', roomId: 'rm-1' }, { key: 'b', userName: 'Kyle', roomId: null }]);
    expect(presenceEntries(undefined)).toEqual([]);
  });

  it('joins a private channel with the tab key, tracks after subscribing, and leaves cleanly', async () => {
    const calls = [];
    let subscribe = null;
    let sync = null;
    const channel = {
      on: (type, filter, fn) => { calls.push(['on', type, filter.event]); sync = fn; return channel; },
      subscribe: (fn) => { subscribe = fn; return channel; },
      track: async (payload) => { calls.push(['track', payload]); },
      untrack: async () => { calls.push(['untrack']); },
      presenceState: () => ({ k1: [{ userName: 'Me', phx_ref: 'r' }] }),
    };
    const client = {
      auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
      realtime: { setAuth: async (token) => { calls.push(['setAuth', token]); } },
      channel: (topic, options) => { calls.push(['channel', topic, options]); return channel; },
      removeChannel: async () => { calls.push(['removeChannel']); },
    };
    const seen = [];
    const handle = createPresenceService(client).join(42, { key: 'k1', onChange: (entries) => seen.push(entries) });
    await handle.track({ roomId: null });
    await vi.waitFor(() => expect(subscribe).not.toBeNull());
    await subscribe('SUBSCRIBED');
    expect(await handle.ready).toBe(true);
    sync();
    expect(seen).toEqual([[{ key: 'k1', userName: 'Me' }]]);
    await handle.track({ roomId: 'rm-1' });
    await handle.leave();
    expect(calls).toEqual([
      ['setAuth', 'jwt'],
      ['channel', presenceTopic(42), { config: { private: true, presence: { key: 'k1' } } }],
      ['on', 'presence', 'sync'],
      ['track', { roomId: null }],
      ['track', { roomId: 'rm-1' }],
      ['untrack'],
      ['removeChannel'],
    ]);
    expect(presenceTopic(42)).toBe('design-project:42');
  });

  it('a refused or failed channel resolves ready false', async () => {
    let subscribe = null;
    const channel = { on: () => channel, subscribe: (fn) => { subscribe = fn; return channel; } };
    const client = { auth: { getSession: async () => ({ data: {} }) }, channel: () => channel, removeChannel: async () => {} };
    const handle = createPresenceService(client).join(1, { key: 'k', onChange: () => {} });
    await vi.waitFor(() => expect(subscribe).not.toBeNull());
    subscribe('CHANNEL_ERROR');
    expect(await handle.ready).toBe(false);
  });
});

describe('DB6a.1 who has a room open', () => {
  it('a second tab opening a room someone is editing opens it read-only, naming them', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    const jane = tab(api, hub, { key: 'jane', userName: 'Jane' });
    const kyle = tab(api, hub, { key: 'kyle', userName: 'Kyle' });
    expect(await jane.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' })))
      .toMatchObject({ ok: true, readOnlyReason: null, openBy: [] });
    await settle();
    const reply = await kyle.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(reply).toMatchObject({ ok: true, readOnlyReason: 'others' });
    expect(reply.openBy).toEqual([expect.objectContaining({ key: 'jane', userName: 'Jane', userId: 'user-jane', roomId: 'rm-1', readOnly: false })]);
    expect(kyle.store.getState().elevation.cloud.room).toMatchObject({ readOnly: true, readOnlyReason: 'others' });
    await settle();
    // Jane sees Kyle viewing, not editing.
    expect(selectRoomEditors(jane.store.getState(), 'rm-1')).toEqual([]);
    expect(selectRoomViewers(jane.store.getState(), 'rm-1').map((entry) => entry.userName)).toEqual(['Kyle']);
  });

  it('read-only ignores edits and saves nothing; "edit anyway" makes it editable and tells the others', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    const jane = tab(api, hub, { key: 'jane', userName: 'Jane' });
    const kyle = tab(api, hub, { key: 'kyle', userName: 'Kyle' });
    await jane.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    await settle();
    await kyle.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    kyle.store.dispatch(setRoomPartNumberStart({ value: 9 }));
    expect(kyle.store.getState().elevation.rooms[0].partNumberStart).toBe(1);
    await kyle.sync.flush();
    expect(api.calls.filter(([name]) => name === 'saveRoomDocument')).toEqual([]);

    expect(await kyle.store.dispatch(editRoomAnyway())).toMatchObject({ ok: true });
    expect(kyle.store.getState().elevation.cloud.room).toMatchObject({ readOnly: false, readOnlyReason: null });
    kyle.store.dispatch(setRoomPartNumberStart({ value: 9 }));
    await kyle.sync.flush();
    expect(api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(9);
    await settle();
    expect(selectRoomEditors(jane.store.getState(), 'rm-1').map((entry) => entry.userName)).toEqual(['Kyle']);
  });

  it('a viewer doesn\'t make the next person read-only; leaving frees the room', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    const viewer = tab(api, hub, { key: 'v', userName: 'Viewer', permissions: { view: true, edit: false, manage: false } });
    const kyle = tab(api, hub, { key: 'kyle', userName: 'Kyle' });
    const jane = tab(api, hub, { key: 'jane', userName: 'Jane' });
    expect(await viewer.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ readOnlyReason: 'permission' });
    await settle();
    expect(await kyle.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ readOnlyReason: null });
    await settle();
    await kyle.store.dispatch(leaveCloudRoom());
    await settle();
    expect(await jane.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ readOnlyReason: null, openBy: [] });
  });

  it('the project page sees which rooms are open', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    const jane = tab(api, hub, { key: 'jane', userName: 'Jane' });
    const page = tab(api, hub, { key: 'page', userName: 'Kyle' });
    await jane.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-2' }));
    expect(await page.store.dispatch(joinProjectPresence(42))).toEqual({ ok: true, joined: true });
    await settle();
    const open = selectOpenRooms(page.store.getState());
    expect(Object.keys(open)).toEqual(['rm-2']);
    expect(open['rm-2'][0]).toMatchObject({ userName: 'Jane', readOnly: false });
    expect(typeof open['rm-2'][0].openedAt).toBe('string');
    expect(page.store.getState().presence).toMatchObject({ estProjectId: 42, selfKey: 'page', status: 'joined' });

    await jane.store.dispatch(leaveProjectPresence());
    await settle();
    expect(selectOpenRooms(page.store.getState())).toEqual({});
  });

  it('when presence can\'t be joined the room still opens, editable', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    hub.fail = true;
    const kyle = tab(api, hub, { key: 'kyle', userName: 'Kyle' });
    expect(await kyle.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ ok: true, readOnlyReason: null });
    expect(kyle.store.getState().presence.status).toBe('unavailable');
  });

  it('a slow presence join gives up after the timeout', async () => {
    const api = sharedApi();
    const never = { join: () => ({ ready: new Promise(() => {}), async track() {}, async leave() {} }) };
    const store = cloudStore(api, ALL, TEAM_ID, { getPresence: async () => never, presenceKey: 'k', presenceTimeout: 10 });
    expect(await store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ ok: true, readOnlyReason: null });
    expect(store.getState().presence.status).toBe('unavailable');
  });

  it('a draft waits while read-only and is offered once the user edits anyway', async () => {
    const api = sharedApi();
    const hub = fakePresenceHub();
    const drafts = createMemoryDraftStore();
    const { document } = newRoomDocument('Kitchen');
    await drafts.put({ roomId: 'rm-1', teamId: TEAM_ID, baseVersion: 5, schemaVersion: ELEVATION_SCHEMA_VERSION,
      savedAt: 'earlier', document: { ...document, id: 'rm-1', partNumberStart: 12 } });
    const jane = tab(api, hub, { key: 'jane', userName: 'Jane' });
    const kyle = tab(api, hub, { key: 'kyle', userName: 'Kyle', drafts });
    await jane.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    await settle();
    expect(await kyle.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).toMatchObject({ recovered: false, readOnlyReason: 'others' });
    expect(kyle.store.getState().elevation.rooms[0].partNumberStart).toBe(1);
    expect(await drafts.get('rm-1')).not.toBeNull();
    expect(await kyle.store.dispatch(editRoomAnyway())).toMatchObject({ ok: true, recovered: true });
    expect(kyle.store.getState().elevation.rooms[0].partNumberStart).toBe(12);
  });

  it('edit anyway is refused without permission or for an archived room', async () => {
    const api = sharedApi();
    const viewer = tab(api, fakePresenceHub(), { key: 'v', permissions: { view: true, edit: false, manage: false } });
    await viewer.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(await viewer.store.dispatch(editRoomAnyway())).toMatchObject({ ok: false, reason: 'not_allowed' });
    expect(viewer.store.getState().elevation.cloud.room.readOnly).toBe(true);
  });
});

describe('DB6a.1 read-only guard', () => {
  it('blocks every room-editing action and nothing else', () => {
    for (const type of ['addRun', 'addWall', 'setItemWidth', 'splitCell', 'setRunStyle', 'addDoorStyle', 'setPartStyle',
      'renameRoom', 'deleteRoom', 'addOpening', 'moveMissingDoorDesign', 'cloudRoomRecovered']) {
      expect(ROOM_EDIT_ACTION_TYPES.has(`elevation/${type}`)).toBe(true);
    }
    for (const type of ['setSelection', 'clearSelection', 'setView', 'setTool', 'setPref', 'setActiveWall', 'setActiveWallSide',
      'setActiveRoom', 'setSetting', 'addSectionProfile', 'updateDoorDesign', 'cloudRoomPatch', 'cloudSaveStatus', 'layersLoaded']) {
      expect(ROOM_EDIT_ACTION_TYPES.has(`elevation/${type}`)).toBe(false);
    }
  });

  it('a read-only room keeps its state through edits; views and settings still change', async () => {
    const api = sharedApi();
    const store = cloudStore(api);
    await store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    store.dispatch(cloudRoomPatch({ readOnly: true, readOnlyReason: 'version' }));
    const before = store.getState().elevation;
    store.dispatch(addRun({ wallId: 'nope' }));
    store.dispatch(setRoomPartNumberStart({ value: 3 }));
    expect(store.getState().elevation).toBe(before);
    store.dispatch(setView('elevation'));
    store.dispatch(setSelection({ runId: null }));
    store.dispatch(setSetting({ key: 'roundTo', value: 0.25 }));
    expect(store.getState().elevation.view).toBe('elevation');
    expect(store.getState().elevation.settings.roundTo).toBe(0.25);
    expect(elevationReducer(before, setRoomPartNumberStart({ value: 3 }))).toBe(before);
  });
});
