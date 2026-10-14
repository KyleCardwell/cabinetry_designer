import { allowedAt, registryEntry } from '../../model/settingsRegistry.js';
import { isValidSettingValue, withOverride } from '../../model/settingsResolve.js';
import { syncRoomAt } from './helpers.js';

export const LAYER_LEVELS = ['project', 'phase'];

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
  localWorkspaceLoaded(_state, action) {
    return buildInitialState(action.payload ?? null);
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
    const { teamId, permissions, settings, teamVersion, rows, message = null } = action.payload;
    const next = buildInitialState({
      settings, rooms: [], activeRoomId: null, activeWallId: null, view: 'plan',
    });
    return {
      ...next,
      source: 'cloud',
      cloud: {
        teamId,
        permissions,
        loadId: (state.cloud?.loadId ?? 0) + 1,
        teamVersion,
        rows,
        layerVersions: { project: null, phase: null },
        pending: 0,
        conflict: null,
        error: null,
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
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },

  /** A save landed: `{ target: 'team'|'profile'|'doorDesign'|'project'|'phase', id?, rowId?, version }`. */
  cloudSaved(state, action) {
    if (!state.cloud) return;
    const { target, id, rowId, version } = action.payload;
    if (target === 'team') state.cloud.teamVersion = version;
    else if (target === 'profile') state.cloud.rows.profiles[id] = { rowId: rowId ?? id, version };
    else if (target === 'doorDesign') state.cloud.rows.doorDesigns[id] = { rowId, version };
    else if (LAYER_LEVELS.includes(target)) state.cloud.layerVersions[target] = version;
  },

  /** Sync bookkeeping: any of `{ pending, conflict, error }`. */
  cloudSaveStatus(state, action) {
    if (!state.cloud) return;
    for (const key of ['pending', 'conflict', 'error']) {
      if (Object.hasOwn(action.payload, key)) state.cloud[key] = action.payload[key];
    }
  },
};
