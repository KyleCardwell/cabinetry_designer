import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import {
  gridLeaves,
  runItems,
} from '../../model/grid.js';
import { recessEndType } from '../../model/recesses.js';
import {
  compensateRuns,
  resolveWall,
  syncRoom,
} from '../../model/room.js';
import {
  resolveSoffitSpan,
  validateSoffitPlacement,
} from '../../model/soffits.js';
import {
  applyStandardDrawers,
  isInsetStyle,
  resolveStyle,
} from '../../model/styles.js';
import {
  wallSideOf,
  wallSideView,
  wallViewForRun,
} from '../../model/wallSides.js';

export function copySettings(settings = DEFAULT_SETTINGS) {
  return {
    ...settings,
    defaultProfile: { ...settings.defaultProfile },
    defaultEnds: { ...settings.defaultEnds },
    teamDoorStyle: structuredClone(settings.teamDoorStyle ?? DEFAULT_DOOR_STYLE),
    doorDesigns: structuredClone(settings.doorDesigns ?? DOOR_DESIGNS),
  };
}

export function withoutAuto(end) {
  const { auto, ...manualEnd } = end;
  void auto;
  return manualEnd;
}

export function createWall(name = '', y = 0, length = 144, values = {}) {
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

export function createRoom(name = 'Room 1', settings = DEFAULT_SETTINGS, id = uuid()) {
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

export function roomIndexFor(state, roomId) {
  return state.rooms.findIndex((room) => room.id === (roomId ?? state.activeRoomId));
}

export function roomFor(state, roomId) {
  return state.rooms[roomIndexFor(state, roomId)] ?? null;
}

export function wallLocation(state, payload = {}) {
  const roomIndex = roomIndexFor(state, payload.roomId);
  if (roomIndex === -1) return null;
  const room = state.rooms[roomIndex];
  const targetId = payload.wallId ?? payload.id ?? state.activeWallId;
  const wallIndex = room.walls.findIndex((wall) => wall.id === targetId);
  if (wallIndex === -1) return null;
  return { roomIndex, room, wallIndex, wall: room.walls[wallIndex] };
}

export function runLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const runIndex = location.wall.runs.findIndex((run) => run.id === payload.runId);
  return runIndex === -1
    ? null
    : { ...location, runIndex, run: location.wall.runs[runIndex] };
}

export function openingLocation(state, payload) {
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

export function soffitLocation(state, payload) {
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

export const RECESS_KEYS = [
  'label', 'kind', 'width', 'bottom', 'height', 'depth', 'offset', 'offsetFrom', 'offsetAnchor', 'molding',
];

export function recessLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const recessIndex = (location.wall.recesses ?? [])
    .findIndex((recess) => recess.id === payload.recessId);
  return recessIndex === -1
    ? null
    : { ...location, recessIndex, recess: location.wall.recesses[recessIndex] };
}

/** The side view a recess is validated in (SPEC-38). */
export function recessView(room, wall, recess) {
  return wallSideView(resolveWall(room, wall), wallSideOf(recess));
}

/** Re-pick the ends a run has anchored to recesses (all, or one recess's) after where it sits changes. */
export function refreshRecessEnds(wall, run, recessId = null) {
  for (const side of ['left', 'right']) {
    const anchor = run.anchors?.[side];
    if (anchor?.to !== 'recess' || (recessId && anchor.recessId !== recessId)) continue;
    run.ends[side] = { type: recessEndType(wallViewForRun(wall, run), run, side), width: null };
  }
}

export function resolvedSoffitCandidate(room, wall, soffit) {
  const resolvedWall = resolveWall(room, wall);
  const view = {
    ...wallSideView(resolvedWall, soffit.wallSide),
    length: resolvedWall.length,
  };
  const span = resolveSoffitSpan(room, view, soffit);
  const candidate = { ...soffit, ...span };
  return validateSoffitPlacement(view, candidate).ok ? candidate : null;
}

export function syncRoomAt(state, roomIndex) {
  state.rooms[roomIndex] = syncRoom(state.rooms[roomIndex], state.settings);
}

export function setCompensatedWalls(state, roomIndex, walls) {
  const oldRoom = state.rooms[roomIndex];
  state.rooms[roomIndex] = compensateRuns(oldRoom, { ...oldRoom, walls });
  syncRoomAt(state, roomIndex);
}

export const STYLE_FIELD_KEYS = ['cabinetStyleId', 'beadWidth', 'profiledEdge'];

/**
 * Copy only `keys` whose values are set (not null/undefined) and pass `accept`.
 * Returns null when nothing is left, which clears the stored field.
 */
export function cleanPartial(value, keys, accept = () => true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = keys
    .map((key) => [key, value[key]])
    .filter(([, entry]) => entry !== null && entry !== undefined && accept(entry));
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

export function roomCabinets(room) {
  return room.walls.flatMap((wall) => wall.runs.flatMap((run) => gridLeaves(run.grid)
    .filter((item) => item.kind === 'cabinet')
    .map((item) => ({ run, item }))));
}

/**
 * Run a style edit; every cabinet whose style switches between European and face frame
 * gets its small drawer fronts reset to the new style's standard height.
 */
export function withStandardDrawers(state, room, mutate) {
  const isInset = ({ run, item }) => isInsetStyle(resolveStyle(state.settings, room, run, item));
  const before = new Map(roomCabinets(room).map((entry) => [entry.item.id, isInset(entry)]));
  mutate();
  for (const entry of roomCabinets(room)) {
    const { run, item } = entry;
    if (!item.face || before.get(item.id) === isInset(entry)) continue;
    item.face = applyStandardDrawers(item.face, resolveStyle(state.settings, room, run, item), state.settings);
  }
}

export function itemIndexFor(run, itemId) {
  return runItems(run).findIndex((item) => item.id === itemId);
}

export function clearTransientSelection(state) {
  state.selection = {
    runId: null,
    pieceId: null,
    openingId: null,
    soffitId: null,
    recessId: null,
    wallId: state.view === 'elevation' ? state.activeWallId : null,
  };
  state.facePath = null;
}

export function activateRoom(state, room) {
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
