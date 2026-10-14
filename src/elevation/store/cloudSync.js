/**
 * Saves the shop workspace back to Supabase (SPEC-DB4 f). A store subscriber, like
 * localStorage persistence: after edits settle it compares each save target with what was
 * last loaded or saved and sends the changed ones, one at a time, through the RPCs.
 *
 * Targets: the shop standard ('team'), each profile and door design, and the project /
 * phase overrides. Every save sends the version it last saw; a conflict or an error pauses
 * that target (nothing is retried behind the user's back) and shows in `cloud.conflict` /
 * `cloud.error`. Reloading the shop data (a new `cloud.loadId`) starts clean.
 */
import { doorDesignToRow, isUuid, profileToRow, teamSettingsToRow } from '../model/cloudRows.js';
import { cloudSaveStatus, cloudSaved } from './elevationSlice.js';

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
  return map;
}

const LABELS = { team: 'Shop settings', project: 'Project settings', phase: 'Phase settings' };
const labelOf = (key, snap) => snap?.label ?? LABELS[key] ?? key;

export function setupCloudSync(store, { getDesignApi, delay = 800 } = {}) {
  let baseline = new Map();
  let loadId = null;
  let paused = new Map(); // key → 'conflict' | 'error'
  let timer = null;
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

  function reportPending() {
    if (elevation().source !== 'cloud') return;
    const pending = dirtyKeys().keys.length + (running ? 1 : 0);
    if (pending !== lastPending) {
      lastPending = pending;
      store.dispatch(cloudSaveStatus({ pending }));
    }
  }

  function pause(key, snap, reply) {
    paused.set(key, reply.reason === 'conflict' ? 'conflict' : 'error');
    const what = labelOf(key, snap);
    if (reply.reason === 'conflict') {
      store.dispatch(cloudSaveStatus({ conflict: {
        target: key, what, updatedByName: reply.updated_by_name ?? null, updatedAt: reply.updated_at ?? null,
      } }));
    } else {
      store.dispatch(cloudSaveStatus({ error: { target: key, what, message: reply.message ?? reply.reason } }));
    }
  }

  async function saveOne(api, key, snap, before) {
    const state = elevation();
    const { cloud } = state;
    const teamId = cloud.teamId;
    const { manage, edit } = cloud.permissions ?? {};
    const kind = snap?.kind ?? before.kind;
    const needs = kind === 'project' || kind === 'phase' ? edit : manage;
    if (!needs) {
      return { ok: false, reason: 'permission', message: 'You don\'t have permission to change this; it wasn\'t saved.' };
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
    reportPending();
    if (dirtyKeys().keys.length) schedule();
  });

  const onBeforeUnload = (event) => {
    if ((elevation().cloud?.pending ?? 0) > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  return {
    /** Send everything now; resolves `{ ok }` (false while any target is paused). */
    async flush() {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
        timer = null;
      }
      do { await run(); } while (elevation().source === 'cloud' && dirtyKeys().keys.length);
      return { ok: paused.size === 0 };
    },
    /** Un-pause targets that failed with an error (not conflicts) and try again. */
    retry() {
      for (const [key, reason] of paused) if (reason === 'error') paused.delete(key);
      store.dispatch(cloudSaveStatus({ error: null }));
      return this.flush();
    },
    stop() {
      unsubscribe();
      if (timer !== null) globalThis.clearTimeout(timer);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('beforeunload', onBeforeUnload);
      }
    },
  };
}

let active = null;

/** The app's running sync (set in src/store/index.js); components use these. */
export const cloudSync = {
  register(sync) { active = sync; },
  flush() { return active ? active.flush() : Promise.resolve({ ok: true }); },
  retry() { return active ? active.retry() : Promise.resolve({ ok: true }); },
};
