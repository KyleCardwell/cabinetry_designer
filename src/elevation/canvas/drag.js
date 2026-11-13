import { DEFAULT_SETTINGS } from '../model/constants.js';
import { roundTo } from '../model/units.js';
import { screenToWall } from './transform.js';

const DRAW_SNAP = 0.5;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Clamp a wall point to the wall and snap it to the drawing increment.
 *
 * @param {{x: number, z: number}} point
 * @param {{length: number, height: number}} wall
 * @param {number} [step]
 * @param {number} [maxRunOverhang]
 * @returns {{x: number, z: number}}
 */
export function clampAndSnapWallPoint(
  point,
  wall,
  step = DRAW_SNAP,
  maxRunOverhang = DEFAULT_SETTINGS.maxRunOverhang,
) {
  const minimumX = -maxRunOverhang;
  const maximumX = wall.length + maxRunOverhang;
  return {
    x: clamp(
      roundTo(clamp(point.x, minimumX, maximumX), step),
      minimumX,
      maximumX,
    ),
    z: clamp(roundTo(clamp(point.z, 0, wall.height), step), 0, wall.height),
  };
}

/**
 * Convert a screen point to a clamped, snapped wall point.
 *
 * @param {{x: number, y: number}} point
 * @param {{length: number, height: number}} wall
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} transform
 * @param {number} [step]
 * @param {number} [maxRunOverhang]
 * @returns {{x: number, z: number}}
 */
export function screenPointToWallSnapped(
  point,
  wall,
  transform,
  step = DRAW_SNAP,
  maxRunOverhang = DEFAULT_SETTINGS.maxRunOverhang,
) {
  return clampAndSnapWallPoint(
    screenToWall(point, transform),
    wall,
    step,
    maxRunOverhang,
  );
}

/**
 * Normalize two wall points into createRun input, regardless of drag direction.
 *
 * @param {{x: number, z: number}} start
 * @param {{x: number, z: number}} end
 * @returns {{x: number, width: number, bottomZ: number, topZ: number}}
 */
export function dragPointsToRunInput(start, end) {
  const x = Math.min(start.x, end.x);
  const bottomZ = Math.min(start.z, end.z);
  return {
    x,
    width: Math.abs(end.x - start.x),
    bottomZ,
    topZ: Math.max(start.z, end.z),
  };
}
