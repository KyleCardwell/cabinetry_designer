import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../model/constants.js';

export const ELEVATION_STORAGE_KEY = 'cd.elevationLab.v1';
export const ELEVATION_SCHEMA_VERSION = 1;

const END_TYPES = new Set(['filler', 'end_panel', 'none']);
const ITEM_KINDS = new Set(['cabinet', 'filler']);
const RUN_TYPE_IDS = new Set([
  CABINET_TYPE_IDS.BASE,
  CABINET_TYPE_IDS.UPPER,
  CABINET_TYPE_IDS.TALL,
]);
const NUMERIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => typeof DEFAULT_SETTINGS[key] === 'number',
);

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

function isRun(run) {
  return Boolean(run)
    && typeof run.id === 'string'
    && RUN_TYPE_IDS.has(run.cabinetTypeId)
    && isFiniteNumber(run.x)
    && isFiniteNumber(run.width)
    && isFiniteNumber(run.z)
    && isFiniteNumber(run.height)
    && isFiniteNumber(run.depth)
    && isEnd(run.ends?.left)
    && isEnd(run.ends?.right)
    && typeof run.autoCount === 'boolean'
    && (run.maxCabinetWidth === null || isFiniteNumber(run.maxCabinetWidth))
    && Array.isArray(run.items)
    && run.items.every(isItem);
}

function isWall(wall) {
  return Boolean(wall)
    && typeof wall.id === 'string'
    && typeof wall.name === 'string'
    && isFiniteNumber(wall.length)
    && isFiniteNumber(wall.height)
    && Array.isArray(wall.runs)
    && wall.runs.every(isRun);
}

function isSettings(settings) {
  return Boolean(settings)
    && NUMERIC_SETTING_KEYS.every((key) => isFiniteNumber(settings[key]))
    && typeof settings.snapHeightsToDefaults === 'boolean'
    && END_TYPES.has(settings.defaultEnds?.left)
    && END_TYPES.has(settings.defaultEnds?.right);
}

function isElevationDocument(value) {
  if (!value || value.schemaVersion !== ELEVATION_SCHEMA_VERSION) return false;
  if (!isSettings(value.settings) || !Array.isArray(value.walls)) return false;
  if (!value.walls.every(isWall)) return false;
  if (value.activeWallId !== null && typeof value.activeWallId !== 'string') return false;
  return value.activeWallId === null
    || value.walls.some((wall) => wall.id === value.activeWallId);
}

/**
 * Load and validate the persisted elevation document.
 *
 * @returns {object|null}
 */
export function loadElevationDocument() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const serialized = window.localStorage.getItem(ELEVATION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    return isElevationDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Return only the document fields that belong in localStorage.
 *
 * @param {object} elevationState
 * @returns {object}
 */
export function toElevationDocument(elevationState) {
  return {
    schemaVersion: elevationState.schemaVersion,
    settings: elevationState.settings,
    walls: elevationState.walls,
    activeWallId: elevationState.activeWallId,
  };
}

/**
 * Persist an elevation document without allowing storage failures to escape.
 *
 * @param {object} elevationState
 * @returns {void}
 */
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

/**
 * Attach debounced elevation persistence to a Redux store.
 *
 * @param {{getState: Function, subscribe: Function}} store
 * @param {number} [delay]
 * @returns {Function}
 */
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
