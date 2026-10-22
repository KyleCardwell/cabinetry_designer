import { cornerShapes } from './cornerParts.js';
import { transformOutline } from './sectionProfileOutline.js';

const EPSILON = 1e-6;
const PART_KINDS = {
  toeKick: 'toe_kick', countertop: 'countertop', topMold: 'top_mold', crown: 'crown',
  furnitureBase: 'furniture_base',
};

/** A touching end view carrying this band at this height, in the face's depth frame. */
export function profileBandJoint(getShapes, run, side, band, z, height, front) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  const facing = side === 'left' ? -1 : 1;
  const candidates = getShapes().filter((shape) => shape.kind === 'profile').flatMap((shape) => {
    const body = shape.parts.filter((part) => part.kind === 'profile'
      && Math.min(run.z + run.height, part.z + part.height) - Math.max(run.z, part.z) > EPSILON);
    if (body.length === 0) return [];
    const near = side === 'left' ? Math.max(...body.map((part) => part.x + part.width))
      : Math.min(...body.map((part) => part.x));
    if (Math.abs(near - edge) > EPSILON) return [];
    const faces = shape.parts.find((part) => part.id.endsWith(':faces'));
    if (!faces) return [];
    const part = shape.parts.find((part) => part.kind === PART_KINDS[band]
      && Math.abs(part.z - z) <= EPSILON
      && (band !== 'furnitureBase' || Math.abs(part.height - height) <= EPSILON));
    return part ? [{ part, faces, front: Math.max(...body.map((part) => part.front)) }] : [];
  });
  if (candidates.length === 0) return null;
  const neighbor = candidates.reduce((best, other) => other.front > best.front ? other : best);
  const { part, faces } = neighbor;
  if (front > neighbor.front + 1 / 32) return { part, relation: 'free' };
  const far = side === 'left' ? part.x : part.x + part.width;
  const face = side === 'left' ? faces.x : faces.x + faces.width;
  if (Math.abs(front - neighbor.front) <= 1 / 32) {
    return { part, relation: 'through', end: { type: 'return', x: far, side: face, facing,
      ...(part.outline ? { outline: part.outline } : {}) } };
  }
  // Reflect the neighbour's front profile onto its shared side, as for a deeper touching run.
  const outline = part.outline && transformOutline(part.outline, ([x, z]) => [edge + face - x, z], true);
  return { part, relation: 'cope', end: { type: 'cope', x: edge + face - far, side: edge, facing: -facing,
    ...(outline ? { outline } : {}) } };
}

/** The key prefix of the returns at one end of a run: its inside corner, or the wing wall it's anchored to. */
function returnPrefix(run, side) {
  const anchor = run.anchors?.[side];
  if (anchor === true) return `${side}:`;
  if (anchor?.to === 'wall') return `landing:${anchor.wallId}:${side}:`;
  return null;
}

/**
 * The cope's x and optional section outline at a corner return (SPEC-42.3), or null. A run whose end
 * is anchored into an inside corner (or to a wing wall) treats the return as the deeper run: when a
 * return carries the same band at the same height (a toe kick, or a countertop, top mold or crown with
 * the same bottom, or a furniture base with the same bottom and height), this run's band ends where
 * the return's does. `getShapes` gives cornerShapes for
 * the run's wall face (lazyCornerShapes).
 */
export function cornerBandEdge(getShapes, run, side, band, z, height) {
  const prefix = returnPrefix(run, side);
  if (!prefix) return null;
  const kind = PART_KINDS[band];
  const parts = getShapes()
    .filter((shape) => shape.kind === 'return' && shape.key.startsWith(prefix))
    .flatMap((shape) => shape.parts)
    .filter((part) => part.kind === kind && Math.abs(part.z - z) <= EPSILON
      && (band !== 'furnitureBase' || Math.abs(part.height - height) <= EPSILON));
  if (parts.length === 0) return null;
  const edgeOf = (part) => side === 'left' ? part.x + part.width : part.x;
  const part = parts.reduce((best, candidate) => (
    (side === 'left' ? edgeOf(candidate) > edgeOf(best) : edgeOf(candidate) < edgeOf(best))
      ? candidate : best));
  return { type: 'cope', x: edgeOf(part), ...(part.outline ? { outline: part.outline } : {}) };
}

/** cornerShapes for a resolved wall face, computed on first use. */
export function lazyCornerShapes(room, wall, settings) {
  let shapes = null;
  return () => {
    shapes ??= cornerShapes(room, wall, wall.side ?? 'front', settings, { throughBands: true });
    return shapes;
  };
}
