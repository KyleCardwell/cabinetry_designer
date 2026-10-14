import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRoomDocument } from '../../model/designProjects.js';
import { settingsFor } from '../slices/helpers.js';
import { setRoomPartNumberStart } from '../elevationSlice.js';
import {
  loadProjectLayers,
  openCloudWorkspace,
  allowRoomDemote,
  applyStaleRoomDraft,
  discardStaleRoomDraft,
  leaveCloudRoom,
  openCloudRoom,
  overwriteRoomConflict,
  reloadRoomAfterConflict,
} from '../cloudThunks.js';
import { cloudSync, setupCloudSync } from '../cloudSync.js';
import { ELEVATION_SCHEMA_VERSION, toRoomDocument } from '../persistence.js';
import { createMemoryDraftStore } from '../roomDrafts.js';
import { ALL, TEAM_ID, cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';

const syncs = [];
afterEach(() => {
  cloudSync.register(null);
  while (syncs.length) syncs.pop().stop();
});

function roomRow(id, name, extra = {}) {
  const { document } = newRoomDocument(name);
  return { room_id: id, phase_id: 'ph-1', name, document: { ...document, id: 'client-made-id' },
    schema_version: ELEVATION_SCHEMA_VERSION, status: 'drafting', status_at: null, version: 5,
    sort: 0, archived_at: null, last_version: null, updated_at: 't0', ...extra };
}

function roomApi(rooms = [roomRow('rm-1', 'Kitchen')]) {
  return fakeDesignApi({ project: {
    project: { est_project_id: 42 },
    design: { overrides: { roundTo: 0.25 }, version: 3 },
    phases: [{ phase_id: 'ph-1', name: 'Phase 1', overrides: { baseDepth: 25 }, version: 2, rooms }],
  } });
}

async function setup({ api = roomApi(), permissions = ALL, drafts = createMemoryDraftStore() } = {}) {
  const extra = { drafts };
  const store = cloudStore(api, permissions, TEAM_ID, extra);
  const sync = setupCloudSync(store, { getDesignApi: async () => api, delay: 5, drafts, draftDelay: 5 });
  cloudSync.register(sync);
  syncs.push(sync);
  return { api, store, sync, drafts };
}

async function open(ctx, roomId = 'rm-1') {
  const reply = await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId }));
  ctx.api.calls.length = 0;
  return reply;
}

const roomSaves = (api) => api.calls.filter(([name]) => name === 'saveRoomDocument');
const editPart = (store, value) => store.dispatch(setRoomPartNumberStart({ value }));
const elevationOf = (store) => store.getState().elevation;
const draftOf = (drafts, id = 'rm-1') => drafts.get(id);
const draftWritten = (drafts) => vi.waitFor(async () => expect(await draftOf(drafts)).not.toBeNull());

describe('DB6a opening a room', () => {
  it('loads one room with the shop settings, library and its project / phase overrides', async () => {
    const ctx = await setup();
    const reply = await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(reply).toEqual({ ok: true, recovered: false, staleDraft: null });
    const elevation = elevationOf(ctx.store);
    expect(elevation.source).toBe('cloud');
    expect(elevation.rooms).toHaveLength(1);
    expect(elevation.activeRoomId).toBe('rm-1');
    expect(elevation.rooms[0].id).toBe('rm-1');
    expect(elevation.layers).toEqual({
      project: { id: 42, values: { roundTo: 0.25 } },
      phase: { id: 'ph-1', values: { baseDepth: 25 } },
    });
    expect(elevation.cloud.layerVersions).toEqual({ project: 3, phase: 2 });
    expect(elevation.cloud.room).toMatchObject({
      id: 'rm-1', phaseId: 'ph-1', estProjectId: 42, version: 5, status: 'drafting', archived: false,
      recovered: false, staleDraft: null, demote: false,
    });
    const settings = settingsFor(elevation, elevation.rooms[0]);
    expect([settings.roundTo, settings.baseDepth]).toEqual([0.25, 25]);
  });

  it('the row name wins over the document name, and opening saves nothing', async () => {
    const row = roomRow('rm-1', 'Kitchen');
    row.document.name = 'Old name';
    const ctx = await setup({ api: roomApi([row]) });
    await open(ctx);
    expect(elevationOf(ctx.store).rooms[0].name).toBe('Kitchen');
    expect((await ctx.sync.flush()).ok).toBe(true);
    expect(roomSaves(ctx.api)).toEqual([]);
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('fails readably for an unknown project, a room outside it, a bad document and a newer schema', async () => {
    const ctx = await setup();
    ctx.api.db.project = null;
    expect((await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).reason).toBe('not_found');

    const ctx2 = await setup();
    expect((await ctx2.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'nope' }))).reason).toBe('not_found');

    const broken = roomRow('rm-1', 'Kitchen');
    broken.document = { id: 'x', name: 5 };
    const ctx3 = await setup({ api: roomApi([broken]) });
    expect((await ctx3.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }))).reason).toBe('bad_document');

    const newer = roomRow('rm-1', 'Kitchen', { schema_version: ELEVATION_SCHEMA_VERSION + 1 });
    const ctx4 = await setup({ api: roomApi([newer]) });
    const reply = await ctx4.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(reply).toMatchObject({ ok: false, reason: 'schema' });
    expect(reply.message).toMatch(/newer version/);
    expect(elevationOf(ctx4.store).rooms).toEqual([]);
  });

  it('opens an archived room and reports it', async () => {
    const ctx = await setup({ api: roomApi([roomRow('rm-1', 'Kitchen', { archived_at: 't' })]) });
    expect((await open(ctx))).toMatchObject({ ok: true });
    expect(elevationOf(ctx.store).cloud.room.archived).toBe(true);
  });
});

describe('DB6a saving a room', () => {
  it('saves an edit against the loaded version and moves on to the next version', async () => {
    const ctx = await setup();
    await open(ctx);
    editPart(ctx.store, 7);
    await ctx.sync.flush();
    expect(roomSaves(ctx.api)).toEqual([['saveRoomDocument', 'rm-1', 5, false]]);
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(7);
    expect(ctx.api.db.project.phases[0].rooms[0].document.id).toBe('rm-1');
    expect(elevationOf(ctx.store).cloud.room.version).toBe(6);
    expect(elevationOf(ctx.store).cloud.pending).toBe(0);
    editPart(ctx.store, 8);
    await ctx.sync.flush();
    expect(roomSaves(ctx.api).at(-1)).toEqual(['saveRoomDocument', 'rm-1', 6, false]);
  });

  it('sends the document the way localStorage stores a room', async () => {
    const ctx = await setup();
    await open(ctx);
    editPart(ctx.store, 3);
    await ctx.sync.flush();
    const sent = ctx.api.db.project.phases[0].rooms[0].document;
    expect(sent).toEqual(JSON.parse(JSON.stringify(toRoomDocument(elevationOf(ctx.store).rooms[0]))));
  });

  it('keeps a draft copy while the save is out, and removes it once the server confirms', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.hold();
    editPart(ctx.store, 9);
    await vi.waitFor(async () => expect(await draftOf(ctx.drafts)).not.toBeNull());
    const draft = await draftOf(ctx.drafts);
    expect(draft).toMatchObject({ roomId: 'rm-1', teamId: TEAM_ID, baseVersion: 5, schemaVersion: ELEVATION_SCHEMA_VERSION });
    expect(draft.document.partNumberStart).toBe(9);
    ctx.api.release();
    await ctx.sync.flush();
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('an edit made while a save is out is saved next, and the draft ends up cleared', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.hold();
    editPart(ctx.store, 2);
    const flushing = ctx.sync.flush();
    await vi.waitFor(() => expect(roomSaves(ctx.api)).toHaveLength(1));
    editPart(ctx.store, 3);
    ctx.api.release();
    await flushing;
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(3);
    expect(roomSaves(ctx.api).map((call) => call[2])).toEqual([5, 6]);
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('a conflict pauses the room and keeps the draft; "keep mine" saves over the newer version', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.db.project.phases[0].rooms[0].version = 6; // someone else saved
    editPart(ctx.store, 4);
    expect((await ctx.sync.flush()).ok).toBe(false);
    const elevation = elevationOf(ctx.store);
    expect(elevation.cloud.conflict).toMatchObject({ target: 'room', what: 'Room', updatedByName: 'Other' });
    expect(elevation.cloud.room.conflictVersion).toBe(6);
    await draftWritten(ctx.drafts);
    expect(roomSaves(ctx.api)).toHaveLength(1);

    expect((await ctx.store.dispatch(overwriteRoomConflict())).ok).toBe(true);
    expect(roomSaves(ctx.api).at(-1)).toEqual(['saveRoomDocument', 'rm-1', 6, false]);
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(4);
    expect(elevationOf(ctx.store).cloud.conflict).toBeNull();
    expect(elevationOf(ctx.store).cloud.room.version).toBe(7);
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('"use theirs" drops this browser\'s edits and its draft', async () => {
    const ctx = await setup();
    await open(ctx);
    const room = ctx.api.db.project.phases[0].rooms[0];
    room.version = 6;
    room.document = { ...room.document, partNumberStart: 11 };
    editPart(ctx.store, 4);
    await ctx.sync.flush();
    const reply = await ctx.store.dispatch(reloadRoomAfterConflict());
    expect(reply).toEqual({ ok: true, recovered: false, staleDraft: null });
    const elevation = elevationOf(ctx.store);
    expect(elevation.rooms[0].partNumberStart).toBe(11);
    expect(elevation.cloud.room.version).toBe(6);
    expect(elevation.cloud.conflict).toBeNull();
    expect(await draftOf(ctx.drafts)).toBeNull();
    expect((await ctx.sync.flush()).ok).toBe(true);
    expect(roomSaves(ctx.api).filter(([, , , demote]) => demote === false)).toHaveLength(1); // only the conflicted attempt
  });

  it('an Approved room waits for the user, then a demoting save drops it to Drafting', async () => {
    const ctx = await setup({ api: roomApi([roomRow('rm-1', 'Kitchen', { status: 'approved' })]) });
    await open(ctx);
    expect(elevationOf(ctx.store).cloud.room.status).toBe('approved');
    editPart(ctx.store, 5);
    expect((await ctx.sync.flush()).ok).toBe(false);
    let elevation = elevationOf(ctx.store);
    expect(elevation.cloud.statusBlock).toMatchObject({ target: 'room', status: 'approved', byName: 'Other' });
    expect(ctx.api.db.project.phases[0].rooms[0].version).toBe(5);
    await draftWritten(ctx.drafts);

    expect((await ctx.store.dispatch(allowRoomDemote())).ok).toBe(true);
    expect(roomSaves(ctx.api).at(-1)).toEqual(['saveRoomDocument', 'rm-1', 5, true]);
    elevation = elevationOf(ctx.store);
    expect(elevation.cloud.statusBlock).toBeNull();
    expect(elevation.cloud.room).toMatchObject({ status: 'drafting', version: 6, demote: false });
    expect(ctx.api.db.project.phases[0].rooms[0].status).toBe('drafting');
    expect(await draftOf(ctx.drafts)).toBeNull();
    editPart(ctx.store, 6);
    await ctx.sync.flush();
    expect(roomSaves(ctx.api).at(-1)).toEqual(['saveRoomDocument', 'rm-1', 6, false]);
  });

  it('an archived room can\'t be saved; restoring it and retrying does', async () => {
    const ctx = await setup({ api: roomApi([roomRow('rm-1', 'Kitchen', { archived_at: 't' })]) });
    await open(ctx);
    editPart(ctx.store, 5);
    expect((await ctx.sync.flush()).ok).toBe(false);
    expect(elevationOf(ctx.store).cloud.error.message).toMatch(/archived/);
    await draftWritten(ctx.drafts);
    ctx.api.db.project.phases[0].rooms[0].archived_at = null;
    expect((await ctx.sync.retry()).ok).toBe(true);
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(5);
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('a dropped connection pauses with the draft kept, and retry sends it', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.failNext = { ok: false, reason: 'network', message: 'Failed to fetch' };
    editPart(ctx.store, 5);
    expect((await ctx.sync.flush()).ok).toBe(false);
    expect(elevationOf(ctx.store).cloud.error).toEqual({ target: 'room', what: 'Room', message: 'Failed to fetch' });
    await draftWritten(ctx.drafts);
    expect((await ctx.sync.retry()).ok).toBe(true);
    expect(elevationOf(ctx.store).cloud.error).toBeNull();
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('without edit permission nothing is sent', async () => {
    const ctx = await setup({ permissions: { view: true, edit: false, manage: false } });
    await open(ctx);
    editPart(ctx.store, 5);
    expect((await ctx.sync.flush()).ok).toBe(false);
    expect(roomSaves(ctx.api)).toEqual([]);
    expect(elevationOf(ctx.store).cloud.error.message).toMatch(/permission/);
  });

  it('leaving the room writes the draft copy and sends what it can', async () => {
    const ctx = await setup();
    await open(ctx);
    editPart(ctx.store, 5);
    expect((await ctx.store.dispatch(leaveCloudRoom())).ok).toBe(true);
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(5);
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('opening another room first saves the one that is open', async () => {
    const ctx = await setup({ api: roomApi([roomRow('rm-1', 'Kitchen'), roomRow('rm-2', 'Bath')]) });
    await open(ctx);
    editPart(ctx.store, 5);
    const reply = await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-2' }));
    expect(reply.ok).toBe(true);
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(5);
    expect(elevationOf(ctx.store).activeRoomId).toBe('rm-2');
    expect(elevationOf(ctx.store).rooms).toHaveLength(1);
    expect(elevationOf(ctx.store).cloud.room.version).toBe(5);
  });
});

describe('DB6a draft recovery', () => {
  const seedDraft = async (drafts, patch = {}, edit = (document) => ({ ...document, partNumberStart: 12 })) => {
    const { document } = newRoomDocument('Kitchen');
    await drafts.put({ roomId: 'rm-1', teamId: TEAM_ID, baseVersion: 5, schemaVersion: ELEVATION_SCHEMA_VERSION,
      savedAt: 'earlier', document: edit({ ...document, id: 'rm-1' }), ...patch });
  };

  it('puts back an unsaved draft that started from the current version, and saves it', async () => {
    const drafts = createMemoryDraftStore();
    await seedDraft(drafts);
    const ctx = await setup({ drafts });
    const reply = await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(reply).toEqual({ ok: true, recovered: true, staleDraft: null });
    expect(elevationOf(ctx.store).rooms[0].partNumberStart).toBe(12);
    expect(elevationOf(ctx.store).cloud.room).toMatchObject({ recovered: true, recoveredAt: 'earlier' });
    await ctx.sync.flush();
    expect(ctx.api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(12);
    expect(await draftOf(drafts)).toBeNull();
  });

  it('a draft identical to the saved room is just removed', async () => {
    const drafts = createMemoryDraftStore();
    await seedDraft(drafts, {}, (document) => document);
    const ctx = await setup({ drafts });
    expect(await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' })))
      .toEqual({ ok: true, recovered: false, staleDraft: null });
    expect(elevationOf(ctx.store).cloud.room.recovered).toBe(false);
    expect(await draftOf(drafts)).toBeNull();
  });

  it('a draft older than the saved room waits for a choice; the room opens as saved', async () => {
    const drafts = createMemoryDraftStore();
    await seedDraft(drafts, { baseVersion: 4 });
    const ctx = await setup({ drafts });
    const reply = await ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    expect(reply).toEqual({ ok: true, recovered: false, staleDraft: { savedAt: 'earlier', baseVersion: 4 } });
    expect(elevationOf(ctx.store).rooms[0].partNumberStart).toBe(1);
    expect(elevationOf(ctx.store).cloud.room.staleDraft).toEqual({ savedAt: 'earlier', baseVersion: 4 });
    expect(await draftOf(drafts)).not.toBeNull();

    // Using it saves it over the room as the server has it.
    expect((await ctx.store.dispatch(applyStaleRoomDraft())).ok).toBe(true);
    expect(elevationOf(ctx.store).rooms[0].partNumberStart).toBe(12);
    expect(elevationOf(ctx.store).cloud.room.staleDraft).toBeNull();
    await ctx.sync.flush();
    expect(roomSaves(ctx.api)).toEqual([['saveRoomDocument', 'rm-1', 5, false]]);
    expect(await draftOf(drafts)).toBeNull();
  });

  it('discarding a waiting draft removes it', async () => {
    const drafts = createMemoryDraftStore();
    await seedDraft(drafts, { baseVersion: 3 });
    const ctx = await setup({ drafts });
    await open(ctx);
    expect((await ctx.store.dispatch(discardStaleRoomDraft())).ok).toBe(true);
    expect(elevationOf(ctx.store).cloud.room.staleDraft).toBeNull();
    expect(await draftOf(drafts)).toBeNull();
    expect(elevationOf(ctx.store).rooms[0].partNumberStart).toBe(1);
  });

  it('does not touch the draft cache while a waiting draft is undecided', async () => {
    const drafts = createMemoryDraftStore();
    await seedDraft(drafts, { baseVersion: 4 });
    const ctx = await setup({ drafts });
    await open(ctx);
    editPart(ctx.store, 20);
    await ctx.sync.flush();
    expect((await draftOf(drafts)).document.partNumberStart).toBe(12);
  });

  it('removes an unreadable draft and one from another team; a view-only user keeps theirs', async () => {
    const drafts = createMemoryDraftStore();
    await drafts.put({ roomId: 'rm-1', teamId: TEAM_ID, baseVersion: 5, schemaVersion: ELEVATION_SCHEMA_VERSION, document: { nope: 1 } });
    await open(await setup({ drafts }));
    expect(await draftOf(drafts)).toBeNull();

    await seedDraft(drafts, { teamId: 'other-team' });
    await open(await setup({ drafts }));
    expect(await draftOf(drafts)).toBeNull();

    await seedDraft(drafts);
    const viewer = await setup({ drafts, permissions: { view: true, edit: false, manage: false } });
    expect((await open(viewer))).toMatchObject({ ok: true });
    expect(elevationOf(viewer.store).rooms[0].partNumberStart).toBe(1);
    expect(await draftOf(drafts)).not.toBeNull();
  });

describe('DB6a review fixes', () => {
  it('a slow reply for a room the user already left is dropped', async () => {
    const ctx = await setup({ api: roomApi([roomRow('rm-1', 'Kitchen'), roomRow('rm-2', 'Bath')]) });
    await ctx.store.dispatch(openCloudWorkspace());
    ctx.api.hold();
    const first = ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
    await vi.waitFor(() => expect(ctx.api.calls.some(([name]) => name === 'getRoom')).toBe(true));
    const second = ctx.store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-2' }));
    ctx.api.release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.reason).toBe('superseded');
    expect(b.ok).toBe(true);
    expect(elevationOf(ctx.store).activeRoomId).toBe('rm-2');
  });

  it('"use theirs" never offers the dropped edits back as a waiting draft', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.db.project.phases[0].rooms[0].version = 6;
    editPart(ctx.store, 4);
    await ctx.sync.flush();
    await draftWritten(ctx.drafts);
    const reply = await ctx.store.dispatch(reloadRoomAfterConflict());
    expect(reply.staleDraft).toBeNull();
    expect(elevationOf(ctx.store).cloud.room.staleDraft).toBeNull();
    expect(await draftOf(ctx.drafts)).toBeNull();
  });

  it('flush writes the draft copy first, so a paused room never leaves edits only in memory', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.db.project.phases[0].rooms[0].version = 6;
    editPart(ctx.store, 4);
    await ctx.sync.flush();
    expect((await draftOf(ctx.drafts)).document.partNumberStart).toBe(4);
  });

  it('loading project-page layers closes the open room; its edits stay in the draft cache', async () => {
    const ctx = await setup();
    await open(ctx);
    ctx.api.db.project.phases[0].rooms[0].version = 6;
    editPart(ctx.store, 4);
    await ctx.sync.flush();
    await ctx.store.dispatch(loadProjectLayers({ estProjectId: 42 }));
    const elevation = elevationOf(ctx.store);
    expect(elevation.rooms).toEqual([]);
    expect(elevation.cloud.room).toBeNull();
    expect(elevation.cloud.conflict).toBeNull();
    expect((await draftOf(ctx.drafts)).document.partNumberStart).toBe(4);
  });

  it('keeps the workspace load notes when the room opens', async () => {
    const api = roomApi();
    api.db.profiles.push({ profile_id: 'bad', kind: 'nope', name: 'x', data: {}, version: 1 });
    const ctx = await setup({ api });
    await open(ctx);
    expect(elevationOf(ctx.store).message).toMatch(/profile/);
  });
});

describe('DB6a save timing', () => {
  it('waits 15 s of quiet by default, and a hidden tab sends at once', async () => {
    vi.useFakeTimers();
    const listeners = {};
    vi.stubGlobal('window', { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: () => {} });
    try {
      const api = roomApi();
      const drafts = createMemoryDraftStore();
      const store = cloudStore(api, ALL, TEAM_ID, { drafts });
      const sync = setupCloudSync(store, { getDesignApi: async () => api, drafts });
      syncs.push(sync);
      await store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
      editPart(store, 7);
      await vi.advanceTimersByTimeAsync(14000);
      expect(roomSaves(api)).toEqual([]);
      editPart(store, 8); // another edit restarts the wait
      await vi.advanceTimersByTimeAsync(14000);
      expect(roomSaves(api)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(roomSaves(api)).toHaveLength(1);

      editPart(store, 9);
      listeners.pagehide();
      await vi.advanceTimersByTimeAsync(0);
      expect(roomSaves(api)).toHaveLength(2);
      expect(api.db.project.phases[0].rooms[0].document.partNumberStart).toBe(9);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
});
