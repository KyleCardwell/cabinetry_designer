import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { wallFrame } from '../model/geometry.js';
import { isJointAnchor } from '../model/joints.js';
import {
  LANDING_TO,
  landWallEnd,
  landingEndpoint,
  landingOffsetFor,
  landingRefCreatesCycle,
  releaseWall,
} from '../model/landings.js';
import {
  resizeOpening as resizeOpeningPure,
  setMeasureMode,
  setOffsetAnchor,
  setOffsetSide,
  setOpeningReferenceX,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  compensateRuns,
  dissolveJoint as dissolveJointPure,
  endCornerAnglesForRun,
  endMinWidthsForRun,
  flipRunsForWall,
  joinEdges,
  resizeRun as resizeRunPure,
  resolveWall,
  syncRoom,
} from '../model/room.js';
import {
  resolveSoffitSpan,
  soffitEndType,
  validateSoffitPlacement,
} from '../model/soffits.js';
import { splitRun } from '../model/splitRun.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  applyStandardDrawers,
  isInsetStyle,
  isStyle,
  resolveStyle,
} from '../model/styles.js';
import { roundTo } from '../model/units.js';
import { wallSideOf, wallSideView, wallViewForRun } from '../model/wallSides.js';
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

function withoutAuto(end) {
  const { auto, ...manualEnd } = end;
  void auto;
  return manualEnd;
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
    endPanels: values.endPanels ?? { start: null, end: null },
    landings: values.landings ?? { start: null, end: null },
    profile: values.profile ?? {},
    runs: values.runs ?? [],
    openings: values.openings ?? [],
    soffits: values.soffits ?? [],
  };
}

function createRoom(name = 'Room 1', settings = DEFAULT_SETTINGS, id = uuid()) {
  return {
    id,
    name,
    profile: { ...settings.defaultProfile },
    partNumberStart: 1,
    partNumberOverrides: {},
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
    activeWallSide: 'front',
    view: emptyActiveRoom ? 'plan' : document?.view ?? 'plan',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      soffitId: null,
      wallId: document?.view === 'elevation' ? activeWallId : null,
    },
    facePath: null,
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

function soffitLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const soffitIndex = (location.wall.soffits ?? [])
    .findIndex((soffit) => soffit.id === payload.soffitId);
  return soffitIndex === -1
    ? null
    : {
        ...location,
        soffitIndex,
        soffit: location.wall.soffits[soffitIndex],
      };
}

function resolvedSoffitCandidate(room, wall, soffit) {
  const resolvedWall = resolveWall(room, wall);
  const view = {
    ...wallSideView(resolvedWall, soffit.wallSide),
    length: resolvedWall.length,
  };
  const span = resolveSoffitSpan(room, view, soffit);
  const candidate = { ...soffit, ...span };
  return validateSoffitPlacement(view, candidate).ok ? candidate : null;
}

function syncRoomAt(state, roomIndex) {
  state.rooms[roomIndex] = syncRoom(state.rooms[roomIndex], state.settings);
}

function setCompensatedWalls(state, roomIndex, walls) {
  const oldRoom = state.rooms[roomIndex];
  state.rooms[roomIndex] = compensateRuns(oldRoom, { ...oldRoom, walls });
  syncRoomAt(state, roomIndex);
}

const STYLE_FIELD_KEYS = ['cabinetStyleId', 'beadWidth', 'profiledEdge'];

/**
 * Copy only `keys` whose values are set (not null/undefined) and pass `accept`.
 * Returns null when nothing is left, which clears the stored field.
 */
function cleanPartial(value, keys, accept = () => true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = keys
    .map((key) => [key, value[key]])
    .filter(([, entry]) => entry !== null && entry !== undefined && accept(entry));
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

function roomCabinets(room) {
  return room.walls.flatMap((wall) => wall.runs.flatMap((run) => run.items
    .filter((item) => item.kind === 'cabinet')
    .map((item) => ({ run, item }))));
}

/**
 * Run a style edit; every cabinet whose style switches between European and face frame
 * gets its small drawer fronts reset to the new style's standard height.
 */
function withStandardDrawers(state, room, mutate) {
  const isInset = ({ run, item }) => isInsetStyle(resolveStyle(state.settings, room, run, item));
  const before = new Map(roomCabinets(room).map((entry) => [entry.item.id, isInset(entry)]));
  mutate();
  for (const entry of roomCabinets(room)) {
    const { run, item } = entry;
    if (!item.face || before.get(item.id) === isInset(entry)) continue;
    item.face = applyStandardDrawers(item.face, resolveStyle(state.settings, room, run, item), state.settings);
  }
}

function itemIndexFor(run, itemId) {
  return run.items.findIndex((item) => item.id === itemId);
}

function clearTransientSelection(state) {
  state.selection = {
    runId: null,
    pieceId: null,
    openingId: null,
    soffitId: null,
    wallId: state.view === 'elevation' ? state.activeWallId : null,
  };
  state.facePath = null;
}

function activateRoom(state, room) {
  state.activeRoomId = room?.id ?? null;
  state.activeWallId = room?.walls[0]?.id ?? null;
  state.activeWallSide = 'front';
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
    setRoomPartNumberStart(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      if (roomIndex === -1) return;
      const value = action.payload.value ?? action.payload.start;
      state.rooms[roomIndex].partNumberStart = Number.isInteger(value) && value > 0 ? value : 1;
    },
    setPartNumberOverride(state, action) {
      const roomIndex = roomIndexFor(state, action.payload.roomId);
      const { key } = action.payload;
      if (roomIndex === -1 || typeof key !== 'string' || key === '') return;
      const room = state.rooms[roomIndex];
      room.partNumberOverrides ??= {};
      const number = action.payload.number ?? action.payload.value ?? null;
      if (number === null) delete room.partNumberOverrides[key];
      else if (Number.isInteger(number) && number > 0) room.partNumberOverrides[key] = number;
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
        for (const [endpoint, land, connect] of [
          ['start', action.payload.landStart, action.payload.connectStart],
          ['end', action.payload.landEnd, action.payload.connectEnd],
        ]) {
          if (land && !connect) {
            const landed = landWallEnd(
              { ...room, walls: room.walls },
              wall.id,
              endpoint,
              land,
            );
            if (landed) room.walls = landed.walls;
          }
        }
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
      for (const [wallId, endpoint] of [
        [action.payload.wallId1, action.payload.endpoint1],
        [action.payload.wallId2, action.payload.endpoint2],
      ]) {
        const wall = walls.find((candidate) => candidate.id === wallId);
        if (wall?.landings) wall.landings[endpoint] = null;
      }
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
    setWallEndPanel(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint, panel } = action.payload;
      const validPanel = panel === null || (
        panel
        && typeof panel === 'object'
        && !Array.isArray(panel)
        && (panel.width === null || (Number.isFinite(panel.width) && panel.width >= 0))
      );
      if (!location || !['start', 'end'].includes(endpoint) || !validPanel) return;
      location.wall.endPanels ??= { start: null, end: null };
      location.wall.endPanels[endpoint] = panel ? { width: panel.width ?? null } : null;
      syncRoomAt(state, location.roomIndex);
    },
    setWallLanding(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint } = action.payload;
      const landing = location?.wall.landings?.[endpoint];
      if (!location || !landing) return;
      const ref = action.payload.ref ?? landing.ref;
      const to = action.payload.to ?? landing.to;
      if (!LANDING_TO.includes(to)) return;
      if (ref !== 'left' && ref !== 'right') {
        const refWall = location.room.walls.find((wall) => wall.id === ref);
        if (!refWall || !landingEndpoint(refWall, landing.wallId, landing.side)) return;
        if (landingRefCreatesCycle(
          location.room,
          location.wall.id,
          landing.wallId,
          landing.side,
          ref,
        )) return;
      }
      const offset = action.payload.offset === undefined
        ? landingOffsetFor(location.room, location.wall, endpoint, ref, to)
        : action.payload.offset;
      if (!Number.isFinite(offset)) return;
      location.wall.landings[endpoint] = { ...landing, ref, to, offset };
      syncRoomAt(state, location.roomIndex);
    },
    detachWallLanding(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint } = action.payload;
      if (!location?.wall.landings?.[endpoint]) return;
      state.rooms[location.roomIndex] = releaseWall(
        location.room,
        location.wall.id,
        { deleting: false },
      );
      const wall = state.rooms[location.roomIndex].walls.find(
        (candidate) => candidate.id === location.wall.id,
      );
      wall.landings[endpoint] = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateWall(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { wallId, roomId, id, changes, ...inlineChanges } = action.payload;
      void wallId;
      void roomId;
      void id;
      const allowedChanges = changes ?? inlineChanges;
      for (const key of ['name', 'height']) {
        if (allowedChanges[key] !== undefined) location.wall[key] = allowedChanges[key];
      }
      const thickness = allowedChanges.thickness;
      if (Number.isFinite(thickness) && thickness >= 0) location.wall.thickness = thickness;
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
      location.room.walls = releaseWall(location.room, wallId).walls;
      const wallIndex = location.room.walls.findIndex((wall) => wall.id === wallId);
      location.room.walls.splice(wallIndex, 1);
      for (const wall of location.room.walls) {
        for (const endpoint of ['start', 'end']) {
          if (wall.connections[endpoint]?.wallId === wallId) wall.connections[endpoint] = null;
        }
      }
      const deletedActiveWall = state.activeWallId === wallId;
      const deletedSelectedWall = state.selection.wallId === wallId;
      if (deletedActiveWall) {
        state.activeWallId = location.room.walls[0]?.id ?? null;
        state.activeWallSide = 'front';
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
      state.activeWallSide = 'front';
      clearTransientSelection(state);
      state.selection.wallId = wallId;
    },
    setActiveWallSide(state, action) {
      const side = action.payload.side ?? action.payload;
      if (side !== 'front' && side !== 'back') return;
      state.activeWallSide = side;
      clearTransientSelection(state);
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
    addSoffit(state, action) {
      const location = wallLocation(state, action.payload);
      const soffit = action.payload.soffit ?? action.payload;
      if (!location || !soffit?.id) return;
      const candidate = resolvedSoffitCandidate(location.room, location.wall, soffit);
      if (!candidate) return;
      location.wall.soffits ??= [];
      location.wall.soffits.push(candidate);
      state.selection = {
        runId: null,
        pieceId: null,
        openingId: null,
        soffitId: candidate.id,
        wallId: state.selection.wallId ?? null,
      };
      state.activeWallSide = wallSideOf(candidate);
      state.facePath = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateSoffit(state, action) {
      const location = soffitLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.soffit };
      const changes = action.payload.changes ?? {};
      for (const key of ['bottom', 'depth', 'molding', 'x', 'width']) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) candidate[key] = changes[key];
      }
      const resolved = resolvedSoffitCandidate(location.room, location.wall, candidate);
      if (!resolved) return;
      location.wall.soffits[location.soffitIndex] = resolved;
      syncRoomAt(state, location.roomIndex);
    },
    setSoffitAnchor(state, action) {
      const location = soffitLocation(state, action.payload);
      const { side, anchor } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const validOffset = anchor?.offset === null || Number.isFinite(anchor?.offset);
      const validEndAnchor = anchor?.to === 'end' && validOffset;
      const validWallAnchor = anchor?.to === 'wall'
        && typeof anchor.wallId === 'string'
        && validOffset;
      if (anchor !== false && !validEndAnchor && !validWallAnchor) return;
      const candidate = {
        ...location.soffit,
        anchors: {
          ...location.soffit.anchors,
          [side]: anchor === false ? false : { ...anchor, offset: anchor.offset ?? 0 },
        },
      };
      const resolved = resolvedSoffitCandidate(location.room, location.wall, candidate);
      if (!resolved) return;
      location.wall.soffits[location.soffitIndex] = resolved;
      syncRoomAt(state, location.roomIndex);
    },
    deleteSoffit(state, action) {
      const location = soffitLocation(state, action.payload);
      if (!location) return;
      location.wall.soffits.splice(location.soffitIndex, 1);
      for (const wall of location.room.walls) {
        for (const run of wall.runs) {
          for (const side of ['left', 'right']) {
            if (run.anchors?.[side]?.to === 'soffit'
              && run.anchors[side].soffitId === location.soffit.id) {
              run.anchors[side] = false;
            }
          }
        }
      }
      if (state.selection.soffitId === location.soffit.id) clearTransientSelection(state);
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
    resizeOpening(state, action) {
      const location = openingLocation(state, action.payload);
      const { width, grow = 'right' } = action.payload;
      if (!location || !Number.isFinite(width) || width <= 0) return;
      const length = wallFrame(location.room, location.wall).length;
      const candidate = resizeOpeningPure(location.opening, width, grow, length, state.settings);
      const validation = validateOpeningPlacement(
        { ...location.wall, length },
        candidate,
        state.settings,
      );
      if (!validation.ok) {
        state.message = validation.reason;
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
      const validWallAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'wall'
        && typeof value.wallId === 'string';
      const validSoffitAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'soffit'
        && typeof value.soffitId === 'string'
        && (value.offset === null || Number.isFinite(value.offset));
      if (typeof value !== 'boolean'
        && !validOpeningAnchor
        && !validWallAnchor
        && !validSoffitAnchor) return;
      if (isJointAnchor(location.run.anchors[side]) && !isJointAnchor(value)) {
        location.run.ends[side] = withoutAuto(location.run.ends[side]);
      }
      const anchor = validSoffitAnchor ? { ...value, offset: value.offset ?? 0 } : value;
      location.run.anchors[side] = validOpeningAnchor || validWallAnchor || validSoffitAnchor
        ? { ...anchor }
        : anchor;
      if (validSoffitAnchor) {
        location.run.ends[side] = {
          type: soffitEndType(location.wall, location.run, side, anchor, state.settings),
          width: null,
        };
      } else if (validWallAnchor) {
        location.run.ends[side] = { type: 'filler', width: null };
      } else if (value === true) {
        const inside = cornerAt(location.room, wallViewForRun(location.wall, location.run), side).type === 'inside';
        if (inside) location.run.ends[side] = { type: 'filler', width: null };
        else if (location.run.ends[side].type !== 'end_panel') {
          location.run.ends[side] = { type: 'end_panel', width: null };
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    joinRunEdges(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { runId, side, targetRunId, targetSide } = action.payload;
      const result = joinEdges(
        location.room,
        location.wall.id,
        { runId, side },
        { runId: targetRunId, side: targetSide },
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunJointOffset(state, action) {
      const location = runLocation(state, action.payload);
      const { side, offset } = action.payload;
      const anchor = location?.run.anchors?.[side];
      if (!location || !Number.isFinite(offset) || !anchor || anchor.to !== 'joint') return;
      anchor.offset = offset;
      syncRoomAt(state, location.roomIndex);
    },
    dissolveJoint(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const result = dissolveJointPure(
        location.room,
        location.wall.id,
        action.payload.jointId,
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    resizeRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const result = resizeRunPure(
        location.room,
        location.wall.id,
        location.run.id,
        action.payload.width,
        action.payload.grow ?? 'right',
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    replaceWallLayout(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      location.wall.runs = action.payload.runs;
      location.wall.joints = action.payload.joints;
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
        state.facePath = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setItemFace(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { itemIds = [], face = null } = action.payload;
      for (const item of location.run.items) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        item.face = face === null ? null : structuredClone(face);
      }
    },
    setRoomStyle(state, action) {
      const room = roomFor(state, action.payload.roomId);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!room || !isStyle(style)) return;
      withStandardDrawers(state, room, () => {
        if (style) room.style = style;
        else delete room.style;
      });
    },
    setRunStyle(state, action) {
      const location = runLocation(state, action.payload);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!location || !isStyle(style)) return;
      withStandardDrawers(state, location.room, () => {
        if (style) location.run.style = style;
        else delete location.run.style;
      });
    },
    setRunFaceOptions(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const allowed = { upperBottom: UPPER_BOTTOM_OPTIONS, top: RUN_TOP_OPTIONS };
      for (const [key, options] of Object.entries(allowed)) {
        const value = action.payload[key];
        if (value === null) delete location.run[key];
        else if (options.includes(value)) location.run[key] = value;
      }
    },
    setItemStyle(state, action) {
      const location = runLocation(state, action.payload);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!location || !isStyle(style)) return;
      const { itemIds = [] } = action.payload;
      withStandardDrawers(state, location.room, () => {
        for (const item of location.run.items) {
          if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
          if (style) item.style = { ...style };
          else delete item.style;
        }
      });
    },
    setItemReveals(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const reveals = cleanPartial(action.payload.reveals, REVEAL_KEYS, Number.isFinite);
      const { itemIds = [] } = action.payload;
      for (const item of location.run.items) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        if (reveals) item.reveals = { ...reveals };
        else delete item.reveals;
      }
    },
    setFacePath(state, action) {
      state.facePath = action.payload ?? null;
    },
    setSelection(state, action) {
      const openingId = action.payload.openingId ?? null;
      const soffitId = openingId ? null : action.payload.soffitId ?? null;
      const runId = openingId || soffitId ? null : action.payload.runId ?? null;
      state.selection = {
        runId,
        pieceId: runId ? action.payload.pieceId ?? null : null,
        openingId,
        soffitId,
        wallId: state.selection.wallId ?? null,
      };
      if (runId) {
        const selectedRun = roomFor(state)?.walls
          .flatMap((wall) => wall.runs)
          .find((run) => run.id === runId);
        if (selectedRun) state.activeWallSide = wallSideOf(selectedRun);
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
      if (!['select', 'draw', 'soffit', 'wall', 'door', 'window'].includes(action.payload)) return;
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
  setRoomPartNumberStart,
  setPartNumberOverride,
  centerRoomOnOrigin,
  addWall,
  addWallSegment,
  moveWallEndpoint,
  moveWallPerpendicular,
  connectWalls,
  disconnectWallEndpoint,
  setWallLength,
  setWallEndPanel,
  setWallLanding,
  detachWallLanding,
  updateWall,
  deleteWall,
  setActiveWall,
  setActiveWallSide,
  flipWall,
  addRun,
  addSoffit,
  updateSoffit,
  setSoffitAnchor,
  deleteSoffit,
  addOpening,
  updateOpening,
  resizeOpening,
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
  joinRunEdges,
  setRunJointOffset,
  dissolveJoint,
  resizeRun,
  replaceWallLayout,
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
  setItemFace,
  setRoomStyle,
  setRunStyle,
  setRunFaceOptions,
  setItemStyle,
  setItemReveals,
  setFacePath,
  setSelection,
  clearSelection,
  setTool,
  setMessage,
  setView,
  updateSettings,
} = elevationSlice.actions;

export default elevationSlice.reducer;
