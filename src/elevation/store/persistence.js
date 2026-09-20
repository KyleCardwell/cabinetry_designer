import { v4 as uuid } from 'uuid';
import {
  CABINET_TYPE_IDS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
} from '../model/constants.js';
import { isFaceNode } from '../model/faces.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  isStyle,
} from '../model/styles.js';
import { wallFrame } from '../model/geometry.js';
import {
  computeWallOrder,
  normalizeWallName,
} from '../model/topology.js';

/** Current Elevation Lab localStorage key. */
export const ELEVATION_STORAGE_KEY = 'cd.elevationLab.v3';
/** Previous storage key retained for migration and rollback safety. */
export const V2_ELEVATION_STORAGE_KEY = 'cd.elevationLab.v2';
/** Original storage key retained for migration and rollback safety. */
export const LEGACY_ELEVATION_STORAGE_KEY = 'cd.elevationLab.v1';
/** Current persisted schema version. */
export const ELEVATION_SCHEMA_VERSION = 3;

const END_TYPES = new Set(['filler', 'end_panel', 'none']);
const ITEM_KINDS = new Set(['cabinet', 'filler']);
const PIN_ANCHORS = new Set(['center', 'left', 'right']);
const PIN_DATUMS = new Set(['left', 'right', 'opening']);
const OPENING_PIN_ANCHORS = new Set([
  'center',
  'casing-left',
  'casing-right',
  'jamb-left',
  'jamb-right',
]);
const RUN_TYPE_IDS = new Set([
  CABINET_TYPE_IDS.BASE,
  CABINET_TYPE_IDS.UPPER,
  CABINET_TYPE_IDS.TALL,
]);
const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE);
const V2_PROFILE_KEYS = PROFILE_KEYS
  .filter((key) => key !== 'crownStackHeight')
  .concat('crownOverlap');
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
  'casingClearance',
  'pairDoorAboveWidth',
  'faceReveals',
  'defaultStyle',
  'insetFrame',
  'profiledFit',
  'woodTopReveal',
  'capturedSingleReveal',
  'standardDrawerHeights',
  'standardDrawerBelow',
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEnd(end) {
  return Boolean(end)
    && END_TYPES.has(end.type)
    && (end.width === null || isFiniteNumber(end.width))
    && (end.auto === undefined || typeof end.auto === 'boolean');
}

function isItemPin(pin) {
  return Boolean(pin)
    && PIN_ANCHORS.has(pin.anchor)
    && PIN_DATUMS.has(pin.from)
    && (pin.openingId === null || typeof pin.openingId === 'string')
    && (pin.from !== 'opening' || typeof pin.openingId === 'string')
    && OPENING_PIN_ANCHORS.has(pin.openingAnchor)
    && isFiniteNumber(pin.value);
}

function isItem(item) {
  return Boolean(item)
    && typeof item.id === 'string'
    && ITEM_KINDS.has(item.kind)
    && (item.width === null || isFiniteNumber(item.width))
    && (item.pin === undefined || item.pin === null
      || (item.kind === 'cabinet' && isItemPin(item.pin)))
    && (item.absorb === undefined
      || (item.kind === 'cabinet' && typeof item.absorb === 'boolean'))
    && (item.face === undefined || item.face === null
      || (item.kind === 'cabinet' && isFaceNode(item.face)))
    && (item.style === undefined || item.style === null
      || (item.kind === 'cabinet' && isStyle(item.style)))
    && (item.reveals === undefined || item.reveals === null
      || (item.kind === 'cabinet' && isOptionalNumericObject(item.reveals, REVEAL_KEYS)));
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

function isCompleteProfile(profile, profileKeys = PROFILE_KEYS) {
  return Boolean(profile) && profileKeys.every((key) => isFiniteNumber(profile[key]));
}

function isRunAnchor(anchor) {
  return typeof anchor === 'boolean' || (Boolean(anchor) && (
    (anchor.to === 'opening'
      && typeof anchor.openingId === 'string'
      && (anchor.edge === 'casing' || anchor.edge === 'jamb')
      && (anchor.clearance === null || isFiniteNumber(anchor.clearance)))
    || (anchor.to === 'joint'
      && typeof anchor.jointId === 'string'
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
  ));
}

function isRun(run) {
  return isV1Run(run)
    && (run.heightMode === 'auto' || run.heightMode === 'manual')
    && isOptionalNumericObject(run.overrides, RUN_OVERRIDE_KEYS)
    && isRunAnchor(run.anchors?.left)
    && isRunAnchor(run.anchors?.right)
    && isStyle(run.style)
    && (run.upperBottom === undefined || UPPER_BOTTOM_OPTIONS.includes(run.upperBottom))
    && (run.top === undefined || RUN_TOP_OPTIONS.includes(run.top));
}

function isConnection(connection) {
  return connection === null || (
    Boolean(connection)
    && typeof connection.wallId === 'string'
    && (connection.endpoint === 'start' || connection.endpoint === 'end')
  );
}

/** Validate a persisted opening, including pre-anchor v2/v3 documents. */
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
    && (opening.offsetAnchor === undefined
      || opening.offsetAnchor === 'edge'
      || opening.offsetAnchor === 'center')
    && (opening.casing === null || (
      Boolean(opening.casing)
      && isFiniteNumber(opening.casing.width)
      && isFiniteNumber(opening.casing.thickness)
    ));
}

function isWall(wall, profileKeys = PROFILE_KEYS) {
  return Boolean(wall)
    && typeof wall.id === 'string'
    && typeof wall.name === 'string'
    && (wall.numberOverride === null
      || (Number.isInteger(wall.numberOverride) && wall.numberOverride > 0))
    && typeof wall.elevationForced === 'boolean'
    && ['x1', 'y1', 'x2', 'y2', 'height', 'thickness'].every(
      (key) => isFiniteNumber(wall[key]),
    )
    && typeof wall.flipped === 'boolean'
    && isConnection(wall.connections?.start)
    && isConnection(wall.connections?.end)
    && isOptionalNumericObject(wall.profile, profileKeys)
    && Array.isArray(wall.runs)
    && wall.runs.every(isRun)
    && (wall.openings === undefined
      || (Array.isArray(wall.openings) && wall.openings.every(isOpening)))
    && (wall.joints === undefined
      || (Array.isArray(wall.joints) && wall.joints.every((joint) => (
        Boolean(joint)
        && typeof joint.id === 'string'
        && isFiniteNumber(joint.x)
      ))));
}

function isRoom(room, profileKeys = PROFILE_KEYS) {
  return Boolean(room)
    && typeof room.id === 'string'
    && typeof room.name === 'string'
    && isCompleteProfile(room.profile, profileKeys)
    && isStyle(room.style)
    && Array.isArray(room.walls)
    && Array.isArray(room.wallOrder)
    && room.wallOrder.length === room.walls.length
    && new Set(room.wallOrder).size === room.wallOrder.length
    && room.walls.every((wall) => isWall(wall, profileKeys))
    && room.wallOrder.every((wallId) => room.walls.some((wall) => wall.id === wallId));
}

function normalizeDocument(document, schemaVersion) {
  if (!document || document.schemaVersion !== schemaVersion) return document;
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
              elevationForced: wall.elevationForced ?? false,
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

/** Fill fields added within schema v3 while retaining v3 compatibility. */
export function normalizeV3Document(document) {
  const normalized = normalizeDocument(document, ELEVATION_SCHEMA_VERSION);
  if (!normalized || normalized.schemaVersion !== ELEVATION_SCHEMA_VERSION) {
    return normalized;
  }
  return {
    ...normalized,
    rooms: Array.isArray(normalized.rooms) ? normalized.rooms.map((room) => {
      if (!room || typeof room !== 'object') return room;
      return {
        ...room,
        walls: Array.isArray(room.walls) ? room.walls.map((wall) => {
          if (!wall || typeof wall !== 'object') return wall;
          const joints = wall.joints === undefined ? [] : wall.joints;
          const jointIds = new Set(
            Array.isArray(joints) ? joints.map((joint) => joint?.id) : [],
          );
          return {
            ...wall,
            joints,
            openings: Array.isArray(wall.openings) ? wall.openings.map((opening) => (
              opening && typeof opening === 'object'
                ? {
                    ...opening,
                    offsetAnchor: opening.offsetAnchor === undefined
                      ? 'edge'
                      : opening.offsetAnchor,
                }
                : opening
            )) : wall.openings,
            runs: Array.isArray(wall.runs) ? wall.runs.map((run) => {
              if (!run || typeof run !== 'object') return run;
              return {
                ...run,
                anchors: run.anchors && typeof run.anchors === 'object'
                  ? Object.fromEntries(Object.entries(run.anchors).map(([side, anchor]) => [
                      side,
                      anchor?.to === 'joint' && !jointIds.has(anchor.jointId)
                        ? false
                        : anchor,
                    ]))
                  : run.anchors,
              };
            }) : wall.runs,
          };
        }) : room.walls,
      };
    }) : normalized.rooms,
  };
}

function hasValidEnds(settings) {
  return END_TYPES.has(settings.defaultEnds?.left)
    && END_TYPES.has(settings.defaultEnds?.right);
}

function isSettings(settings, profileKeys = PROFILE_KEYS) {
  return Boolean(settings)
    && V2_NUMERIC_SETTING_KEYS.every((key) => isFiniteNumber(settings[key]))
    && isCompleteProfile(settings.defaultProfile, profileKeys)
    && typeof settings.snapHeightsToDefaults === 'boolean'
    && typeof settings.autoEndPanelOnFreeEnd === 'boolean'
    && typeof settings.openingsHaveCasing === 'boolean'
    && typeof settings.orthoWalls === 'boolean'
    && (settings.defaultOpeningMeasureMode === 'jamb'
      || settings.defaultOpeningMeasureMode === 'casing')
    && hasValidEnds(settings);
}

/** Return whether a value is a valid current elevation document. */
export function isElevationDocument(value) {
  if (!value || value.schemaVersion !== ELEVATION_SCHEMA_VERSION) return false;
  if (!isSettings(value.settings) || !Array.isArray(value.rooms)) return false;
  if (!value.rooms.every((room) => isRoom(room))) return false;
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

/** Return whether a value is a valid legacy v2 elevation document. */
export function isV2ElevationDocument(value) {
  if (!value || value.schemaVersion !== 2) return false;
  if (!isSettings(value.settings, V2_PROFILE_KEYS) || !Array.isArray(value.rooms)) {
    return false;
  }
  if (!value.rooms.every((room) => isRoom(room, V2_PROFILE_KEYS))) return false;
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

function migrateProfile(profile, inheritedProfile = {}) {
  const resolved = { ...inheritedProfile, ...profile };
  const migrated = {
    ...profile,
    crownStackHeight: resolved.topMoldHeight
      + resolved.crownHeight
      - resolved.crownOverlap,
  };
  delete migrated.crownOverlap;
  return migrated;
}

/** Migrate a validated v2 document from crown overlap to crown total height. */
export function migrateV2Document(document) {
  return {
    ...document,
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings: {
      ...document.settings,
      defaultProfile: migrateProfile(document.settings.defaultProfile),
    },
    rooms: document.rooms.map((room) => ({
      ...room,
      profile: migrateProfile(room.profile, document.settings.defaultProfile),
      walls: room.walls.map((wall) => ({
        ...wall,
        profile: migrateProfile(wall.profile, room.profile),
      })),
    })),
  };
}

/** Migrate a validated v1 document to the current room model. */
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
      elevationForced: false,
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
    const current = normalizeV3Document(readStored(ELEVATION_STORAGE_KEY));
    if (isElevationDocument(current)) return current;
    const previous = normalizeDocument(readStored(V2_ELEVATION_STORAGE_KEY), 2);
    if (isV2ElevationDocument(previous)) {
      return normalizeV3Document(migrateV2Document(previous));
    }
    const legacy = readStored(LEGACY_ELEVATION_STORAGE_KEY);
    return isV1ElevationDocument(legacy) ? migrateV1Document(legacy) : null;
  } catch {
    return null;
  }
}

/** Return only the current document fields that belong in localStorage. */
export function toElevationDocument(elevationState) {
  return {
    schemaVersion: elevationState.schemaVersion,
    settings: elevationState.settings,
    rooms: elevationState.rooms.map((room) => ({
      ...room,
      walls: room.walls.map((wall) => ({
        ...wall,
        runs: wall.runs.map((run) => {
          const { _pinWidths, ...persistedRun } = run;
          void _pinWidths;
          return persistedRun;
        }),
      })),
    })),
    activeRoomId: elevationState.activeRoomId,
    activeWallId: elevationState.activeWallId,
    view: elevationState.view,
  };
}

/** Persist a current elevation document without allowing storage failures to escape. */
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
