/**
 * Saves the shop workspace back to Supabase (SPEC-DB4 f). A store subscriber, like
 * localStorage persistence: once edits have been quiet for `delay` (15 s, Kyle 2026-10-14)
 * it compares each save target with what was last loaded or saved and sends the changed
 * ones, one at a time, through the RPCs. Leaving (`flush`, the tab hidden or closed) sends
 * at once; the local draft copy covers the gap in between.
 *
 * Targets: the shop standard ('team'), each profile and door design, the project / phase
 * overrides, and the open room's drawing ('room', SPEC-DB6a). Every save sends the version it
 * last saw; a conflict or an error pauses that target (nothing is retried behind the user's
 * back, except a dropped connection when the browser comes back online) and shows in
 * `cloud.conflict` / `cloud.error`. Saving an Approved or Released room pauses on
 * `cloud.statusBlock` until the user agrees to drop it to Drafting. Reloading the shop data
 * or opening a room (a new `cloud.loadId`) starts clean.
 *
 * With a draft store (`drafts`, roomDrafts.js) the room's unsaved edits are also copied to
 * IndexedDB a moment after each edit and removed once the server confirms them.
 */
import { doorDesignToRow, isUuid, profileToRow, teamSettingsToRow } from '../model/cloudRows.js';
import { cloudRoomPatch, cloudSaveStatus, cloudSaved } from './elevationSlice.js';
import { ELEVATION_SCHEMA_VERSION, toRoomDocument } from './persistence.js';

const roomJsonCache = new WeakMap();

/** The room as sent to the server, as a string. Cached per room object: most edits leave it alone. */
function roomJson(room) {
  let json = roomJsonCache.get(room);
  if (json === undefined) {
    json = JSON.stringify(toRoomDocument(room));
    roomJsonCache.set(room, json);
  }
  return json;
}

function snapshotsOf(elevation) {
  const map = new Map();
  if (elevation.source !== 'cloud' || !elevation.cloud) return map;
  const { settings, layers } = elevation;
  map.set('team', { kind: 'team', json: JSON.stringify(teamSettingsToRow(settings)) });
  for (const profile of settings.sectionProfiles ?? []) {
    const row = profileToRow(profile);
    map.set(`profile:${profile.id}`, {
      kind: 'profile', id: profile.id, label: `Profile "${profile.name}"`,
      row, archived: Boolean(profile.archived), json: JSON.stringify([row, Boolean(profile.archived)]),
    });
  }
  for (const design of settings.doorDesigns ?? []) {
    const row = doorDesignToRow(design);
    map.set(`doorDesign:${design.id}`, {
      kind: 'doorDesign', id: design.id, label: `Door design "${design.code}"`, row, json: JSON.stringify(row),
    });
  }
  for (const level of ['project', 'phase']) {
    const layer = layers?.[level];
    if (layer) map.set(level, { kind: level, id: layer.id, values: layer.values, json: JSON.stringify(layer.values) });
  }
  const info = elevation.cloud.room;
  const room = info ? elevation.rooms.find((entry) => entry.id === info.id) : null;
  if (room) map.set('room', { kind: 'room', id: info.id, label: 'Room', json: roomJson(room) });
  return map;
}

const LABELS = { team: 'Shop settings', project: 'Project settings', phase: 'Phase settings', room: 'Room' };
const labelOf = (key, snap) => snap?.label ?? LABELS[key] ?? key;

export function setupCloudSync(store, { getDesignApi, delay = 15000, drafts = null, draftDelay = 250 } = {}) {
  let baseline = new Map();
  let loadId = null;
  let paused = new Map(); // key → 'conflict' | 'status' | 'network' | 'error'
  let timer = null;
  let draftTimer = null;
  let draftQueue = Promise.resolve();
  let running = null;
  let lastPending = null;

  const elevation = () => store.getState().elevation;

  function resetIfReloaded() {
    const current = elevation();
    const id = current.source === 'cloud' ? current.cloud?.loadId ?? null : null;
    if (id === loadId) return;
    loadId = id;
    baseline = snapshotsOf(current);
    paused = new Map();
    lastPending = null;
  }

  /** Changed targets that aren't paused: present-and-different, plus removed library items. */
  function dirtyKeys() {
    const current = snapshotsOf(elevation());
    const keys = [];
    for (const [key, snap] of current) {
      if (!paused.has(key) && baseline.get(key)?.json !== snap.json) keys.push(key);
    }
    for (const [key, snap] of baseline) {
      if (!current.has(key) && !paused.has(key) && (snap.kind === 'profile' || snap.kind === 'doorDesign')
        && !(snap.kind === 'profile' && snap.archived)) keys.push(key);
    }
    return { keys, current };
  }

  function reportPending(dirtyCount = null) {
    if (elevation().source !== 'cloud') return;
    const pending = (dirtyCount ?? dirtyKeys().keys.length) + (running ? 1 : 0);
    if (pending !== lastPending) {
      lastPending = pending;
      store.dispatch(cloudSaveStatus({ pending }));
    }
  }

  function pause(key, snap, reply) {
    const what = labelOf(key, snap);
    if (reply.reason === 'conflict') {
      paused.set(key, 'conflict');
      if (key === 'room') store.dispatch(cloudRoomPatch({ conflictVersion: reply.version ?? null }));
      store.dispatch(cloudSaveStatus({ conflict: {
        target: key, what, updatedByName: reply.updated_by_name ?? null, updatedAt: reply.updated_at ?? null,
      } }));
    } else if (reply.reason === 'status') {
      // Approved / Released room: wait for the user to agree to drop it to Drafting.
      paused.set(key, 'status');
      store.dispatch(cloudRoomPatch({
        status: reply.status, statusAt: reply.status_at ?? null, statusByName: reply.status_by_name ?? null,
      }));
      store.dispatch(cloudSaveStatus({ statusBlock: {
        target: key, what, status: reply.status, byName: reply.status_by_name ?? null, at: reply.status_at ?? null,
      } }));
    } else {
      paused.set(key, reply.reason === 'network' ? 'network' : 'error');
      let message = reply.message ?? reply.reason;
      if (reply.reason === 'archived') {
        message = 'This room is archived, so changes can\'t be saved. Restore it on the project page, then retry.';
        store.dispatch(cloudRoomPatch({ archived: true }));
      }
      store.dispatch(cloudSaveStatus({ error: { target: key, what, message } }));
    }
  }

  function clearNotice(key) {
    const { conflict, error, statusBlock } = elevation().cloud ?? {};
    if (conflict?.target === key) store.dispatch(cloudSaveStatus({ conflict: null }));
    if (error?.target === key) store.dispatch(cloudSaveStatus({ error: null }));
    if (statusBlock?.target === key) store.dispatch(cloudSaveStatus({ statusBlock: null }));
  }

  /** Mirror the open room's unsaved edits into the draft store (or remove the copy once nothing is unsaved). */
  function refreshDraft() {
    if (!drafts) return draftQueue;
    const state = elevation();
    const info = state.cloud?.room;
    if (state.source !== 'cloud' || !info || info.staleDraft) return draftQueue; // a pending choice keeps its copy
    const snap = snapshotsOf(state).get('room');
    if (!snap) return draftQueue;
    const roomId = info.id;
    const dirty = baseline.get('room')?.json !== snap.json;
    const record = dirty ? {
      roomId, teamId: state.cloud.teamId, baseVersion: info.version, document: JSON.parse(snap.json),
      schemaVersion: ELEVATION_SCHEMA_VERSION, savedAt: new Date().toISOString(),
    } : null;
    draftQueue = draftQueue
      .then(() => (record ? drafts.put(record) : drafts.delete(roomId)))
      .catch(() => {});
    return draftQueue;
  }

  function scheduleDraft() {
    if (!drafts) return;
    if (draftTimer !== null) globalThis.clearTimeout(draftTimer);
    draftTimer = globalThis.setTimeout(() => {
      draftTimer = null;
      refreshDraft();
    }, draftDelay);
  }

  async function saveOne(api, key, snap, before) {
    const state = elevation();
    const { cloud } = state;
    const teamId = cloud.teamId;
    const { manage, edit } = cloud.permissions ?? {};
    const kind = snap?.kind ?? before.kind;
    const needs = kind === 'project' || kind === 'phase' || kind === 'room' ? edit : manage;
    if (!needs) {
      return { ok: false, reason: 'permission', message: 'You don\'t have permission to change this; it wasn\'t saved.' };
    }

    if (kind === 'room') {
      const info = cloud.room;
      const reply = await api.saveRoomDocument({
        roomId: info.id, document: JSON.parse(snap.json), schemaVersion: ELEVATION_SCHEMA_VERSION,
        expectedVersion: info.version, demote: Boolean(info.demote),
      });
      return reply.ok
        ? { ...reply, saved: { target: 'room', version: reply.version, status: reply.status, updatedAt: reply.updated_at } }
        : reply;
    }
    if (kind === 'team') {
      const reply = await api.saveTeamSettings(teamId, JSON.parse(snap.json), cloud.teamVersion);
      return reply.ok ? { ...reply, saved: { target: 'team', version: reply.version } } : reply;
    }
    if (kind === 'project' || kind === 'phase') {
      const expected = cloud.layerVersions[kind];
      const reply = kind === 'project'
        ? await api.saveProjectOverrides(snap.id, snap.values, expected)
        : await api.savePhaseOverrides(snap.id, snap.values, expected);
      return reply.ok ? { ...reply, saved: { target: kind, version: reply.version } } : reply;
    }

    if (kind === 'profile') {
      const known = cloud.rows.profiles[before?.id ?? snap.id];
      if (!snap) {
        // Removed from the list (deleted): archive the row instead (never deleted, DB8).
        return known ? api.archiveLibraryItem('profile', known.rowId, true) : { ok: true };
      }
      if (!isUuid(snap.id)) {
        return { ok: false, reason: 'bad_input', message: 'This profile has an old-style id; copy it to save it to the shop library.' };
      }
      let saved = null;
      const rowChanged = !known || JSON.stringify(before?.row) !== JSON.stringify(snap.row);
      if (rowChanged) {
        const reply = await api.saveProfile({
          teamId, profileId: known?.rowId ?? snap.id, kind: snap.row.kind, name: snap.row.name,
          data: snap.row.data, expectedVersion: known?.version ?? 0,
        });
        if (!reply.ok) return reply;
        saved = { target: 'profile', id: snap.id, rowId: reply.profile_id, version: reply.version };
        store.dispatch(cloudSaved(saved));
      }
      const wasArchived = known ? Boolean(before?.archived) : false;
      if (snap.archived !== wasArchived) {
        const rowId = saved?.rowId ?? known.rowId;
        const reply = await api.archiveLibraryItem('profile', rowId, snap.archived);
        if (!reply.ok) return reply;
      }
      return { ok: true };
    }

    // Door design
    const known = cloud.rows.doorDesigns[before?.id ?? snap.id];
    if (!snap) return known ? api.archiveLibraryItem('door_design', known.rowId, true) : { ok: true };
    const reply = await api.saveDoorDesign({
      teamId, designId: known?.rowId ?? (isUuid(snap.id) ? snap.id : null),
      code: snap.row.code, data: snap.row.data, expectedVersion: known?.version ?? 0,
    });
    return reply.ok ? { ...reply, saved: { target: 'doorDesign', id: snap.id, rowId: reply.design_id, version: reply.version } } : reply;
  }

  async function drain() {
    const api = await getDesignApi();
    for (;;) {
      resetIfReloaded();
      if (elevation().source !== 'cloud') return;
      const { keys, current } = dirtyKeys();
      if (!keys.length) return;
      const key = keys[0];
      const snap = current.get(key) ?? null;
      const before = baseline.get(key) ?? null;
      const sentFor = loadId;
      const reply = await saveOne(api, key, snap, before);
      if (sentFor !== loadId || elevation().cloud?.loadId !== sentFor) continue; // reloaded meanwhile
      if (!reply.ok) {
        pause(key, snap ?? before, reply);
        continue;
      }
      if (reply.saved) store.dispatch(cloudSaved(reply.saved));
      if (snap) baseline.set(key, snap);
      else baseline.delete(key);
      if (key === 'room') await refreshDraft();
    }
  }

  function run() {
    if (!running) {
      running = drain().finally(() => {
        running = null;
        reportPending();
      });
      reportPending();
    }
    return running;
  }

  function schedule() {
    if (timer !== null) globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      timer = null;
      run();
    }, delay);
  }

  let previous = elevation();
  const unsubscribe = store.subscribe(() => {
    const current = elevation();
    if (current === previous) return;
    previous = current;
    resetIfReloaded();
    if (current.source !== 'cloud') return;
    // One snapshot pass per change (it stringifies the settings and library).
    const { keys, current: snaps } = dirtyKeys();
    reportPending(keys.length);
    if (keys.length) schedule();
    if (drafts && snaps.has('room') && baseline.get('room')?.json !== snaps.get('room').json) scheduleDraft();
  });

  // Leaving: copy the draft and send what's waiting now rather than after the quiet period.
  const sendNow = () => {
    if (elevation().source !== 'cloud') return;
    if (timer !== null) {
      globalThis.clearTimeout(timer);
      timer = null;
    }
    if (dirtyKeys().keys.length) run();
  };
  const onLeave = () => {
    refreshDraft();
    sendNow();
  };
  const onVisibility = () => {
    if (globalThis.document?.visibilityState === 'hidden') onLeave();
  };
  const onOnline = () => {
    if ([...paused.values()].includes('network')) retryNow();
  };

  const onBeforeUnload = (event) => {
    if ((elevation().cloud?.pending ?? 0) > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onLeave);
    globalThis.document?.addEventListener?.('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
  }

  function retryNow() { return controller.retry(); }

  const controller = {
    /** Copy the room's draft and send everything now; resolves `{ ok }` (false while any target is paused). */
    async flush() {
      await this.saveDraftNow();
      if (timer !== null) {
        globalThis.clearTimeout(timer);
        timer = null;
      }
      do { await run(); } while (elevation().source === 'cloud' && dirtyKeys().keys.length);
      return { ok: paused.size === 0 };
    },
    /** Un-pause targets that failed with an error or a dropped connection (not conflicts) and try again. */
    retry() {
      for (const [key, reason] of paused) if (reason === 'error' || reason === 'network') paused.delete(key);
      store.dispatch(cloudSaveStatus({ error: null }));
      return this.flush();
    },
    /** The user settled a conflict or status warning for `key` (the thunk adjusted the version / demote first): try again. */
    resume(key) {
      paused.delete(key);
      clearNotice(key);
      return this.flush();
    },
    /** Write the open room's draft copy now (a thunk calls this before it switches rooms). */
    saveDraftNow() {
      if (draftTimer !== null) {
        globalThis.clearTimeout(draftTimer);
        draftTimer = null;
      }
      return refreshDraft();
    },
    stop() {
      unsubscribe();
      if (timer !== null) globalThis.clearTimeout(timer);
      if (draftTimer !== null) globalThis.clearTimeout(draftTimer);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('beforeunload', onBeforeUnload);
        window.removeEventListener('pagehide', onLeave);
        globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
      }
    },
  };
  return controller;
}

let active = null;

/** The app's running sync (set in src/store/index.js); components use these. */
export const cloudSync = {
  register(sync) { active = sync; },
  flush() { return active ? active.flush() : Promise.resolve({ ok: true }); },
  retry() { return active ? active.retry() : Promise.resolve({ ok: true }); },
  resume(key) { return active ? active.resume(key) : Promise.resolve({ ok: true }); },
  saveDraftNow() { return active ? active.saveDraftNow() : Promise.resolve(); },
};
