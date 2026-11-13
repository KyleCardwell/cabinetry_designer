import { current } from '@reduxjs/toolkit';
import { allowedAt, registryEntry } from '../../model/settingsRegistry.js';
import { isValidSettingValue, withOverride } from '../../model/settingsResolve.js';
import { syncRoomAt } from './helpers.js';

const LAYER_LEVELS = ['project', 'phase'];

// Set by elevationSlice.js (it owns createInitialElevationState; importing it here would be circular).
let buildInitialState = null;
export function registerInitialStateBuilder(builder) {
  buildInitialState = builder;
}

function layerFrom(layer) {
  return layer ? { id: layer.id, values: layer.values ?? {} } : null;
}

export const cloudReducers = {
  /** Set or clear one project/phase override (`value` null/undefined = inherit). */
  setLayerSetting(state, action) {
    const { level, key, value } = action.payload;
    const layer = LAYER_LEVELS.includes(level) ? state.layers?.[level] : null;
    if (!layer || !registryEntry(key) || !allowedAt(key, level)) return;
    const clearing = value === null || value === undefined;
    if (!clearing && !isValidSettingValue(key, value)) return;
    layer.values = withOverride(layer.values, key, clearing ? null : value);
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },

  /** Back to this browser's sandbox document (payload: the stored document or null). */
  localWorkspaceLoaded(state, action) {
    return { ...buildInitialState(action.payload ?? null), clipboard: state.clipboard ?? null };
  },

  cloudWorkspaceLoading(state) {
    state.workspace = { loading: true, error: null };
  },

  cloudWorkspaceFailed(state, action) {
    state.workspace = { loading: false, error: action.payload };
  },

  /**
   * The team's shop standard and library, loaded (payload from openCloudWorkspace).
   * No rooms yet: the room route (D6) loads one.
   */
  cloudWorkspaceLoaded(state, action) {
    const { teamId, permissions, settings, teamVersion, rows, teamServices = [], message = null } = action.payload;
    const next = buildInitialState({
      settings, rooms: [], activeRoomId: null, activeWallId: null, view: 'plan',
    });
    return {
      ...next,
      clipboard: state.clipboard ?? null,
      source: 'cloud',
      teamServices,
      cloud: {
        teamId,
        permissions,
        loadId: (state.cloud?.loadId ?? 0) + 1,
        teamVersion,
        rows,
        layerVersions: { project: null, phase: null },
        room: null,
        project: null,
        pending: 0,
        conflict: null,
        error: null,
        statusBlock: null,
      },
      message,
    };
  },

  /** Project (and optionally phase) overrides, each `{ id, values, version }`. */
  layersLoaded(state, action) {
    if (state.source !== 'cloud') return;
    const { project = null, phase = null } = action.payload;
    state.layers = { project: layerFrom(project), phase: layerFrom(phase) };
    state.cloud.layerVersions = { project: project?.version ?? null, phase: phase?.version ?? null };
    state.cloud.loadId += 1;
    state.cloud.project = null;
    // Loading a page's layers closes an open shop room (its unsaved edits stay in the draft cache).
    if (state.cloud.room) {
      state.rooms = [];
      state.activeRoomId = null;
      state.activeWallId = null;
      state.cloud.room = null;
      state.cloud.statusBlock = null;
      if (state.cloud.conflict?.target === 'room') state.cloud.conflict = null;
      if (state.cloud.error?.target === 'room') state.cloud.error = null;
    }
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },

  /** A save landed: `{ target: 'team'|'profile'|'shape'|'doorDesign'|'pull'|'slide'|'accessory'|'project'|'phase', id?, rowId?, version }`. */
  cloudSaved(state, action) {
    if (!state.cloud) return;
    const { target, id, rowId, version } = action.payload;
    if (target === 'team') state.cloud.teamVersion = version;
    else if (target === 'shape') state.cloud.rows.shapes[id] = { rowId: rowId ?? id, version };
    else if (target === 'profile') state.cloud.rows.profiles[id] = { rowId: rowId ?? id, version };
    else if (target === 'doorDesign') state.cloud.rows.doorDesigns[id] = { rowId, version };
    else if (target === 'pull') state.cloud.rows.pulls[id] = { rowId, version };
    else if (target === 'slide') state.cloud.rows.slides[id] = { rowId, version };
    else if (target === 'accessory') state.cloud.rows.accessories[id] = { rowId, version };
    else if (LAYER_LEVELS.includes(target)) state.cloud.layerVersions[target] = version;
    else if (target === 'room' && state.cloud.room) {
      state.cloud.room.version = version;
      if (action.payload.status) state.cloud.room.status = action.payload.status;
      if (action.payload.updatedAt) state.cloud.room.updatedAt = action.payload.updatedAt;
      state.cloud.room.demote = false;
      state.cloud.room.conflictVersion = null;
    }
  },

  /**
   * One shop room opened (SPEC-DB6a): the editor holds just this room (`rooms: [room]`, DB16),
   * with the project / phase overrides it inherits. `meta` is the room's row info:
   * { id, phaseId, estProjectId, version, status, statusAt, statusByName, archived, updatedAt, schemaVersion }.
   * The room's own id and name are the row's (set by the thunk).
   */
  cloudRoomLoaded(state, action) {
    if (state.source !== 'cloud' || !state.cloud) return;
    const { room, layers = {}, meta, project: projectInfo = null } = action.payload;
    const { project = null, phase = null } = layers;
    const cloud = state.cloud;
    const teamServices = state.teamServices;
    const message = state.message; // e.g. the workspace's load notes
    const clipboard = current(state).clipboard ?? null;
    const fresh = buildInitialState({
      settings: current(state.settings), rooms: [room], activeRoomId: room.id, activeWallId: null, view: 'plan',
    });
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    state.source = 'cloud';
    state.clipboard = clipboard;
    state.teamServices = teamServices;
    state.layers = { project: layerFrom(project), phase: layerFrom(phase) };
    state.cloud = {
      ...cloud,
      loadId: cloud.loadId + 1,
      layerVersions: { project: project?.version ?? null, phase: phase?.version ?? null },
      project: projectInfo,
      room: {
        demote: false, recovered: false, recoveredAt: null, staleDraft: null, conflictVersion: null,
        readOnly: false, readOnlyReason: null, lastVersion: null, issued: null, ...meta,
      },
      pending: 0,
      conflict: null,
      error: null,
      statusBlock: null,
    };
    state.message = message;
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },

  /**
   * An issued version opened read-only (SPEC-DB8a): its frozen room drawn with its own
   * settings snapshot instead of the live shop standard and library. `source` becomes
   * 'version', so nothing is saved, drafted or written to localStorage, and every page that
   * needs the shop data (Library, Shop settings, project page, the room) loads it again.
   * Payload: { room, project, settings, layers: { project, phase }, teamId, permissions, meta }, where
   * meta is the room info as in cloudRoomLoaded plus `issued: { versionId, seq, label, note, issuedAt, issuedByName }`.
   */
  roomVersionLoaded(state, action) {
    const { room, project = null, settings, layers = {}, teamId, permissions, meta } = action.payload;
    const loadId = state.cloud?.loadId ?? 0;
    const clipboard = current(state).clipboard ?? null;
    const fresh = buildInitialState({
      settings, rooms: [room], activeRoomId: room.id, activeWallId: null, view: 'plan',
    });
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    state.source = 'version';
    state.clipboard = clipboard;
    state.layers = { project: layerFrom(layers.project), phase: layerFrom(layers.phase) };
    state.cloud = {
      teamId,
      permissions,
      loadId: loadId + 1,
      teamVersion: null,
      rows: { shapes: {}, profiles: {}, doorDesigns: {}, pulls: {}, slides: {}, accessories: {} },
      layerVersions: { project: null, phase: null },
      project,
      room: {
        demote: false, recovered: false, recoveredAt: null, staleDraft: null, conflictVersion: null,
        lastVersion: null, ...meta, version: null, readOnly: true, readOnlyReason: 'version',
      },
      pending: 0,
      conflict: null,
      error: null,
      statusBlock: null,
    };
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },

  /**
   * Replace the open room's drawing with a recovered local draft (an unsaved copy from this
   * browser, `savedAt` = when it was made). It then counts as an edit, so the sync saves it
   * against the room's current version.
   */
  cloudRoomRecovered(state, action) {
    const info = state.cloud?.room;
    if (!info || state.rooms.length !== 1) return;
    const { room, savedAt = null } = action.payload;
    state.rooms[0] = { ...room, id: info.id, name: state.rooms[0].name };
    info.recovered = true;
    info.recoveredAt = savedAt;
    info.staleDraft = null;
    syncRoomAt(state, 0);
  },

  /** Patch what the editor knows about the open room's row (status, version, flags). */
  cloudRoomPatch(state, action) {
    const info = state.cloud?.room;
    if (!info) return;
    for (const key of ['status', 'statusAt', 'statusByName', 'archived', 'version', 'demote', 'staleDraft', 'conflictVersion', 'updatedAt', 'recovered', 'recoveredAt', 'readOnly', 'readOnlyReason', 'lastVersion']) {
      if (Object.hasOwn(action.payload, key)) info[key] = action.payload[key];
    }
  },

  /** Sync bookkeeping: any of `{ pending, conflict, error }`. */
  cloudSaveStatus(state, action) {
    if (!state.cloud) return;
    for (const key of ['pending', 'conflict', 'error', 'statusBlock']) {
      if (Object.hasOwn(action.payload, key)) state.cloud[key] = action.payload[key];
    }
  },
};
