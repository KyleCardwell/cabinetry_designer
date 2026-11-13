import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';

/** What can hang below a run, listed top to bottom in run.bottom. */
export const BOTTOM_PART_KINDS = ['light_rail', 'light_trough', 'panel', 'bottom_cap', 'corbels'];
/** How the doors meet a part below the run (REV-011). */
export const BOTTOM_PART_DOORS = ['cover', 'flush', 'visible'];
/** Parts the doors never cover. */
export const UNCOVERABLE_BOTTOM_PARTS = ['bottom_cap', 'corbels'];

export const BOTTOM_PART_LABELS = {
  light_rail: 'Light rail',
  light_trough: 'Light trough',
  panel: 'Panel',
  bottom_cap: 'Bottom cap',
  corbels: 'Corbels',
};

const DEFAULT_DOORS = {
  light_rail: 'cover',
  light_trough: 'cover',
  panel: 'cover',
  bottom_cap: 'visible',
  corbels: 'visible',
};

/** Whether a value is a valid stored part below a run. */
export function isBottomPart(part) {
  return Boolean(part) && typeof part === 'object' && !Array.isArray(part)
    && typeof part.id === 'string'
    && BOTTOM_PART_KINDS.includes(part.kind)
    && typeof part.height === 'number' && Number.isFinite(part.height) && part.height > 0
    && BOTTOM_PART_DOORS.includes(part.doors)
    && !(part.doors === 'cover' && UNCOVERABLE_BOTTOM_PARTS.includes(part.kind));
}

/** A new part of one kind, at the shop's default height and door setting. */
export function createBottomPart(kind, settings) {
  const heights = { ...DEFAULT_SETTINGS.bottomPartHeights, ...settings?.bottomPartHeights };
  return { id: uuid(), kind, height: heights[kind], doors: DEFAULT_DOORS[kind] };
}

/**
 * On a face frame upper these leading parts are the frame's bottom rail (SPEC-46.2.1).
 * Callers only use this for face frame runs; the style isn't checked here.
 */
export function frameBottomParts(run) {
  const result = { height: 0, doors: null, count: 0 };
  if (run.cabinetTypeId !== CABINET_TYPE_IDS.UPPER) return result;
  for (const part of run.bottom ?? []) {
    if (!['cover', 'flush'].includes(part.doors) || UNCOVERABLE_BOTTOM_PARTS.includes(part.kind)) break;
    result.height += part.height;
    result.doors ??= part.doors;
    result.count += 1;
  }
  return result;
}

/** The parts below a run, top to bottom, each with the z of its bottom edge. */
export function runBottomParts(run) {
  const { height, count } = frameBottomParts(run);
  const extra = run._frame ? Math.max(0, run._frame.drop - height) : 0;
  let top = run.z - extra;
  return (run.bottom ?? []).map((part, index) => {
    top -= part.height;
    return { ...part, z: top, ...(run._frame && index < count ? { behind: true } : {}) };
  });
}

/** The total height of the parts below a run. */
export function runBottomHeight(run) {
  return (run.bottom ?? []).reduce((total, part) => total + part.height, 0);
}

/** How far below the box an upper's clearance is measured to (SPEC-46.2.1). */
export function runBelowBox(run) {
  const extra = run._frame ? Math.max(0, run._frame.drop - frameBottomParts(run).height) : 0;
  return extra + runBottomHeight(run);
}

/**
 * REV-011: the bottom reveal the parts below a run give the cabinets at its bottom, or null for the
 * standard reveal. Covered parts count from the top down to the first part the doors don't cover.
 */
export function belowRunReveal(run, settings) {
  const parts = run.bottom ?? [];
  let covered = 0;
  for (const part of parts) {
    if (part.doors !== 'cover') break;
    covered += part.height;
  }
  if (covered > 0) {
    return -covered + (settings.belowRunOverhang ?? DEFAULT_SETTINGS.belowRunOverhang);
  }
  if (parts[0]?.doors === 'flush') {
    return settings.belowRunFlushReveal ?? DEFAULT_SETTINGS.belowRunFlushReveal;
  }
  return null;
}

/**
 * Where the parts below a run start and end along the wall: inside the run's end panels, unless the
 * doors stop flush above the parts (then they run under them). They always run under fillers.
 * `band` is the full span the parts would take ({ start, end }).
 */
export function bottomPartSpan(run, pieces, band, underEndPanels) {
  if (underEndPanels) return band;
  const left = pieces.find((piece) => piece.kind === 'end_panel' && piece.x <= run.x + 1e-6);
  const right = pieces.find((piece) => piece.kind === 'end_panel'
    && piece.x + piece.width >= run.x + run.width - 1e-6);
  return {
    start: left ? Math.max(band.start, left.x + left.width) : band.start,
    end: right ? Math.min(band.end, right.x) : band.end,
  };
}
