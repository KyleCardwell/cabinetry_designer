import { cornerShapes } from './cornerParts.js';

const EPSILON = 1e-6;
const PART_KINDS = {
  toeKick: 'toe_kick', countertop: 'countertop', topMold: 'top_mold', crown: 'crown',
};

/** The key prefix of the returns at one end of a run: its inside corner, or the wing wall it's anchored to. */
function returnPrefix(run, side) {
  const anchor = run.anchors?.[side];
  if (anchor === true) return `${side}:`;
  if (anchor?.to === 'wall') return `landing:${anchor.wallId}:${side}:`;
  return null;
}

/**
 * Where a band meets a corner return's band at one end of a run (SPEC-42.3), or null. A run whose end
 * is anchored into an inside corner (or to a wing wall) treats the return as the deeper run: when a
 * return carries the same band at the same height (a toe kick, or a countertop, top mold or crown with
 * the same bottom), this run's band ends where the return's does. `getShapes` gives cornerShapes for
 * the run's wall face (lazyCornerShapes).
 */
export function cornerBandEdge(getShapes, run, side, band, z) {
  const prefix = returnPrefix(run, side);
  if (!prefix) return null;
  const kind = PART_KINDS[band];
  const parts = getShapes()
    .filter((shape) => shape.kind === 'return' && shape.key.startsWith(prefix))
    .flatMap((shape) => shape.parts)
    .filter((part) => part.kind === kind && Math.abs(part.z - z) <= EPSILON);
  if (parts.length === 0) return null;
  return side === 'left'
    ? Math.max(...parts.map((part) => part.x + part.width))
    : Math.min(...parts.map((part) => part.x));
}

/** cornerShapes for a resolved wall face, computed on first use. */
export function lazyCornerShapes(room, wall, settings) {
  let shapes = null;
  return () => {
    shapes ??= cornerShapes(room, wall, wall.side ?? 'front', settings);
    return shapes;
  };
}
