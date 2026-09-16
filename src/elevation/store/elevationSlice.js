import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { defaultsForType } from '../model/runDefaults.js';
import { syncAutoItems } from '../model/splitRun.js';
import {
  ELEVATION_SCHEMA_VERSION,
  loadElevationDocument,
} from './persistence.js';

function createDefaultWall() {
  return {
    id: uuid(),
    name: 'Wall 1',
    length: 144,
    height: 96,
    runs: [],
  };
}

/**
 * Create the elevation slice's initial persisted and transient state.
 *
 * @param {object|null} [document]
 * @returns {object}
 */
export function createInitialElevationState(document = loadElevationDocument()) {
  const defaultWall = document ? null : createDefaultWall();
  return {
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings: document
      ? document.settings
      : { ...DEFAULT_SETTINGS, defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds } },
    walls: document ? document.walls : [defaultWall],
    activeWallId: document ? document.activeWallId : defaultWall.id,
    selection: { runId: null, pieceId: null },
    tool: 'select',
    message: null,
  };
}

function wallFor(state, wallId) {
  return state.walls.find((wall) => wall.id === (wallId ?? state.activeWallId));
}

function runLocation(state, payload) {
  const wall = wallFor(state, payload.wallId);
  if (!wall) return null;
  const runIndex = wall.runs.findIndex((run) => run.id === payload.runId);
  return runIndex === -1 ? null : { wall, runIndex, run: wall.runs[runIndex] };
}

function syncRun(state, wall, runIndex) {
  wall.runs[runIndex] = syncAutoItems(wall.runs[runIndex], state.settings);
}

function itemIndexFor(run, itemId) {
  return run.items.findIndex((item) => item.id === itemId);
}

const elevationSlice = createSlice({
  name: 'elevation',
  initialState: createInitialElevationState(),
  reducers: {
    addWall: {
      reducer(state, action) {
        state.walls.push(action.payload);
        state.activeWallId = action.payload.id;
        state.selection = { runId: null, pieceId: null };
      },
      prepare(payload = {}) {
        return {
          payload: {
            id: uuid(),
            name: payload.name ?? 'Wall 1',
            length: payload.length ?? 144,
            height: payload.height ?? 96,
            runs: [],
          },
        };
      },
    },
    updateWall(state, action) {
      const { wallId, id, changes, ...inlineChanges } = action.payload;
      const wall = wallFor(state, wallId ?? id);
      if (!wall) return;
      const allowedChanges = changes ?? inlineChanges;
      for (const key of ['name', 'length', 'height']) {
        if (allowedChanges[key] !== undefined) wall[key] = allowedChanges[key];
      }
    },
    deleteWall(state, action) {
      const wallId = action.payload.wallId ?? action.payload;
      const index = state.walls.findIndex((wall) => wall.id === wallId);
      if (index === -1) return;
      state.walls.splice(index, 1);
      if (state.activeWallId === wallId) {
        state.activeWallId = state.walls[0]?.id ?? null;
        state.selection = { runId: null, pieceId: null };
      }
    },
    setActiveWall(state, action) {
      const wallId = action.payload.wallId ?? action.payload;
      if (!state.walls.some((wall) => wall.id === wallId)) return;
      state.activeWallId = wallId;
      state.selection = { runId: null, pieceId: null };
    },
    addRun(state, action) {
      const payload = action.payload;
      const wall = wallFor(state, payload.wallId);
      const run = payload.run ?? payload;
      if (!wall || !run?.id) return;
      wall.runs.push(syncAutoItems(run, state.settings));
    },
    updateRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { wallId, runId, changes, patch, ...inlineChanges } = action.payload;
      void wallId;
      void runId;
      Object.assign(location.run, changes ?? patch ?? inlineChanges);
      syncRun(state, location.wall, location.runIndex);
    },
    deleteRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.wall.runs.splice(location.runIndex, 1);
      if (state.selection.runId === action.payload.runId) {
        state.selection = { runId: null, pieceId: null };
      }
    },
    setRunEnd(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { side } = action.payload;
      if (side !== 'left' && side !== 'right') return;
      const end = action.payload.end ?? action.payload.value ?? {
        type: action.payload.type,
        width: action.payload.width,
      };
      location.run.ends[side] = { type: end.type, width: end.width };
      syncRun(state, location.wall, location.runIndex);
    },
    setRunType(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const typeId = action.payload.typeId
        ?? action.payload.cabinetTypeId
        ?? action.payload.type;
      location.run.cabinetTypeId = typeId;
      if (action.payload.resetToDefaults ?? action.payload.reset ?? false) {
        Object.assign(location.run, defaultsForType(typeId, state.settings));
      }
      syncRun(state, location.wall, location.runIndex);
    },
    setAutoCount(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.autoCount = action.payload.value ?? action.payload.autoCount;
      syncRun(state, location.wall, location.runIndex);
    },
    setMaxCabinetWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.maxCabinetWidth = action.payload.value
        ?? action.payload.maxCabinetWidth
        ?? null;
      syncRun(state, location.wall, location.runIndex);
    },
    setItemWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = action.payload.width ?? action.payload.value ?? null;
      syncRun(state, location.wall, location.runIndex);
    },
    lockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = action.payload.width
        ?? action.payload.computedWidth
        ?? null;
      syncRun(state, location.wall, location.runIndex);
    },
    unlockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = null;
      syncRun(state, location.wall, location.runIndex);
    },
    splitItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1 || location.run.items[itemIndex].kind !== 'cabinet') return;
      location.run.items.splice(
        itemIndex,
        1,
        { id: uuid(), kind: 'cabinet', width: null },
        { id: uuid(), kind: 'cabinet', width: null },
      );
      location.run.autoCount = false;
      syncRun(state, location.wall, location.runIndex);
    },
    addItemAfter(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      const kind = action.payload.kind;
      const item = kind === 'filler'
        ? { id: uuid(), kind, width: state.settings.defaultInteriorFillerWidth }
        : { id: uuid(), kind: 'cabinet', width: null };
      location.run.items.splice(itemIndex + 1, 0, item);
      location.run.autoCount = false;
      syncRun(state, location.wall, location.runIndex);
    },
    removeItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items.splice(itemIndex, 1);
      location.run.autoCount = false;
      if (state.selection.pieceId === action.payload.itemId) {
        state.selection = { runId: location.run.id, pieceId: null };
      }
      syncRun(state, location.wall, location.runIndex);
    },
    setSelection(state, action) {
      state.selection = {
        runId: action.payload.runId,
        pieceId: action.payload.pieceId ?? null,
      };
    },
    clearSelection(state) {
      state.selection = { runId: null, pieceId: null };
    },
    setTool(state, action) {
      if (action.payload !== 'select' && action.payload !== 'draw') return;
      state.tool = action.payload;
    },
    setMessage(state, action) {
      state.message = action.payload;
    },
    updateSettings(state, action) {
      const changes = action.payload;
      const defaultEnds = changes.defaultEnds
        ? { ...state.settings.defaultEnds, ...changes.defaultEnds }
        : null;
      Object.assign(state.settings, changes);
      if (defaultEnds) state.settings.defaultEnds = defaultEnds;
      for (const wall of state.walls) {
        for (let runIndex = 0; runIndex < wall.runs.length; runIndex += 1) {
          syncRun(state, wall, runIndex);
        }
      }
    },
  },
});

export const {
  addWall,
  updateWall,
  deleteWall,
  setActiveWall,
  addRun,
  updateRun,
  deleteRun,
  setRunEnd,
  setRunType,
  setAutoCount,
  setMaxCabinetWidth,
  setItemWidth,
  lockItem,
  unlockItem,
  splitItem,
  addItemAfter,
  removeItem,
  setSelection,
  clearSelection,
  setTool,
  setMessage,
  updateSettings,
} = elevationSlice.actions;

export default elevationSlice.reducer;
