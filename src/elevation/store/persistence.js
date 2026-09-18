import { v4 as uuid } from 'uuid';
import {
  CABINET_TYPE_IDS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
} from '../model/constants.js';
import { wallFrame } from '../model/geometry.js';
import {
  computeWallOrder,
  normalizeWallName,
} from '../model/topology.js';

/** Current Elevation Lab localStorage key. */
export const ELEVATION_STORAGE_KEY = 'cd.elevationLab.v2';
/** Legacy storage key retained for migration and rollback safety. */
export const LEGACY_ELEVATION_STORAGE_KEY = 'cd.elevationLab.v1';
/** Current persisted schema version. */
export const ELEVATION_SCHEMA_VERSION = 2;

const END_TYPES = new Set(['filler', 'end_panel', 'none']);
const ITEM_KINDS = new Set(['cabinet', 'filler']);
const RUN_TYPE_IDS = new Set([
  CABINET_TYPE_IDS.BASE,
  CABINET_TYPE_IDS.UPPER,
  CABINET_TYPE_IDS.TALL,
]);
const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE);
const RUN_OVERRIDE_KEYS = [
  'toeKickHeight',
  'baseBoxHeight',
  'countertopThickness',
  'upperClearance',
  'boxTop',
];
const V1_NUMERIC_SETTING_KEYS = [
  'toeKickHeight',
  'baseBoxHeight',
  'baseDepth',
  'countertopThickness',
  'upperBottomZ',
  'upperBoxHeight',
  'upperDepth',
  'tallBoxHeight',
  'tallDepth',
  'roundTo',
  'maxCabinetWidth',
  'minCabinetWidth',
  'fillerMinWidth',
  'fillerWarnWidth',
  'endPanelThickness',
  'defaultInteriorFillerWidth',
  'minRunWidth',
];
const V2_NUMERIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => typeof DEFAULT_SETTINGS[key] === 'number',
);
const V2_DEFAULTED_SETTING_KEYS = [
  'autoEndPanelOnFreeEnd',
  'adjacentRunGap',
  'maxRunOverhang',
  'casingWidth',
  'casingThickness',
  'openingsHaveCasing',
  'defaultOpeningMeasureMode',
  'defaultDoorWidth',
  'defaultDoorHeight',
  'defaultWindowWidth',
  'defaultWindowHeight',
  'defaultWindowSillZ',
  'minOpeningWidth',
  'openingSnap',
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEnd(end) {
  return Boolean(end)
    && END_TYPES.has(end.type)
    && (end.width === null || isFiniteNumber(end.width));
}

function isItem(item) {
  return Boolean(item)
    && typeof item.id === 'string'
    && ITEM_KINDS.has(item.kind)
    && (item.width === null || isFiniteNumber(item.width));
}

function isV1Run(run) {
  return Boolean(run)
    && typeof run.id === 'string'
    && RUN_TYPE_IDS.has(run.cabinetTypeId)
    && ['x', 'width', 'z', 'height', 'depth'].every((key) => isFiniteNumber(run[key]))
    && isEnd(run.ends?.left)
    && isEnd(run.ends?.right)
    && typeof run.autoCount === 'boolean'
    && (run.maxCabinetWidth === null || isFiniteNumber(run.maxCabinetWidth))
    && Array.isArray(run.items)
    && run.items.every(isItem);
}

function isOptionalNumericObject(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => (
    allowedKeys.includes(key)
    && (entry === null || entry === undefined || isFiniteNumber(entry))
  ));
}

function isCompleteProfile(profile) {
  return Boolean(profile) && PROFILE_KEYS.every((key) => isFiniteNumber(profile[key]));
}

function isRun(run) {
  return isV1Run(run)
    && (run.heightMode === 'auto' || run.heightMode === 'manual')
    && isOptionalNumericObject(run.overrides, RUN_OVERRIDE_KEYS)
    && typeof run.anchors?.left === 'boolean'
    && typeof run.anchors?.right === 'boolean';
}

function isConnection(connection) {
  return connection === null || (
    Boolean(connection)
    && typeof connection.wallId === 'string'
    && (connection.endpoint === 'start' || connection.endpoint === 'end')
  );
}

/** Return whether a persisted wall opening has the v2 opening shape. */
export function isOpening(opening) {
  return Boolean(opening)
    && typeof opening.id === 'string'
    && (opening.kind === 'door' || opening.kind === 'window')
    && typeof opening.label === 'string'
    && (opening.measureMode === 'jamb' || opening.measureMode === 'casing')
    && ['width', 'height', 'sillZ', 'offset'].every(
      (key) => isFiniteNumber(opening[key]),
    )
    && (opening.offsetFrom === 'left' || opening.offsetFrom === 'right')
    && (opening.casing === null || (
      Boolean(opening.casing)
      && isFiniteNumber(opening.casing.width)
      && isFiniteNumber(opening.casing.thickness)
    ));
}

function isWall(wall) {
  return Boolean(wall)
    && typeof wall.id === 'string'
    && typeof wall.name === 'string'
    && (wall.numberOverride === null
      || (Number.isInteger(wall.numberOverride) && wall.numberOverride > 0))
    && ['x1', 'y1', 'x2', 'y2', 'height', 'thickness'].every(
      (key) => isFiniteNumber(wall[key]),
    )
    && typeof wall.flipped === 'boolean'
    && isConnection(wall.connections?.start)
    && isConnection(wall.connections?.end)
    && isOptionalNumericObject(wall.profile, PROFILE_KEYS)
    && Array.isArray(wall.runs)
    && wall.runs.every(isRun)
    && (wall.openings === undefined
      || (Array.isArray(wall.openings) && wall.openings.every(isOpening)));
}

function isRoom(room) {
  return Boolean(room)
    && typeof room.id === 'string'
    && typeof room.name === 'string'
    && isCompleteProfile(room.profile)
    && Array.isArray(room.walls)
    && Array.isArray(room.wallOrder)
    && room.wallOrder.length === room.walls.length
    && new Set(room.wallOrder).size === room.wallOrder.length
    && room.walls.every(isWall)
    && room.wallOrder.every((wallId) => room.walls.some((wall) => wall.id === wallId));
}

function normalizeV2Document(document) {
  if (!document || document.schemaVersion !== ELEVATION_SCHEMA_VERSION) return document;
  let settings = document.settings;
  if (settings && typeof settings === 'object') {
    settings = { ...settings };
    for (const key of V2_DEFAULTED_SETTING_KEYS) {
      if (settings[key] === undefined) settings[key] = DEFAULT_SETTINGS[key];
    }
  }
  return {
    ...document,
    settings,
    rooms: Array.isArray(document.rooms) ? document.rooms.map((room) => {
      if (!room || typeof room !== 'object') return room;
      const normalized = {
        ...room,
        walls: Array.isArray(room.walls) ? room.walls.map((wall) => (
          wall && typeof wall === 'object'
            ? {
              ...wall,
              name: normalizeWallName(wall.name),
              numberOverride: wall.numberOverride ?? null,
              openings: wall.openings === undefined ? [] : wall.openings,
            }
            : wall
        )) : room.walls,
      };
      if (Array.isArray(normalized.walls)) {
        normalized.wallOrder = computeWallOrder(
          normalized,
          Array.isArray(room.wallOrder) ? room.wallOrder : [],
        );
      }
      return normalized;
    }) : document.rooms,
  };
}

function hasValidEnds(settings) {
  return END_TYPES.has(settings.defaultEnds?.left)
    && END_TYPES.has(settings.defaultEnds?.right);
}

function isSettings(settings) {
  return Boolean(settings)
    && V2_NUMERIC_SETTING_KEYS.every((key) => isFiniteNumber(settings[key]))
    && isCompleteProfile(settings.defaultProfile)
    && typeof settings.snapHeightsToDefaults === 'boolean'
    && typeof settings.autoEndPanelOnFreeEnd === 'boolean'
    && typeof settings.openingsHaveCasing === 'boolean'
    && typeof settings.orthoWalls === 'boolean'
    && (settings.defaultOpeningMeasureMode === 'jamb'
      || settings.defaultOpeningMeasureMode === 'casing')
    && hasValidEnds(settings);
}

/** Return whether a value is a valid v2 elevation document. */
export function isElevationDocument(value) {
  if (!value || value.schemaVersion !== ELEVATION_SCHEMA_VERSION) return false;
  if (!isSettings(value.settings) || !Array.isArray(value.rooms)) return false;
  if (!value.rooms.every(isRoom)) return false;
  if (value.view !== 'plan' && value.view !== 'elevation') return false;
  if (value.activeRoomId !== null && typeof value.activeRoomId !== 'string') return false;
  const activeRoom = value.activeRoomId === null
    ? null
    : value.rooms.find((room) => room.id === value.activeRoomId);
  if (value.activeRoomId !== null && !activeRoom) return false;
  if (value.activeWallId !== null && typeof value.activeWallId !== 'string') return false;
  return value.activeWallId === null
    || Boolean(activeRoom?.walls.some((wall) => wall.id === value.activeWallId));
}

/** Return whether a value is a valid legacy v1 elevation document. */
export function isV1ElevationDocument(value) {
  if (!value || value.schemaVersion !== 1) return false;
  const settings = value.settings;
  if (!settings || !V1_NUMERIC_SETTING_KEYS.every((key) => isFiniteNumber(settings[key]))) {
    return false;
  }
  if (typeof settings.snapHeightsToDefaults !== 'boolean' || !hasValidEnds(settings)) return false;
  if (!Array.isArray(value.walls) || !value.walls.every((wall) => (
    Boolean(wall)
    && typeof wall.id === 'string'
    && typeof wall.name === 'string'
    && isFiniteNumber(wall.length)
    && isFiniteNumber(wall.height)
    && Array.isArray(wall.runs)
    && wall.runs.every(isV1Run)
  ))) return false;
  return value.activeWallId === null
    || (typeof value.activeWallId === 'string'
      && value.walls.some((wall) => wall.id === value.activeWallId));
}

/** Migrate a validated v1 document to the v2 room model. */
export function migrateV1Document(document) {
  const old = document.settings;
  const defaultProfile = {
    ...DEFAULT_PROFILE,
    toeKickHeight: old.toeKickHeight,
    baseBoxHeight: old.baseBoxHeight,
    countertopThickness: old.countertopThickness,
    upperClearance: old.upperBottomZ
      - (old.toeKickHeight + old.baseBoxHeight + old.countertopThickness),
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    defaultProfile,
    defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds, ...old.defaultEnds },
  };
  for (const key of V2_NUMERIC_SETTING_KEYS) {
    if (isFiniteNumber(old[key])) settings[key] = old[key];
  }
  settings.snapHeightsToDefaults = old.snapHeightsToDefaults;

  const room = {
    id: uuid(),
    name: 'Room 1',
    profile: { ...defaultProfile },
    wallOrder: [],
    walls: document.walls.map((wall, index) => ({
      id: wall.id,
      name: normalizeWallName(wall.name),
      numberOverride: null,
      x1: 0,
      y1: index * 60,
      x2: wall.length,
      y2: index * 60,
      height: wall.height,
      thickness: 4.5,
      flipped: false,
      connections: { start: null, end: null },
      profile: {},
      openings: [],
      runs: wall.runs.map((run) => ({
        ...run,
        ends: { left: { ...run.ends.left }, right: { ...run.ends.right } },
        items: run.items.map((item) => ({ ...item })),
        heightMode: 'manual',
        overrides: {},
        anchors: { left: false, right: false },
      })),
    })),
  };
  room.wallOrder = computeWallOrder(room, []);
  room.walls = room.walls.map((wall) => (
    wallFrame(room, wall).leftEndpoint === 'start' ? wall : { ...wall, flipped: true }
  ));

  return {
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings,
    rooms: [room],
    activeRoomId: room.id,
    activeWallId: document.activeWallId,
    view: 'elevation',
  };
}

function readStored(key) {
  try {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}

/** Load, validate, and when needed migrate the persisted elevation document. */
export function loadElevationDocument() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const current = normalizeV2Document(readStored(ELEVATION_STORAGE_KEY));
    if (isElevationDocument(current)) return current;
    const legacy = readStored(LEGACY_ELEVATION_STORAGE_KEY);
    return isV1ElevationDocument(legacy) ? migrateV1Document(legacy) : null;
  } catch {
    return null;
  }
}

/** Return only the v2 document fields that belong in localStorage. */
export function toElevationDocument(elevationState) {
  return {
    schemaVersion: elevationState.schemaVersion,
    settings: elevationState.settings,
    rooms: elevationState.rooms,
    activeRoomId: elevationState.activeRoomId,
    activeWallId: elevationState.activeWallId,
    view: elevationState.view,
  };
}

/** Persist a v2 elevation document without allowing storage failures to escape. */
export function persistElevationDocument(elevationState) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      ELEVATION_STORAGE_KEY,
      JSON.stringify(toElevationDocument(elevationState)),
    );
  } catch {
    // Storage may be unavailable, full, or disabled. The in-memory editor still works.
  }
}

/** Attach debounced elevation persistence to a Redux store. */
export function setupElevationPersistence(store, delay = 300) {
  let previous = store.getState().elevation;
  let timeoutId = null;

  return store.subscribe(() => {
    const current = store.getState().elevation;
    if (current === previous) return;
    previous = current;

    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      persistElevationDocument(current);
      timeoutId = null;
    }, delay);
  });
}
