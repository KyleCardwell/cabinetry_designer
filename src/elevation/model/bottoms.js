import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from './constants.js';

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
