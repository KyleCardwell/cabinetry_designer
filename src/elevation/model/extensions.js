import { panelOrientation } from './cells.js';

/** Where a filler or panel can extend to, per direction (SPEC-35.3). */
export const EXTEND_TARGETS = {
  up: ['ceiling', 'run', 'by'],
  down: ['floor', 'run', 'by'],
  left: ['wall', 'run', 'by'],
  right: ['wall', 'run', 'by'],
};

/** Directions in the order they are applied. */
export const EXTEND_DIRECTIONS = ['up', 'down', 'left', 'right'];

const TARGET_KEYS = {
  floor: ['to'],
  ceiling: ['to'],
  wall: ['to'],
  run: ['to', 'runId'],
  by: ['to', 'amount'],
};

/** Whether a value is a valid extension target for one direction. */
export function isExtendTarget(direction, target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
  if (!EXTEND_TARGETS[direction]?.includes(target.to)) return false;
  if (Object.keys(target).some((key) => !TARGET_KEYS[target.to].includes(key))) return false;
  if (target.to === 'run') return typeof target.runId === 'string';
  if (target.to === 'by') {
    return typeof target.amount === 'number' && Number.isFinite(target.amount) && target.amount > 0;
  }
  return true;
}

/** Whether a stored `extend` is valid: undefined, or one or more valid directions. */
export function isExtend(extend) {
  if (extend === undefined) return true;
  if (!extend || typeof extend !== 'object' || Array.isArray(extend)) return false;
  const entries = Object.entries(extend);
  return entries.length > 0
    && entries.every(([direction, target]) => isExtendTarget(direction, target));
}

/** The directions a piece can extend: along its length. */
export function extendDirections(piece) {
  if (piece?.kind === 'end_panel' || piece?.kind === 'filler') return ['up', 'down'];
  const orientation = panelOrientation(piece);
  if (orientation === 'side') return ['up', 'down'];
  if (orientation === 'top') return ['left', 'right'];
  return [];
}
