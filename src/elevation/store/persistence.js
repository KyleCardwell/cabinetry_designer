import {
  CABINET_TYPE_IDS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
} from '../model/constants.js';
import { isBottomPart } from '../model/bottoms.js';
import { isFaceNode } from '../model/faces.js';
import { MAX_SHELVES } from '../model/cellTree.js';
import { LEAF_KINDS, isGridShape, rootItems } from '../model/grid.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  isStyle,
} from '../model/styles.js';
import { SOFFIT_MOLDINGS } from '../model/soffits.js';
import {
  computeWallOrder,
  normalizeWallName,
} from '../model/topology.js';

/** Current Elevation Lab localStorage key. */
export const ELEVATION_STORAGE_KEY = 'cd.elevationLab.v4';
/** Current persisted schema version. */
export const ELEVATION_SCHEMA_VERSION = 4;

const END_TYPES = new Set(['filler', 'end_panel', 'none', 'blind']);
const ITEM_KINDS = new Set(['cabinet', 'filler']);
const LEAF_KIND_SET = new Set(LEAF_KINDS);
/** Keys each non-cabinet cell kind may carry. */
const CELL_KIND_KEYS = {
  panel: ['id', 'kind', 'depth', 'align', 'doors'],
  void: ['id', 'kind'],
  shelves: ['id', 'kind', 'depth', 'align', 'shelves'],
};
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
const RUN_OVERRIDE_KEYS = [
  'toeKickHeight',
  'baseBoxHeight',
  'countertopThickness',
  'upperClearance',
  'boxTop',
];
const V2_NUMERIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => typeof DEFAULT_SETTINGS[key] === 'number',
);
const V2_DEFAULTED_SETTING_KEYS = [
  'fillerReturnDepth',
  'fillerReturnThickness',
  'blindFillerWidth',
  'defaultSoffitDepth',
  'defaultSoffitMolding',
  'autoEndPanelOnFreeEnd',
  'showPartNumbers',
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
  'stackedUpperBottom',
  'stackedLowerTop',
  'floatingShelfThickness',
  'standardDrawerHeights',
  'standardDrawerBelow',
  'belowRunOverhang',
  'belowRunFlushReveal',
  'bottomPartHeights',
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

function isOptionalNumericObject(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => (
    allowedKeys.includes(key)
    && (entry === null || entry === undefined || isFiniteNumber(entry))
  ));
}

function isPartNumberOverrides(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((number) => Number.isInteger(number) && number > 0);
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
    || (anchor.to === 'wall'
      && typeof anchor.wallId === 'string')
    || (anchor.to === 'soffit'
      && typeof anchor.soffitId === 'string'
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
    || (anchor.to === 'follow'
      && typeof anchor.runId === 'string'
      && (anchor.side === 'left' || anchor.side === 'right')
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
  ));
}

const END_FILLER_MINIMUMS = { width: 0, returnDepth: -1 };

function isEndFillerSide(side) {
  return side === undefined || side === null || (
    Boolean(side)
    && typeof side === 'object'
    && !Array.isArray(side)
    && ['width', 'returnDepth'].every((key) => (
      side[key] === undefined
      || side[key] === null
      || (isFiniteNumber(side[key]) && side[key] > END_FILLER_MINIMUMS[key])
    ))
  );
}

function isEndFiller(endFiller) {
  return endFiller === undefined
    || (Boolean(endFiller)
      && typeof endFiller === 'object'
      && !Array.isArray(endFiller)
      && isEndFillerSide(endFiller.left)
      && isEndFillerSide(endFiller.right));
}

function isStackLink(link) {
  return link === null || (Boolean(link) && typeof link === 'object'
    && typeof link.runId === 'string'
    && (link.offset === null || isFiniteNumber(link.offset)));
}

function isRunStack(stack) {
  return stack === undefined || (Boolean(stack) && typeof stack === 'object' && !Array.isArray(stack)
    && Object.keys(stack).every((key) => key === 'below' || key === 'above')
    && isStackLink(stack.below ?? null)
    && isStackLink(stack.above ?? null));
}

function isRun(run) {
  return Boolean(run)
    && typeof run.id === 'string'
    && RUN_TYPE_IDS.has(run.cabinetTypeId)
    && ['x', 'width', 'z', 'height', 'depth'].every((key) => isFiniteNumber(run[key]))
    && isEnd(run.ends?.left)
    && isEnd(run.ends?.right)
    && typeof run.autoCount === 'boolean'
    && (run.maxCabinetWidth === null || isFiniteNumber(run.maxCabinetWidth))
    && (run.heightMode === 'auto' || run.heightMode === 'manual')
    && isOptionalNumericObject(run.overrides, RUN_OVERRIDE_KEYS)
    && isRunAnchor(run.anchors?.left)
    && isRunAnchor(run.anchors?.right)
    && isStyle(run.style)
    && (run.wallSide === undefined || run.wallSide === 'front' || run.wallSide === 'back')
    && (run.upperBottom === undefined || UPPER_BOTTOM_OPTIONS.includes(run.upperBottom))
    && (run.top === undefined || RUN_TOP_OPTIONS.includes(run.top))
    && (run.bottom === undefined || (Array.isArray(run.bottom) && run.bottom.every(isBottomPart)))
    && isRunStack(run.stack)
    && (run.outset === undefined || (isFiniteNumber(run.outset) && run.outset >= 0))
    && isEndFiller(run.endFiller)
    && run.items === undefined
    && run.blind === undefined
    && isRunGrid(run.grid);
}

function isLeafBlind(blind) {
  return blind === undefined || (
    Boolean(blind) && typeof blind === 'object' && !Array.isArray(blind)
    && Object.keys(blind).length > 0
    && Object.entries(blind).every(([side, width]) => (
      (side === 'left' || side === 'right') && isFiniteNumber(width) && width > 0
    )));
}

function isLeaf(leaf) {
  return Boolean(leaf) && typeof leaf.id === 'string'
    && LEAF_KIND_SET.has(leaf.kind) && isLeafBlind(leaf.blind);
}

function isShelves(shelves) {
  return Boolean(shelves) && typeof shelves === 'object' && !Array.isArray(shelves)
    && Object.keys(shelves).every((key) => key === 'count' || key === 'back')
    && Number.isInteger(shelves.count) && shelves.count >= 1 && shelves.count <= MAX_SHELVES
    && typeof shelves.back === 'boolean';
}

function isCellDepth(leaf) {
  return (leaf.depth === undefined || (isFiniteNumber(leaf.depth) && leaf.depth > 0))
    && (leaf.align === undefined || leaf.align === 'face' || leaf.align === 'back');
}

/** SPEC-34 cells: cabinets as before, plus panel, void and shelves; depth and align on any but a void. */
function isCellLeaf(leaf) {
  if (!isCellDepth(leaf)) return false;
  if (leaf.kind === 'cabinet') return isItem({ ...leaf, width: null });
  const keys = CELL_KIND_KEYS[leaf.kind];
  return Boolean(keys)
    && Object.keys(leaf).every((key) => keys.includes(key))
    && (leaf.kind !== 'panel'
      || leaf.doors === undefined
      || leaf.doors === 'cover'
      || leaf.doors === 'flush')
    && (leaf.kind !== 'shelves' || isShelves(leaf.shelves));
}

/** SPEC-33 nested grids: one column of 2+ rows or one row of 2+ columns, no spans. */
function isCellGrid(grid) {
  const stack = grid.cols.length === 1 && grid.rows.length >= 2;
  const row = grid.rows.length === 1 && grid.cols.length >= 2;
  return (stack || row) && grid.cells.every((cell) => (
    cell.colSpan === 1 && cell.rowSpan === 1
    && ('cols' in cell.node ? isCellGrid(cell.node) : isCellLeaf(cell.node))
  ));
}

/** SPEC-34.1: a top-level column may be a cabinet, a filler, or any cell kind. */
function isRootItem(item) {
  if (item.kind === 'filler') return isItem(item) && item.depth === undefined && item.align === undefined;
  if (item.kind === 'cabinet') return isItem(item) && isCellDepth(item);
  const { width, ...leaf } = item;
  return (width === null || (isFiniteNumber(width) && width > 0)) && isCellLeaf(leaf);
}

/** Round 34.1: the root is one row with no spans; a root cell may be any kind. */
function isRunGrid(grid) {
  return isGridShape(grid, isLeaf)
    && grid.rows.length === 1
    && grid.cells.every((cell) => (
      cell.colSpan === 1 && cell.rowSpan === 1
      && (!('cols' in cell.node) || isCellGrid(cell.node))
    ))
    && rootItems(grid).every(isRootItem);
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

function isEndPanels(endPanels) {
  return Boolean(endPanels)
    && typeof endPanels === 'object'
    && !Array.isArray(endPanels)
    && ['start', 'end'].every((endpoint) => (
      Object.hasOwn(endPanels, endpoint)
      && (endPanels[endpoint] === null || (
        Boolean(endPanels[endpoint])
        && typeof endPanels[endpoint] === 'object'
        && !Array.isArray(endPanels[endpoint])
        && Object.hasOwn(endPanels[endpoint], 'width')
        && (endPanels[endpoint].width === null
          || (isFiniteNumber(endPanels[endpoint].width) && endPanels[endpoint].width >= 0))
      ))
    ));
}

function isLandings(landings) {
  return Boolean(landings)
    && typeof landings === 'object'
    && !Array.isArray(landings)
    && ['start', 'end'].every((endpoint) => (
      Object.hasOwn(landings, endpoint)
      && (landings[endpoint] === null || (
        Boolean(landings[endpoint])
        && typeof landings[endpoint] === 'object'
        && !Array.isArray(landings[endpoint])
        && typeof landings[endpoint].wallId === 'string'
        && (landings[endpoint].side === 'front' || landings[endpoint].side === 'back')
        && typeof landings[endpoint].ref === 'string'
        && ['near', 'far', 'center'].includes(landings[endpoint].to)
        && isFiniteNumber(landings[endpoint].offset)
      ))
    ));
}

function isSoffitAnchor(anchor) {
  return anchor === false || (Boolean(anchor)
    && (anchor.offset === null || isFiniteNumber(anchor.offset))
    && (anchor.to === 'end'
      || (anchor.to === 'wall' && typeof anchor.wallId === 'string')));
}

function isSoffit(soffit) {
  return Boolean(soffit)
    && typeof soffit.id === 'string'
    && (soffit.wallSide === 'front' || soffit.wallSide === 'back')
    && ['x', 'width', 'bottom', 'depth'].every((key) => isFiniteNumber(soffit[key]))
    && SOFFIT_MOLDINGS.includes(soffit.molding)
    && isSoffitAnchor(soffit.anchors?.left)
    && isSoffitAnchor(soffit.anchors?.right);
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
    && (wall.soffits === undefined
      || (Array.isArray(wall.soffits) && wall.soffits.every(isSoffit)))
    && (wall.joints === undefined
      || (Array.isArray(wall.joints) && wall.joints.every((joint) => (
        Boolean(joint)
        && typeof joint.id === 'string'
        && isFiniteNumber(joint.x)
        && (joint.wallSide === undefined || joint.wallSide === 'front' || joint.wallSide === 'back')
      ))))
    && (wall.endPanels === undefined || isEndPanels(wall.endPanels))
    && (wall.landings === undefined || isLandings(wall.landings));
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
    && room.wallOrder.every((wallId) => room.walls.some((wall) => wall.id === wallId))
    && (room.partNumberStart === undefined
      || (Number.isInteger(room.partNumberStart) && room.partNumberStart > 0))
    && (room.partNumberOverrides === undefined
      || isPartNumberOverrides(room.partNumberOverrides));
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

/** Fill fields added within the current schema while retaining compatibility. */
export function normalizeElevationDocument(document) {
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
        partNumberStart: room.partNumberStart ?? 1,
        partNumberOverrides: room.partNumberOverrides ?? {},
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
    && (settings.showPartNumbers === undefined || typeof settings.showPartNumbers === 'boolean')
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

function readStored(key) {
  try {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}

/** Load and validate the persisted elevation document. */
export function loadElevationDocument() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const current = normalizeElevationDocument(readStored(ELEVATION_STORAGE_KEY));
    return isElevationDocument(current) ? current : null;
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
