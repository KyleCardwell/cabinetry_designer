/** Pointer travel, in CSS pixels, before a press counts as a pan instead of a click. */
export const PAN_THRESHOLD_PX = 3;

/**
 * Whether a press has travelled far enough from where it started to be a pan.
 *
 * @param {{x: number, y: number}} origin  where the pointer went down
 * @param {{x: number, y: number}} point   where the pointer is now
 * @param {number} [threshold]             CSS pixels
 * @returns {boolean}
 */
export function panExceedsThreshold(origin, point, threshold = PAN_THRESHOLD_PX) {
  if (!origin || !point) return false;
  return Math.hypot(point.x - origin.x, point.y - origin.y) > threshold;
}
