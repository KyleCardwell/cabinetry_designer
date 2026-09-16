import { CABINET_TYPE_IDS } from './constants.js';

const OVERLAP_EPSILON = 1e-6;

function verticalStart(run) {
  return run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    ? 0
    : run.z;
}

/**
 * Determine whether two runs overlap horizontally and vertically.
 *
 * @param {object} a
 * @param {object} b
 * @param {object} settings
 * @returns {boolean}
 */
export function runsConflict(a, b, settings) {
  void settings;
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const verticalOverlap = Math.min(a.z + a.height, b.z + b.height)
    - Math.max(verticalStart(a), verticalStart(b));
  return horizontalOverlap > OVERLAP_EPSILON && verticalOverlap > 0;
}

/**
 * Validate that a run is inside a wall and does not conflict with another run.
 *
 * @param {object} wall
 * @param {object} run
 * @param {object} settings
 * @returns {{ok: boolean, reason: string|null}}
 */
export function validateRunPlacement(wall, run, settings) {
  const insideWall = run.width > 0
    && run.height > 0
    && run.x >= -OVERLAP_EPSILON
    && run.z >= -OVERLAP_EPSILON
    && run.x + run.width <= wall.length + OVERLAP_EPSILON
    && run.z + run.height <= wall.height + OVERLAP_EPSILON;

  if (!insideWall) return { ok: false, reason: 'out-of-bounds' };

  const conflict = wall.runs.some(
    (other) => other.id !== run.id && runsConflict(other, run, settings),
  );
  if (conflict) return { ok: false, reason: 'conflict' };

  return { ok: true, reason: null };
}
