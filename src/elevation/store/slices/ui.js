import { DEFAULT_PREFS } from '../../model/constants.js';
import { PAPER_SIZES, PLOT_SCALES } from '../../model/drawingScale.js';
import { wallSideOf } from '../../model/wallSides.js';
import { registryEntry } from '../../model/settingsRegistry.js';
import { isValidSettingValue, withOverride } from '../../model/settingsResolve.js';
import {
  roomFor,
  syncRoomAt,
  clearTransientSelection,
} from './helpers.js';

export const uiReducers = {
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
    },
    clearSelection(state) {
      clearTransientSelection(state);
    },
    setTool(state, action) {
      if (!['select', 'draw', 'soffit', 'recess', 'wall', 'door', 'window'].includes(action.payload)) return;
      state.tool = action.payload;
    },
    setMessage(state, action) {
      state.message = action.payload;
    },
    setView(state, action) {
      const view = action.payload.view ?? action.payload;
      if (view !== 'plan' && view !== 'elevation') return;
      state.view = view;
      state.tool = 'select';
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
