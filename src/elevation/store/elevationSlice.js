import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { wallFrame } from '../model/geometry.js';
import {
  setMeasureMode,
  setOffsetAnchor,
  setOffsetSide,
  setOpeningReferenceX,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  compensateRuns,
  endCornerAnglesForRun,
  endMinWidthsForRun,
  flipRunsForWall,
  syncRoom,
} from '../model/room.js';
import { splitRun } from '../model/splitRun.js';
import { roundTo } from '../model/units.js';
import {
  addWallWithConnections,
  connectWallEndpoints,
  disconnectWallEndpoint as disconnectWallEndpointPure,
  moveConnectedEndpoint,
  moveWallPerpendicular as moveWallPerpendicularPure,
  setWallLength as setWallLengthPure,
} from '../plan/wallOps.js';
import {
  ELEVATION_SCHEMA_VERSION,
  loadElevationDocument,
} from './persistence.js';

function copySettings(settings = DEFAULT_SETTINGS) {
  return {
    ...settings,
    defaultProfile: { ...settings.defaultProfile },
    defaultEnds: { ...settings.defaultEnds },
  };
}

function createWall(name = '', y = 0, length = 144, values = {}) {
  return {
    id: values.id ?? uuid(),
    name: values.name ?? name,
    numberOverride: values.numberOverride ?? null,
    elevationForced: values.elevationForced ?? false,
    x1: values.x1 ?? 0,
    y1: values.y1 ?? y,
    x2: values.x2 ?? length,
    y2: values.y2 ?? y,
    height: values.height ?? 96,
    thickness: values.thickness ?? 4.5,
    flipped: values.flipped ?? false,
    connections: values.connections ?? { start: null, end: null },
    profile: values.profile ?? {},
    runs: values.runs ?? [],
    openings: values.openings ?? [],
  };
}

function createRoom(name = 'Room 1', settings = DEFAULT_SETTINGS, id = uuid()) {
  return {
    id,
    name,
    profile: { ...settings.defaultProfile },
    wallOrder: [],
    walls: [],
  };
}

/** Create the elevation slice's initial persisted and transient state. */
export function createInitialElevationState(document = loadElevationDocument()) {
  const settings = copySettings(document?.settings ?? DEFAULT_SETTINGS);
  const fallbackRoom = document ? null : createRoom('Room 1', settings);
  const rooms = document?.rooms ?? [fallbackRoom];
  const activeRoomId = document ? document.activeRoomId : fallbackRoom.id;
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const activeWallId = document ? document.activeWallId : null;
  const emptyActiveRoom = Boolean(activeRoom && activeRoom.walls.length === 0);
  return {
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings,
    rooms,
    activeRoomId,
    activeWallId,
    view: emptyActiveRoom ? 'plan' : document?.view ?? 'plan',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      wallId: document?.view === 'elevation' ? activeWallId : null,
    },
    tool: emptyActiveRoom ? 'wall' : 'select',
    message: null,
  };
}

function roomIndexFor(state, roomId) {
  return state.rooms.findIndex((room) => room.id === (roomId ?? state.activeRoomId));
}

function roomFor(state, roomId) {
  return state.rooms[roomIndexFor(state, roomId)] ?? null;
}

function wallLocation(state, payload = {}) {
  const roomIndex = roomIndexFor(state, payload.roomId);
  if (roomIndex === -1) return null;
  const room = state.rooms[roomIndex];
  const targetId = payload.wallId ?? payload.id ?? state.activeWallId;
  const wallIndex = room.walls.findIndex((wall) => wall.id === targetId);
  if (wallIndex === -1) return null;
  return { roomIndex, room, wallIndex, wall: room.walls[wallIndex] };
}

function runLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const runIndex = location.wall.runs.findIndex((run) => run.id === payload.runId);
  return runIndex === -1
    ? null
    : { ...location, runIndex, run: location.wall.runs[runIndex] };
}

function openingLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const openingIndex = (location.wall.openings ?? [])
    .findIndex((opening) => opening.id === payload.openingId);
  return openingIndex === -1
    ? null
    : {
        ...location,
        openingIndex,
        opening: location.wall.openings[openingIndex],
      };
}

function syncRoomAt(state, roomIndex) {
  state.rooms[roomIndex] = syncRoom(state.rooms[roomIndex], state.settings);
}

function setCompensatedWalls(state, roomIndex, walls) {
  const oldRoom = state.rooms[roomIndex];
  state.rooms[roomIndex] = compensateRuns(oldRoom, { ...oldRoom, walls });
  syncRoomAt(state, roomIndex);
}

function itemIndexFor(run, itemId) {
  return run.items.findIndex((item) => item.id === itemId);
}

function clearTransientSelection(state) {
  state.selection = {
    runId: null,
    pieceId: null,
    openingId: null,
    wallId: null,
  };
}

function activateRoom(state, room) {
  state.activeRoomId = room?.id ?? null;
  state.activeWallId = room?.walls[0]?.id ?? null;
  if (room?.walls.length === 0) {
    state.view = 'plan';
    state.tool = 'wall';
  } else {
    state.tool = 'select';
  }
  clearTransientSelection(state);
}

const elevationSlice = createSlice({
  name: 'elevation',
  initialState: createInitialElevationState(),
  reducers: {
    addRoom: {
      reducer(state, action) {
        const room = createRoom(action.payload.name, state.settings, action.payload.id);
        state.rooms.push(syncRoom(room, state.settings));
        activateRoom(state, room);
      },
      prepare(payload = {}) {
        return { payload: { id: uuid(), name: payload.name ?? 'Room 1' } };
      },
    },
    renameRoom(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId ?? action.payload.id);
      if (roomIndex === -1) return;
      state.rooms[roomIndex].name = action.payload.name;
      syncRoomAt(state, roomIndex);
    },
    deleteRoom(state, action) {
      const roomId = action.payload.roomId ?? action.payload;
      const index = state.rooms.findIndex((room) => room.id === roomId);
      if (index === -1) return;
      state.rooms.splice(index, 1);
      if (state.activeRoomId === roomId) {
        const nextRoom = state.rooms[0] ?? null;
        activateRoom(state, nextRoom);
      }
    },
    setActiveRoom(state, action) {
      const roomId = action.payload.roomId ?? action.payload;
      const room = state.rooms.find((candidate) => candidate.id === roomId);
      if (!room) return;
      activateRoom(state, room);
    },
    updateRoomProfile(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const changes = action.payload.changes ?? action.payload.profile ?? {
        [action.payload.key]: action.payload.value,
      };
      for (const [key, value] of Object.entries(changes)) {
        state.rooms[roomIndex].profile[key] = value === null || value === undefined
          ? state.settings.defaultProfile[key]
          : value;
      }
      syncRoomAt(state, roomIndex);
    },
    useAutoHeightsForRoom(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId ?? action.payload);
      if (roomIndex === -1) return;
      for (const wall of state.rooms[roomIndex].walls) {
        for (const run of wall.runs) run.heightMode = 'auto';
      }
      syncRoomAt(state, roomIndex);
    },
    centerRoomOnOrigin(state, action) {
      const roomId = action.payload?.roomId ?? action.payload ?? state.activeRoomId;
      const roomIndex = roomIndexFor(state, roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      if (room.walls.length === 0) return;
      const xs = room.walls.flatMap((wall) => [wall.x1, wall.x2]);
      const ys = room.walls.flatMap((wall) => [wall.y1, wall.y2]);
      const dx = roundTo(-(Math.min(...xs) + Math.max(...xs)) / 2, state.settings.planGrid);
      const dy = roundTo(-(Math.min(...ys) + Math.max(...ys)) / 2, state.settings.planGrid);
      if (dx === 0 && dy === 0) return;
      for (const wall of room.walls) {
        wall.x1 += dx;
        wall.y1 += dy;
        wall.x2 += dx;
        wall.y2 += dy;
      }
      syncRoomAt(state, roomIndex);
    },
    addWall: {
      reducer(state, action) {
        const roomIndex = roomIndexFor(state, action.payload.roomId);
        if (roomIndex === -1) return;
        const room = state.rooms[roomIndex];
        const y = action.payload.y ?? (room.walls.length === 0
          ? 0
          : Math.max(...room.walls.flatMap((wall) => [wall.y1, wall.y2])) + 60);
        const wall = createWall(
          action.payload.name ?? '',
          y,
          action.payload.length ?? 144,
          {
            ...action.payload,
            height: action.payload.height ?? room.profile.wallHeight,
          },
        );
        room.walls.push(wall);
        if (wallFrame(room, wall).leftEndpoint !== 'start') wall.flipped = true;
        state.activeWallId = wall.id;
        clearTransientSelection(state);
        syncRoomAt(state, roomIndex);
      },
      prepare(payload = {}) {
        return { payload: { ...payload, id: payload.id ?? uuid() } };
      },
    },
    addWallSegment: {
      reducer(state, action) {
        const roomIndex = roomIndexFor(state, action.payload.roomId);
        if (roomIndex === -1) return;
        const room = state.rooms[roomIndex];
        const wall = createWall(
          action.payload.name ?? '',
          action.payload.y1,
          0,
          {
            id: action.payload.id,
            x1: action.payload.x1,
            y1: action.payload.y1,
            x2: action.payload.x2,
            y2: action.payload.y2,
            height: action.payload.height ?? room.profile.wallHeight,
            thickness: action.payload.thickness,
          },
        );
        room.walls = addWallWithConnections(
          room.walls,
          wall,
          action.payload.connectStart,
          action.payload.connectEnd,
        );
        state.activeWallId = wall.id;
        clearTransientSelection(state);
        syncRoomAt(state, roomIndex);
      },
      prepare(payload = {}) {
        return { payload: { ...payload, id: payload.id ?? uuid() } };
      },
    },
    moveWallEndpoint(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const wallId = action.payload.wallId ?? action.payload.wall_id;
      const room = state.rooms[roomIndex];
      const walls = moveConnectedEndpoint(
        room.walls,
        wallId,
        action.payload.endpoint,
        { x: action.payload.x, y: action.payload.y },
      );
      setCompensatedWalls(state, roomIndex, walls);
    },
    connectWalls(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      const walls = connectWallEndpoints(
        room.walls,
        action.payload.wallId1,
        action.payload.endpoint1,
        action.payload.wallId2,
        action.payload.endpoint2,
      );
      setCompensatedWalls(state, roomIndex, walls);
    },
    disconnectWallEndpoint(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      state.rooms[roomIndex].walls = disconnectWallEndpointPure(
        state.rooms[roomIndex].walls,
        action.payload.wallId ?? action.payload.wall_id,
        action.payload.endpoint,
      );
      syncRoomAt(state, roomIndex);
    },
    setWallLength(state, action) {
      const location = wallLocation(state, action.payload);
      const length = action.payload.length ?? action.payload.value;
      if (!location || !Number.isFinite(length) || length <= 0) return;
      const result = setWallLengthPure(
        location.room,
        location.wall.id,
        length,
        action.payload.growEnd ?? 'right',
      );
      if (!result.ok) {
        state.message = result.reason;
        return;
      }
      state.message = null;
      setCompensatedWalls(state, location.roomIndex, result.walls);
    },
    moveWallPerpendicular(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      const result = moveWallPerpendicularPure(
        room,
        action.payload.wallId,
        action.payload.delta,
      );
      if (!result.ok) {
        state.message = result.reason;
        return;
      }
      state.message = null;
      setCompensatedWalls(state, roomIndex, result.walls);
    },
    updateWall(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { wallId, roomId, id, changes, ...inlineChanges } = action.payload;
      void wallId;
      void roomId;
      void id;
      const allowedChanges = changes ?? inlineChanges;
      for (const key of ['name', 'height', 'thickness']) {
        if (allowedChanges[key] !== undefined) location.wall[key] = allowedChanges[key];
      }
      if (allowedChanges.numberOverride !== undefined) {
        const value = allowedChanges.numberOverride;
        if (value === null || (Number.isInteger(value) && value > 0)) {
          location.wall.numberOverride = value;
        }
      }
      if (typeof allowedChanges.elevationForced === 'boolean') location.wall.elevationForced = allowedChanges.elevationForced;
      const profileChanges = allowedChanges.profile ?? allowedChanges.profileOverrides;
      if (profileChanges) {
        for (const [key, value] of Object.entries(profileChanges)) {
          if (value === null || value === undefined) delete location.wall.profile[key];
          else location.wall.profile[key] = value;
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    deleteWall(state, action) {
      const location = wallLocation(state, typeof action.payload === 'string'
        ? { wallId: action.payload }
        : action.payload);
      if (!location) return;
      const wallId = location.wall.id;
      location.room.walls.splice(location.wallIndex, 1);
      for (const wall of location.room.walls) {
        for (const endpoint of ['start', 'end']) {
          if (wall.connections[endpoint]?.wallId === wallId) wall.connections[endpoint] = null;
        }
      }
      const deletedActiveWall = state.activeWallId === wallId;
      const deletedSelectedWall = state.selection.wallId === wallId;
      if (deletedActiveWall) {
        state.activeWallId = location.room.walls[0]?.id ?? null;
      }
      if (deletedActiveWall || deletedSelectedWall) {
        clearTransientSelection(state);
      }
      syncRoomAt(state, location.roomIndex);
    },
    setActiveWall(state, action) {
      const wallId = action.payload.wallId ?? action.payload;
      const room = roomFor(state, action.payload.roomId);
      if (!room?.walls.some((wall) => wall.id === wallId)) return;
      state.activeWallId = wallId;
      clearTransientSelection(state);
      state.selection.wallId = wallId;
    },
    flipWall(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      location.room.walls[location.wallIndex] = flipRunsForWall(location.wall);
      syncRoomAt(state, location.roomIndex);
    },
    addRun(state, action) {
      const location = wallLocation(state, action.payload);
      const run = action.payload.run ?? action.payload;
      if (!location || !run?.id) return;
      location.wall.runs.push(run);
      syncRoomAt(state, location.roomIndex);
    },
    addOpening: {
      reducer(state, action) {
        const location = wallLocation(state, action.payload);
        const { opening } = action.payload;
        if (!location || !opening?.id) return;
        location.wall.openings ??= [];
        location.wall.openings.push(opening);
        syncRoomAt(state, location.roomIndex);
      },
      prepare(payload) {
        const opening = payload.opening ?? {};
        return {
          payload: {
            ...payload,
            opening: { ...opening, id: opening.id ?? uuid() },
          },
        };
      },
    },
    updateOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.opening };
      const changes = action.payload.changes ?? {};
      for (const key of [
        'label',
        'kind',
        'width',
        'height',
        'sillZ',
        'offset',
        'offsetFrom',
        'offsetAnchor',
        'casing',
      ]) {
        if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
        candidate[key] = key === 'casing' && changes[key]
          ? { ...changes[key] }
          : changes[key];
      }
      const resolvedWall = {
        ...location.wall,
        length: wallFrame(location.room, location.wall).length,
      };
      const validation = validateOpeningPlacement(resolvedWall, candidate, state.settings);
      if (!validation.ok) {
        state.message = validation.reason;
        syncRoomAt(state, location.roomIndex);
        return;
      }
      location.wall.openings[location.openingIndex] = candidate;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningMeasureMode(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setMeasureMode(
        location.opening,
        action.payload.mode,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningOffsetSide(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOffsetSide(
        location.opening,
        action.payload.side,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningOffsetAnchor(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOffsetAnchor(
        location.opening,
        action.payload.anchor,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    moveOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location || !Number.isFinite(action.payload.x)) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOpeningReferenceX(
        location.opening,
        action.payload.x,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    deleteOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      location.wall.openings.splice(location.openingIndex, 1);
      for (const run of location.wall.runs) {
        for (const side of ['left', 'right']) {
          if (run.anchors?.[side]?.to === 'opening'
            && run.anchors[side].openingId === action.payload.openingId) {
            run.anchors[side] = false;
          }
        }
        for (const item of run.items) {
          if (item.pin?.from === 'opening'
            && item.pin.openingId === action.payload.openingId) {
            item.pin = null;
          }
        }
      }
      if (state.selection.openingId === action.payload.openingId) {
        clearTransientSelection(state);
      }
      syncRoomAt(state, location.roomIndex);
    },
    replaceRun(state, action) {
      const run = action.payload.run;
      if (!run?.id) return;
      const location = runLocation(state, {
        ...action.payload,
        runId: run.id,
      });
      if (!location) return;
      location.wall.runs[location.runIndex] = run;
      syncRoomAt(state, location.roomIndex);
    },
    updateRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { wallId, roomId, runId, changes, patch, ...inlineChanges } = action.payload;
      void wallId;
      void roomId;
      void runId;
      Object.assign(location.run, changes ?? patch ?? inlineChanges);
      syncRoomAt(state, location.roomIndex);
    },
    deleteRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.wall.runs.splice(location.runIndex, 1);
      if (state.selection.runId === action.payload.runId) clearTransientSelection(state);
      syncRoomAt(state, location.roomIndex);
    },
    setRunEnd(state, action) {
      const location = runLocation(state, action.payload);
      const { side } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const end = action.payload.end ?? action.payload.value ?? {
        type: action.payload.type,
        width: action.payload.width,
      };
      location.run.ends[side] = { type: end.type, width: end.width };
      syncRoomAt(state, location.roomIndex);
    },
    setRunType(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.cabinetTypeId = action.payload.typeId
        ?? action.payload.cabinetTypeId
        ?? action.payload.type;
      if (action.payload.resetToDefaults ?? action.payload.reset ?? false) {
        location.run.heightMode = 'auto';
        location.run.overrides = {};
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunHeightMode(state, action) {
      const location = runLocation(state, action.payload);
      const mode = action.payload.mode ?? action.payload.value;
      if (!location || (mode !== 'auto' && mode !== 'manual')) return;
      location.run.heightMode = mode;
      syncRoomAt(state, location.roomIndex);
    },
    setRunOverride(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { key, value } = action.payload;
      if (value === null || value === undefined) delete location.run.overrides[key];
      else location.run.overrides[key] = value;
      syncRoomAt(state, location.roomIndex);
    },
    setRunAnchor(state, action) {
      const location = runLocation(state, action.payload);
      const { side } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const value = action.payload.anchor
        ?? action.payload.value
        ?? action.payload.anchored
        ?? false;
      const validOpeningAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'opening'
        && typeof value.openingId === 'string'
        && (value.edge === 'casing' || value.edge === 'jamb')
        && (value.clearance === null || Number.isFinite(value.clearance));
      if (typeof value !== 'boolean' && !validOpeningAnchor) return;
      location.run.anchors[side] = validOpeningAnchor ? { ...value } : value;
      if (value === true) {
        const inside = cornerAt(location.room, location.wall, side).type === 'inside';
        if (inside) location.run.ends[side] = { type: 'filler', width: null };
        else if (location.run.ends[side].type !== 'end_panel') {
          location.run.ends[side] = { type: 'end_panel', width: null };
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunCornerClearance(state, action) {
      const location = runLocation(state, action.payload);
      const { side, value } = action.payload;
      const validValue = value === 'auto'
        || value === 'face'
        || (typeof value === 'number' && Number.isFinite(value));
      if (!location || (side !== 'left' && side !== 'right') || !validValue) return;
      location.run.cornerClearance = {
        ...(location.run.cornerClearance ?? {}),
        [side]: value,
      };
      syncRoomAt(state, location.roomIndex);
    },
    setAutoCount(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.autoCount = action.payload.value ?? action.payload.autoCount;
      syncRoomAt(state, location.roomIndex);
    },
    setMaxCabinetWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.maxCabinetWidth = action.payload.value
        ?? action.payload.maxCabinetWidth
        ?? null;
      syncRoomAt(state, location.roomIndex);
    },
    setItemWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = action.payload.width ?? action.payload.value ?? null;
      syncRoomAt(state, location.roomIndex);
    },
    setItemPin(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const item = location.run.items[itemIndex];
      if (!item || item.kind !== 'cabinet') return;
      const pin = action.payload.pin ?? null;
      const pinCountBefore = location.run.items.filter((candidate) => candidate.pin).length;
      const addsSecondPin = Boolean(pin) && !item.pin && pinCountBefore === 1;
      const addsPinToPinnedRun = Boolean(pin) && !item.pin && pinCountBefore >= 1;
      let currentWidths = null;
      if (addsPinToPinnedRun) {
        const layout = splitRun(location.run, state.settings, {
          endMinWidths: endMinWidthsForRun(
            location.room,
            location.wall,
            location.run,
            state.settings,
          ),
          endCornerAngles: endCornerAnglesForRun(
            location.room,
            location.wall,
            location.run,
          ),
          pinTargets: {},
        });
        currentWidths = new Map(layout.pieces.map((piece) => [piece.id, piece.width]));
      }
      item.pin = pin ? { ...pin } : null;
      if (pin) location.run.autoCount = false;
      if (addsPinToPinnedRun) {
        const itemsToLock = addsSecondPin
          ? location.run.items.filter((candidate) => candidate.pin)
          : [item];
        for (const pinnedItem of itemsToLock) {
          const width = currentWidths.get(pinnedItem.id);
          if (Number.isFinite(width)) {
            pinnedItem.width = roundTo(width, state.settings.roundTo);
          }
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    setItemAbsorb(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const item = location.run.items[itemIndex];
      if (!item || item.kind !== 'cabinet') return;
      item.absorb = Boolean(action.payload.value ?? action.payload.absorb);
      syncRoomAt(state, location.roomIndex);
    },
    lockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = action.payload.width
        ?? action.payload.computedWidth
        ?? null;
      syncRoomAt(state, location.roomIndex);
    },
    unlockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items[itemIndex].width = null;
      syncRoomAt(state, location.roomIndex);
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
      syncRoomAt(state, location.roomIndex);
    },
    addItemAfter(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const appendToEmptyRun = action.payload.itemId == null && location.run.items.length === 0;
      if (itemIndex === -1 && !appendToEmptyRun) return;
      const item = action.payload.kind === 'filler'
        ? { id: uuid(), kind: 'filler', width: state.settings.defaultInteriorFillerWidth }
        : { id: uuid(), kind: 'cabinet', width: null };
      location.run.items.splice(appendToEmptyRun ? 0 : itemIndex + 1, 0, item);
      location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    removeItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.items.splice(itemIndex, 1);
      location.run.autoCount = false;
      if (state.selection.pieceId === action.payload.itemId) {
        state.selection = {
          runId: location.run.id,
          pieceId: null,
          openingId: null,
          wallId: state.selection.wallId,
        };
      }
      syncRoomAt(state, location.roomIndex);
    },
    setSelection(state, action) {
      const openingId = action.payload.openingId ?? null;
      const runId = openingId ? null : action.payload.runId ?? null;
      state.selection = {
        runId,
        pieceId: runId ? action.payload.pieceId ?? null : null,
        openingId: runId ? null : openingId,
        wallId: state.selection.wallId ?? null,
      };
    },
    clearSelection(state) {
      clearTransientSelection(state);
    },
    setTool(state, action) {
      if (!['select', 'draw', 'wall', 'door', 'window'].includes(action.payload)) return;
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
  },
});

export const {
  addRoom,
  renameRoom,
  deleteRoom,
  setActiveRoom,
  updateRoomProfile,
  useAutoHeightsForRoom,
  centerRoomOnOrigin,
  addWall,
  addWallSegment,
  moveWallEndpoint,
  moveWallPerpendicular,
  connectWalls,
  disconnectWallEndpoint,
  setWallLength,
  updateWall,
  deleteWall,
  setActiveWall,
  flipWall,
  addRun,
  addOpening,
  updateOpening,
  setOpeningMeasureMode,
  setOpeningOffsetAnchor,
  setOpeningOffsetSide,
  moveOpening,
  deleteOpening,
  replaceRun,
  updateRun,
  deleteRun,
  setRunEnd,
  setRunType,
  setRunHeightMode,
  setRunOverride,
  setRunAnchor,
  setRunCornerClearance,
  setAutoCount,
  setMaxCabinetWidth,
  setItemWidth,
  setItemPin,
  setItemAbsorb,
  lockItem,
  unlockItem,
  splitItem,
  addItemAfter,
  removeItem,
  setSelection,
  clearSelection,
  setTool,
  setMessage,
  setView,
  updateSettings,
} = elevationSlice.actions;

export default elevationSlice.reducer;
