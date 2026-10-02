import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { frontDepth, runBackOffset } from './corners.js';
import { wallSideOf } from './wallSides.js';

const OVERLAP_EPSILON = 1e-6;

export function verticalStart(run) {
  if (run.stack?.below) return run.z;
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
export function runsConflict(a, b, settings = DEFAULT_SETTINGS) {
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const verticalOverlap = Math.min(a.z + a.height, b.z + b.height)
    - Math.max(verticalStart(a), verticalStart(b));
  if (!(horizontalOverlap > OVERLAP_EPSILON && verticalOverlap > 0)) return false;
  // Runs on different planes (SPEC-38) only conflict where their plan depths overlap.
  if ((a._plane?.recessId ?? null) === (b._plane?.recessId ?? null)) return true;
  const depthOverlap = Math.min(frontDepth(a, settings), frontDepth(b, settings))
    - Math.max(runBackOffset(a), runBackOffset(b));
  return depthOverlap > OVERLAP_EPSILON;
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
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const insideWall = run.width > 0
    && run.height > 0
    && run.x >= -maxRunOverhang - OVERLAP_EPSILON
    && run.z >= -OVERLAP_EPSILON
    && run.x + run.width <= wall.length + maxRunOverhang + OVERLAP_EPSILON
    && run.z + run.height <= wall.height + OVERLAP_EPSILON;

  if (!insideWall) return { ok: false, reason: 'out-of-bounds' };

  const conflict = wall.runs.some(
    (other) => other.id !== run.id
      && wallSideOf(other) === wallSideOf(run)
      && runsConflict(other, run, settings),
  );
  if (conflict) return { ok: false, reason: 'conflict' };

  return { ok: true, reason: null };
}
