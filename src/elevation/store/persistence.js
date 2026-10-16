import { isPlainObject } from '@reduxjs/toolkit';
import {
  CABINET_TYPE_IDS,
  DEFAULT_PROFILE,
  DEFAULT_PREFS,
  DEFAULT_SETTINGS,
  FRAME_JOINS,
} from '../model/constants.js';
import { isBottomPart } from '../model/bottoms.js';
import { cleanOverrides } from '../model/settingsResolve.js';
import { isDoorDesignList, migrateDoorDesign } from '../model/doorDesigns.js';
import { BUILT_IN_PULLS, PULL_KEYS, isPullList } from '../model/pulls.js';
import { isSectionProfileList, migrateSectionProfile } from '../model/sectionProfiles.js';
import {
  DEFAULT_DOOR_STYLE,
  DOOR_DESIGNS,
  DOOR_STYLE_KEYS,
  findDoorDesign,
  isDoorStyle,
  isDoorStyleList,
  isPartSizes,
  isStyleRef,
} from '../model/doorStyles.js';
import { isFaceNode } from '../model/faces.js';
import { MAX_SHELVES } from '../model/cellTree.js';
import { LEAF_KINDS, isGridShape, rootItems } from '../model/grid.js';
import { isExtend } from '../model/extensions.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  isStyle,
} from '../model/styles.js';
import { SOFFIT_MOLDINGS } from '../model/soffits.js';
import { RECESS_KINDS, RECESS_MOLDINGS } from '../model/recesses.js';
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
  panel: ['id', 'kind', 'depth', 'align', 'doors', 'extend', 'styleId', 'sizes', 'baseUnder'],
  void: ['id', 'kind', 'baseUnder'],
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
const PROFILE_PICK_KEYS = ['topMoldProfileId', 'crownProfileId', 'furnitureBaseProfileId', 'baseCutoutProfileId', 'nosingProfileId'];
const RUN_OVERRIDE_KEYS = [
  'toeKickHeight',
  'baseKind',
  'furnitureBaseProud',
  'furnitureBaseProfileId',
  'baseCutoutProfileId',
  'baseBoxHeight',
  'countertopThickness',
  'nosingProfileId',
  'upperClearance',
  'boxTop',
];
const V2_NUMERIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => typeof DEFAULT_SETTINGS[key] === 'number',
);
const V2_DEFAULTED_SETTING_KEYS = [
  'fillerReturnDepth',
  'fillerReturnThickness',
  'fillerThickness',
  'fillerReturnTongue',
  'teeCover',
  'teeThickness',
  'blindFillerWidth',
  'defaultSoffitDepth',
  'defaultSoffitMolding',
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
  'baseCutoutFoot',
  'baseCutoutHeight',
  'furnitureBaseScribe',
  'pullHeight',
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const TOP_OVERHANG_SIDES = ['front', 'back', 'left', 'right'];

function isTopOverhang(value) {
  return value === undefined || (Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([side, entry]) => TOP_OVERHANG_SIDES.includes(side)
      && isFiniteNumber(entry) && entry >= 0));
}

/** Keep only explicit, non-negative core-edge overhangs; an empty pick inherits defaults. */
function normalizeRunTopOverhang(run) {
  const { topOverhang, ...rest } = run;
  const entries = topOverhang && typeof topOverhang === 'object' && !Array.isArray(topOverhang)
    ? Object.entries(topOverhang).filter(([side, value]) => TOP_OVERHANG_SIDES.includes(side)
      && isFiniteNumber(value) && value >= 0)
    : [];
  return entries.length ? { ...rest, topOverhang: Object.fromEntries(entries) } : rest;
}

function isWaterfall(value) {
  return value === undefined || (Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([side, pick]) => ['left', 'right'].includes(side)
      && Boolean(pick) && typeof pick === 'object' && !Array.isArray(pick)
      && Object.entries(pick).every(([key, entry]) => key === 'baseToLeg' && entry === true)));
}

/** A side object enables its waterfall; only a true base-to-leg override is persisted. */
function normalizeRunWaterfall(run) {
  const { waterfall, ...rest } = run;
  const entries = waterfall && typeof waterfall === 'object' && !Array.isArray(waterfall)
    ? Object.entries(waterfall)
      .filter(([side, pick]) => ['left', 'right'].includes(side)
        && Boolean(pick) && typeof pick === 'object' && !Array.isArray(pick))
      .map(([side, pick]) => [side, pick.baseToLeg === true ? { baseToLeg: true } : {}])
    : [];
  return entries.length ? { ...rest, waterfall: Object.fromEntries(entries) } : rest;
}

function hasStyleRefs(node) {
  return DOOR_STYLE_KEYS.every((key) => isStyleRef(node[key]));
}

function hasPullRefs(node) {
  return Object.values(PULL_KEYS).every((key) => isStyleRef(node[key]));
}

function isPartPick(entry) {
  return isStyleRef(entry.styleId) && (entry.sizes === undefined || isPartSizes(entry.sizes));
}

function isEnd(end) {
  return Boolean(end)
    && isPartPick(end)
    && END_TYPES.has(end.type)
    && (end.width === null || isFiniteNumber(end.width))
    && (end.auto === undefined || typeof end.auto === 'boolean')
    && isExtend(end.extend);
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

const T_FILLER_SIDES = ['left', 'right', 'top', 'bottom'];

/** A cabinet's own T-filler choice per side (SPEC-37): true covers, false doesn't, absent inherits. */
function isTFillerSides(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, entry]) => T_FILLER_SIDES.includes(key) && typeof entry === 'boolean');
}

function isItem(item) {
  return Boolean(item)
    && hasStyleRefs(item)
    && hasPullRefs(item)
    && (item.pullHeight === undefined || item.pullHeight === null
      || (item.kind === 'cabinet' && isFiniteNumber(item.pullHeight) && item.pullHeight > 0))
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
      || (item.kind === 'cabinet' && isOptionalNumericObject(item.reveals, REVEAL_KEYS)))
    && (item.tFiller === undefined || (item.kind === 'cabinet' && isTFillerSides(item.tFiller)));
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

function isReportText(value, maxLength) {
  return typeof value === 'string' && value === value.trim() && value.length <= maxLength;
}

function isReportParts(value) {
  const limits = { name: 60, boxes: 120, note: 200 };
  return isPlainObject(value) && Object.values(value).every((entry) => (
    isPlainObject(entry)
    && Object.keys(entry).length > 0
    && Object.entries(entry).every(([field, text]) => (
      field === 'shopBuilt' ? text === true
        : Object.hasOwn(limits, field) && isReportText(text, limits[field]) && text.length > 0
    ))
  ));
}

function isCompleteProfile(profile, profileKeys = PROFILE_KEYS) {
  return Boolean(profile) && profileKeys.every((key) => {
    if (PROFILE_PICK_KEYS.includes(key)) return isMoldingProfileId(profile[key]);
    if (key === 'baseKind') return isBaseKind(profile[key]);
    if (key === 'furnitureBaseProud') return isFurnitureBaseProud(profile[key]);
    if (key === 'topMoldOverhang' && profile[key] === undefined) return true;
    return isFiniteNumber(profile[key]);
  });
}

function isMoldingProfileId(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.length > 0);
}

function isBaseKind(value) {
  return value === undefined || value === null || value === 'toe_kick' || value === 'furniture_base';
}

function isFurnitureBaseProud(value) {
  return value === undefined || value === null || (isFiniteNumber(value) && value >= 0);
}

function isOptionalHeightProfile(value, profileKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => {
    if (!profileKeys.includes(key)) return false;
    if (PROFILE_PICK_KEYS.includes(key)) return isMoldingProfileId(entry);
    if (key === 'baseKind') return isBaseKind(entry);
    if (key === 'furnitureBaseProud') return isFurnitureBaseProud(entry);
    return entry === null || entry === undefined || isFiniteNumber(entry);
  });
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
    || (anchor.to === 'recess'
      && typeof anchor.recessId === 'string'
      && (anchor.edge === 'left' || anchor.edge === 'right')
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
  ));
}

const T_FILLER_RUN_VALUES = ['seams', 'all'];
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
    && (side.tFiller === undefined || side.tFiller === null || typeof side.tFiller === 'boolean')
    && (side.cornerLap === undefined || side.cornerLap === 'over' || side.cornerLap === 'into')
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

/** SPEC-50.6 cutouts keep cabinet references even when their cabinets are gone. */
export function isBaseCutoutList(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return Array.from(value).every((cutout) => {
    if (!cutout || typeof cutout !== 'object' || Array.isArray(cutout)
      || !['id', 'from', 'to'].every((key) => typeof cutout[key] === 'string' && cutout[key].length > 0)
      || ids.has(cutout.id)
      || (cutout.width !== undefined && !(isFiniteNumber(cutout.width) && cutout.width > 0))
      || ['left', 'right'].some((key) => cutout[key] !== undefined
        && !(isFiniteNumber(cutout[key]) && cutout[key] >= 0))
      || ['width', 'left', 'right'].every((key) => cutout[key] !== undefined)
      || (cutout.profileId !== undefined && cutout.profileId !== null && typeof cutout.profileId !== 'string')) return false;
    ids.add(cutout.id);
    return true;
  });
}

function isRun(run) {
  return Boolean(run)
    && hasStyleRefs(run)
    && hasPullRefs(run)
    && typeof run.id === 'string'
    && RUN_TYPE_IDS.has(run.cabinetTypeId)
    && ['x', 'width', 'z', 'height', 'depth'].every((key) => isFiniteNumber(run[key]))
    && isEnd(run.ends?.left)
    && isEnd(run.ends?.right)
    && typeof run.autoCount === 'boolean'
    && (run.maxCabinetWidth === null || isFiniteNumber(run.maxCabinetWidth))
    && (run.heightMode === 'auto' || run.heightMode === 'manual')
    && isOptionalHeightProfile(run.overrides, RUN_OVERRIDE_KEYS)
    && isRunAnchor(run.anchors?.left)
    && isRunAnchor(run.anchors?.right)
    && isStyle(run.style)
    && (run.wallSide === undefined || run.wallSide === 'front' || run.wallSide === 'back')
    && (run.upperBottom === undefined || UPPER_BOTTOM_OPTIONS.includes(run.upperBottom))
    && (run.hanging === undefined || run.hanging === true)
    && (run.top === undefined || RUN_TOP_OPTIONS.includes(run.top))
    && isTopOverhang(run.topOverhang)
    && isWaterfall(run.waterfall)
    && (run.bottom === undefined || (Array.isArray(run.bottom) && run.bottom.every(isBottomPart)))
    && isRunStack(run.stack)
    && (run.outset === undefined || (isFiniteNumber(run.outset) && run.outset >= 0))
    && (run.recessId === undefined || typeof run.recessId === 'string')
    && (run.seamGap === undefined || (isFiniteNumber(run.seamGap) && run.seamGap >= 0))
    && (run.tFiller === undefined || T_FILLER_RUN_VALUES.includes(run.tFiller))
    && isEndFiller(run.endFiller)
    && (run.baseCutouts === undefined || isBaseCutoutList(run.baseCutouts))
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
    && LEAF_KIND_SET.has(leaf.kind) && isLeafBlind(leaf.blind)
    && (leaf.baseUnder === undefined
      || (['void', 'panel'].includes(leaf.kind) && leaf.baseUnder === true));
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
    && (leaf.kind !== 'panel' || isExtend(leaf.extend))
    && (leaf.kind !== 'panel' || isPartPick(leaf))
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
  if (item.kind === 'filler') {
    return isItem(item) && item.depth === undefined && item.align === undefined && isExtend(item.extend);
  }
  if (item.kind === 'cabinet') return isItem(item) && isCellDepth(item);
  const { width, gap, ...leaf } = item;
  void gap;
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
    ))
    && (opening.recessId === undefined || typeof opening.recessId === 'string');
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
        && isPartPick(endPanels[endpoint])
        && Object.hasOwn(endPanels[endpoint], 'width')
        && (endPanels[endpoint].width === null
          || (isFiniteNumber(endPanels[endpoint].width) && endPanels[endpoint].width >= 0))
        && (endPanels[endpoint].frame === undefined
          || FRAME_JOINS.includes(endPanels[endpoint].frame))
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

function isRecess(recess) {
  return Boolean(recess)
    && typeof recess.id === 'string'
    && RECESS_KINDS.includes(recess.kind)
    && typeof recess.label === 'string'
    && (recess.wallSide === 'front' || recess.wallSide === 'back')
    && (recess.offsetFrom === 'left' || recess.offsetFrom === 'right')
    && (recess.offsetAnchor === 'edge' || recess.offsetAnchor === 'center')
    && ['offset', 'width', 'bottom', 'depth'].every((key) => isFiniteNumber(recess[key]))
    && recess.width > 0
    && recess.depth > 0
    && recess.bottom >= 0
    && (recess.height === null || (isFiniteNumber(recess.height) && recess.height > 0))
    && RECESS_MOLDINGS.includes(recess.molding);
}

function isWall(wall, profileKeys = PROFILE_KEYS) {
  return Boolean(wall)
    && hasStyleRefs(wall)
    && hasPullRefs(wall)
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
    && isOptionalHeightProfile(wall.profile, profileKeys)
    && Array.isArray(wall.runs)
    && wall.runs.every(isRun)
    && (wall.openings === undefined
      || (Array.isArray(wall.openings) && wall.openings.every(isOpening)))
    && (wall.soffits === undefined
      || (Array.isArray(wall.soffits) && wall.soffits.every(isSoffit)))
    && (wall.recesses === undefined
      || (Array.isArray(wall.recesses) && wall.recesses.every(isRecess)))
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

export function isRoom(room, profileKeys = PROFILE_KEYS) {
  return Boolean(room)
    && (room.settingsOverrides === undefined || isPlainObject(room.settingsOverrides))
    && (room.doorDetails === undefined || typeof room.doorDetails === 'boolean')
    && (room.doorStyleTags === undefined || typeof room.doorStyleTags === 'boolean')
    && (room.swingMarks === undefined || typeof room.swingMarks === 'boolean')
    && isDoorStyleList(room.doorStyles)
    && hasStyleRefs(room)
    && typeof room.id === 'string'
    && typeof room.name === 'string'
    && isOptionalHeightProfile(room.profile, profileKeys)
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
      || isPartNumberOverrides(room.partNumberOverrides))
    && (room.reportParts === undefined || isReportParts(room.reportParts))
    && (room.reportNote === undefined || isReportText(room.reportNote, 400));
}

function migrateDoorPanel(style) {
  return style?.panel?.thickness === 0.25
    ? { ...style, panel: { ...style.panel, thickness: 0.5 } }
    : style;
}

function migrateAppliedMoldings(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)
    || !style.profiles || typeof style.profiles !== 'object' || Array.isArray(style.profiles)) return style;
  const { applied, ...profiles } = style.profiles;
  return {
    ...style,
    profiles,
    appliedMoldings: style.appliedMoldings === undefined
      ? (applied == null ? [] : [{ profileId: applied, offset: 0 }])
      : style.appliedMoldings,
  };
}

/** Migrate molding picks in every room and phase scope without changing the saved document. */
function migrateAppliedMoldingScopes(scope) {
  if (!scope || typeof scope !== 'object') return scope;
  const migrated = { ...scope };
  if (Array.isArray(scope.doorStyles)) migrated.doorStyles = scope.doorStyles.map(migrateAppliedMoldings);
  for (const key of ['rooms', 'phases']) {
    if (Array.isArray(scope[key])) migrated[key] = scope[key].map(migrateAppliedMoldingScopes);
  }
  return migrated;
}

/** Migrate style lists in room and phase scopes without mutating the saved document. */
function migrateDoorPanelScopes(scope) {
  if (!scope || typeof scope !== 'object') return scope;
  const migrated = { ...scope };
  if (Array.isArray(scope.doorStyles)) migrated.doorStyles = scope.doorStyles.map(migrateDoorPanel);
  for (const key of ['rooms', 'phases']) {
    if (Array.isArray(scope[key])) migrated[key] = scope[key].map(migrateDoorPanelScopes);
  }
  return migrated;
}

function migrateDoorDesignRef(style) {
  return style?.designId === 'slab-applied' ? { ...style, designId: 'slab-mdf' } : style;
}

/** Rename design references in every room and phase style list. */
function migrateDoorDesignScopes(scope) {
  if (!scope || typeof scope !== 'object') return scope;
  const migrated = { ...scope };
  if (Array.isArray(scope.doorStyles)) migrated.doorStyles = scope.doorStyles.map(migrateDoorDesignRef);
  for (const key of ['rooms', 'phases']) {
    if (Array.isArray(scope[key])) migrated[key] = scope[key].map(migrateDoorDesignScopes);
  }
  return migrated;
}

function normalizeDocument(document, schemaVersion) {
  if (!document || document.schemaVersion !== schemaVersion) return document;
  document = migrateAppliedMoldingScopes(document);
  document = migrateDoorDesignScopes(document);
  let settings = document.settings;
  if (settings && typeof settings === 'object') {
    settings = { ...settings };
    for (const key of V2_DEFAULTED_SETTING_KEYS) {
      if (settings[key] === undefined) settings[key] = DEFAULT_SETTINGS[key];
    }
    for (const key of Object.keys(DEFAULT_PREFS)) delete settings[key];
    if (!Object.hasOwn(settings, 'stoneTopReveal')) {
      const base = settings.faceReveals?.[CABINET_TYPE_IDS.BASE];
      if (base?.top === 0.25) {
        settings.faceReveals = {
          ...settings.faceReveals,
          [CABINET_TYPE_IDS.BASE]: { ...base, top: 0.125 },
        };
      }
      settings.stoneTopReveal = DEFAULT_SETTINGS.stoneTopReveal;
    }
    if (settings.teamDoorStyle === undefined) {
      const thickness = Number.isFinite(settings.doorThickness) && settings.doorThickness > 0
        ? settings.doorThickness
        : DEFAULT_DOOR_STYLE.thickness;
      settings.teamDoorStyle = { ...structuredClone(DEFAULT_DOOR_STYLE), thickness };
    }
    if (!Object.hasOwn(settings, 'doorPanelDefault')) {
      settings.teamDoorStyle = migrateDoorPanel(settings.teamDoorStyle);
      document = migrateDoorPanelScopes(document);
      settings.doorPanelDefault = 0.5;
    }
    settings.teamDoorStyle = migrateAppliedMoldings(settings.teamDoorStyle);
    settings.teamDoorStyle = migrateDoorDesignRef(settings.teamDoorStyle);
    if (settings.doorDesigns === undefined) settings.doorDesigns = structuredClone(DOOR_DESIGNS);
    else if (Array.isArray(settings.doorDesigns)) {
      settings.doorDesigns = settings.doorDesigns.map(migrateDoorDesign);
      for (const seed of DOOR_DESIGNS) {
        if (!settings.doorDesigns.some((design) => design?.id === seed.id)) {
          settings.doorDesigns.push(structuredClone(seed));
        }
      }
    }
    if (settings.pulls === undefined) settings.pulls = structuredClone(BUILT_IN_PULLS);
    else if (Array.isArray(settings.pulls)) {
      settings.pulls = [...settings.pulls];
      for (const seed of BUILT_IN_PULLS) {
        if (!settings.pulls.some((pull) => pull?.id === seed.id)) {
          settings.pulls.push(structuredClone(seed));
        }
      }
    }
    if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];
    else if (Array.isArray(settings.sectionProfiles)) settings.sectionProfiles = settings.sectionProfiles.map(migrateSectionProfile);
    delete settings.doorThickness;
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
      if (isPlainObject(room.settingsOverrides)) {
        const overrides = cleanOverrides(room.settingsOverrides, 'room');
        if (Object.keys(overrides).length) normalized.settingsOverrides = overrides;
        else delete normalized.settingsOverrides;
      }
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
        reportParts: room.reportParts ?? {},
        reportNote: room.reportNote ?? '',
        profile: isPlainObject(room.profile) ? Object.fromEntries(
          Object.entries(room.profile).filter(([key, value]) => (
            !Object.hasOwn(normalized.settings?.defaultProfile ?? {}, key)
            || value !== normalized.settings.defaultProfile[key]
          )),
        ) : room.profile,
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
                ...normalizeRunWaterfall(normalizeRunTopOverhang(run)),
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
    && isDoorStyle(settings.teamDoorStyle)
    && settings.teamDoorStyle.id === 'default'
    && isDoorDesignList(settings.doorDesigns)
    && isPullList(settings.pulls)
    && isSectionProfileList(settings.sectionProfiles)
    && findDoorDesign(settings.teamDoorStyle.designId, settings.doorDesigns) !== null
    && V2_NUMERIC_SETTING_KEYS.every((key) => isFiniteNumber(settings[key]))
    && isCompleteProfile(settings.defaultProfile, profileKeys)
    && typeof settings.snapHeightsToDefaults === 'boolean'
    && typeof settings.autoEndPanelOnFreeEnd === 'boolean'
    && typeof settings.openingsHaveCasing === 'boolean'
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

/** One room as it is stored (localStorage and the shop's `design_rooms.document`): derived fields left out. */
export function toRoomDocument(room) {
  return {
    ...room,
    walls: room.walls.map((wall) => {
      const { _endPanelThickness, ...persistedWall } = wall;
      void _endPanelThickness;
      return {
        ...persistedWall,
        runs: wall.runs.map((run) => {
          const { _pinWidths, _seamGap, _frame, _plane, _doorThickness, _endThickness, _cornerLapWidth, ...persistedRun } = run;
          void _pinWidths;
          void _seamGap;
          void _frame;
          void _plane;
          void _doorThickness;
          void _endThickness;
          // Save the original span, so loading a free-ended run applies its lap exactly once.
          if (_cornerLapWidth) persistedRun.width -= _cornerLapWidth;
          return normalizeRunWaterfall(normalizeRunTopOverhang(persistedRun));
        }),
      };
    }),
  };
}

/**
 * A stored room document → a room ready for the editor (older fields filled in), or a
 * readable failure. `settings` only feeds the same load-time migrations a full document gets.
 * → { ok: true, room } | { ok: false, reason: 'bad_document' | 'schema', message }
 */
export function roomFromDocument(document, schemaVersion, settings) {
  if (typeof schemaVersion === 'number' && schemaVersion > ELEVATION_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema', message: 'This room was saved by a newer version of the designer. Reload the page to update, then open it again.' };
  }
  if (schemaVersion !== ELEVATION_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema', message: `This room uses an unsupported older format (version ${schemaVersion}).` };
  }
  if (!isPlainObject(document)) {
    return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
  }
  try {
    const normalized = normalizeElevationDocument({
      schemaVersion, settings, rooms: [structuredClone(document)], activeRoomId: null, activeWallId: null, view: 'plan',
    });
    const room = normalized?.rooms?.[0];
    if (!isRoom(room)) return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
    return { ok: true, room };
  } catch {
    return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
  }
}

/** Return only the current document fields that belong in localStorage. */
export function toElevationDocument(elevationState) {
  return {
    schemaVersion: elevationState.schemaVersion,
    settings: Object.fromEntries(Object.entries(elevationState.settings)
      .filter(([key]) => !Object.hasOwn(DEFAULT_PREFS, key))),
    rooms: elevationState.rooms.map(toRoomDocument),
    activeRoomId: elevationState.activeRoomId,
    activeWallId: elevationState.activeWallId,
    view: elevationState.view,
  };
}

/** Persist a current elevation document without allowing storage failures to escape. */
export function persistElevationDocument(elevationState) {
  // Shop (Supabase) data and issued versions never overwrite this browser's sandbox document (SPEC-DB4, DB8a).
  if (elevationState?.source === 'cloud' || elevationState?.source === 'version') return;
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
