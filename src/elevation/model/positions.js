/** Return all wall-end and span-anchor readouts for a wall-local span. */
export function positionReadouts(start, width, wallLength) {
  return {
    left: {
      edge: start,
      center: start + width / 2,
    },
    right: {
      edge: wallLength - start - width,
      center: wallLength - start - width / 2,
    },
  };
}

/** Resolve a wall-local span start from one of its four position readouts. */
export function startFromReadout(from, anchor, value, width, wallLength) {
  if (from === 'right') {
    return wallLength - value - (anchor === 'center' ? width / 2 : width);
  }
  return value - (anchor === 'center' ? width / 2 : 0);
}

/** The stretch directions a width input can use. */
export const GROW_ENDS = ['left', 'both', 'right'];

/**
 * New start for a span whose width changes: 'right' keeps the left edge, 'left' keeps the
 * right edge, 'both' keeps the center.
 */
export function stretchedStart(start, width, nextWidth, grow) {
  const delta = nextWidth - width;
  if (grow === 'left') return start - delta;
  if (grow === 'both') return start - delta / 2;
  return start;
}
