import { DEFAULT_PREFS } from '../../model/constants.js';
import { PAPER_SIZES, PLOT_SCALES } from '../../model/drawingScale.js';
import { wallSideOf } from '../../model/wallSides.js';
import { defaultElevationFace } from '../../model/topology.js';
import { registryEntry } from '../../model/settingsRegistry.js';
import { isValidSettingValue, withOverride } from '../../model/settingsResolve.js';
import {
  roomFor,
  syncRoomAt,
  clearTransientSelection,
} from './helpers.js';

export const uiReducers = {
    setDoorsOff(state, action) {
      if (typeof action.payload !== 'boolean') return;
      state.doorsOff = action.payload;
      if (action.payload) state.facePath = null;
    },
    setInteriorPath(state, action) {
      const payload = action.payload;
      if (payload === null) {
        state.interiorPath = null;
        state.interiorDivider = null;
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || typeof payload.path !== 'string' || payload.path.length === 0
        || (payload.divider != null && (!Number.isInteger(payload.divider) || payload.divider < 0))) return;
      state.interiorPath = payload.path;
      state.interiorDivider = payload.divider ?? null;
    },
    setFacePath(state, action) {
      state.facePath = action.payload ?? null;
    },
    setSelection(state, action) {
      const openingId = action.payload.openingId ?? null;
      const recessId = openingId ? null : action.payload.recessId ?? null;
      const soffitId = openingId || recessId ? null : action.payload.soffitId ?? null;
      const runId = openingId || recessId || soffitId ? null : action.payload.runId ?? null;
      const endPanel = openingId || recessId || soffitId || runId
        || !['start', 'end'].includes(action.payload.endPanel)
        ? null
        : action.payload.endPanel;
      state.selection = {
        runId,
        pieceId: runId ? action.payload.pieceId ?? null : null,
        openingId,
        soffitId,
        recessId,
        wallId: state.selection.wallId ?? null,
        ...(endPanel ? { endPanel } : {}),
      };
      if (runId) {
        const selectedRun = roomFor(state)?.walls
          .flatMap((wall) => wall.runs)
          .find((run) => run.id === runId);
        if (selectedRun) state.activeWallSide = wallSideOf(selectedRun);
      } else if (recessId) {
        const selectedRecess = roomFor(state)?.walls
          .flatMap((wall) => wall.recesses ?? [])
          .find((recess) => recess.id === recessId);
        if (selectedRecess) state.activeWallSide = wallSideOf(selectedRecess);
      } else if (soffitId) {
        const selectedSoffit = roomFor(state)?.walls
          .flatMap((wall) => wall.soffits ?? [])
          .find((soffit) => soffit.id === soffitId);
        if (selectedSoffit) state.activeWallSide = wallSideOf(selectedSoffit);
      } else if (openingId) {
        state.activeWallSide = 'front';
      }
      state.facePath = null;
      state.interiorPath = null;
      state.interiorDivider = null;
    },
    clearSelection(state) {
      clearTransientSelection(state);
    },
    setTool(state, action) {
      if (!['select', 'draw', 'measure', 'soffit', 'recess', 'wall', 'door', 'window'].includes(action.payload)) return;
      state.tool = action.payload;
    },
    /** Generic copy buffer (MR5): `null` or `{ kind, data }`. Not saved; survives room loads. */
    setClipboard(state, action) {
      const payload = action.payload;
      if (payload === null) {
        state.clipboard = null;
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || typeof payload.kind !== 'string' || payload.kind.length === 0
        || !Object.hasOwn(payload, 'data')) return;
      state.clipboard = { kind: payload.kind, data: structuredClone(payload.data) };
    },
    setMessage(state, action) {
      state.message = action.payload;
    },
    setView(state, action) {
      const view = action.payload.view ?? action.payload;
      if (view !== 'plan' && view !== 'elevation') return;
      state.view = view;
      state.tool = 'select';
      const room = roomFor(state);
      if (view === 'elevation' && !room?.walls.some((wall) => wall.id === state.activeWallId)) {
        const face = defaultElevationFace(room);
        state.activeWallId = face?.wallId ?? null;
        state.activeWallSide = face?.side ?? 'front';
      }
      clearTransientSelection(state);
      if (view === 'elevation') state.selection.wallId = state.activeWallId;
    },
    setPref(state, action) {
      const { key, value } = action.payload;
      if (!Object.hasOwn(DEFAULT_PREFS, key)) return;
      if (key === 'plotScale') {
        if (!PLOT_SCALES.some(([choice]) => choice === value)) return;
      } else if (key === 'paperSize') {
        if (!PAPER_SIZES.some(([choice]) => choice === value)) return;
      } else if (typeof DEFAULT_PREFS[key] === 'boolean') {
        if (typeof value !== 'boolean') return;
      } else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
      state.prefs[key] = value;
    },
    setSetting(state, action) {
      const { key, value } = action.payload;
      if (value === null || value === undefined || !registryEntry(key) || !isValidSettingValue(key, value)) return;
      state.settings = withOverride(state.settings, key, value);
      for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
    },
    updateSettings(state, action) {
      const changes = Object.fromEntries(Object.entries(action.payload)
        .filter(([key]) => !Object.hasOwn(DEFAULT_PREFS, key)));
      const defaultEnds = changes.defaultEnds
        ? { ...state.settings.defaultEnds, ...changes.defaultEnds }
        : state.settings.defaultEnds;
      const defaultProfile = changes.defaultProfile
        ? { ...state.settings.defaultProfile, ...changes.defaultProfile }
        : state.settings.defaultProfile;
      Object.assign(state.settings, changes, { defaultEnds, defaultProfile });
      for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
    },
};
