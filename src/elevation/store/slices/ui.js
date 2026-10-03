import { wallSideOf } from '../../model/wallSides.js';
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
    updateSettings(state, action) {
      const changes = action.payload;
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
