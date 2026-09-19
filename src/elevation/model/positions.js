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
