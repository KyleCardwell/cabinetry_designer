/**
 * Soft alignment snapping shared by the plan and elevation canvases.
 *
 * Values are inches. `tolerance` is inches too — callers divide a pixel budget by the
 * current scale so the pull is constant on screen. Snapping is per-axis: each axis of a
 * point resolves against its own candidate list, independently of the others.
 */

const TIE_EPSILON = 1e-9;

/**
 * Snap one coordinate to the nearest candidate within tolerance.
 *
 * @param {number} value
 * @param {number[]} candidates
 * @param {number} tolerance
 * @returns {number|null} the candidate, or null when none is close enough
 */
export function snapAxis(value, candidates = [], tolerance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue;
    const distance = Math.abs(value - candidate);
    if (distance > tolerance + TIE_EPSILON) continue;
    if (distance < bestDistance - TIE_EPSILON
      || (Math.abs(distance - bestDistance) <= TIE_EPSILON && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snap a point's axes to nearby alignment candidates.
 *
 * @param {object} point     {x, y} in plan, {x, z} in elevation
 * @param {object} targets   candidate arrays keyed by the same axis names
 * @param {number} tolerance inches
 * @param {string[]} [axes]  axes allowed to snap; defaults to every key in targets
 * @returns {{point: object, guides: {axis: string, value: number}[]}}
 */
export function snapToAlignment(
  point,
  targets = {},
  tolerance = 0,
  axes = Object.keys(targets),
) {
  const snapped = { ...point };
  const guides = [];
  for (const axis of axes) {
    const value = snapAxis(point[axis], targets[axis], tolerance);
    if (value === null) continue;
    snapped[axis] = value;
    guides.push({ axis, value });
  }
  return { point: snapped, guides };
}

/** Alignment candidates from every wall endpoint, x and y kept separate. */
export function endpointAlignmentTargets(walls = [], excludeWallId = null) {
  const x = [];
  const y = [];
  for (const wall of walls) {
    if (wall.id === excludeWallId) continue;
    x.push(wall.x1, wall.x2);
    y.push(wall.y1, wall.y2);
  }
  return { x, y };
}

/** Alignment candidates from every run box on a wall, in wall-local x and z. */
export function runAlignmentTargets(wall, excludeRunId = null) {
  const x = [];
  const z = [];
  for (const run of wall?.runs ?? []) {
    if (run.id === excludeRunId) continue;
    x.push(run.x, run.x + run.width);
    z.push(run.z, run.z + run.height);
  }
  return { x, z };
}
