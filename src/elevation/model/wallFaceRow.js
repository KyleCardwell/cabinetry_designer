import { faceFeatures } from './faceFeatures.js';
import { uncoveredSpans } from './recesses.js';
import { wallSideFrame } from './wallSides.js';

const EPSILON = 1e-6;

/**
 * The plan dimension row along one face of a wall (SPEC-36.3.1), between the wall and its length:
 * each wing wall landing on that face and, on the front, each door or window from outside casing to
 * outside casing (its jamb when it has no casing), with the spaces between them and the face's ends.
 * Returns segments { start, end, kind: 'space' | 'landing' | 'opening' | 'recess' } left to right along the face,
 * or [] when the face has nothing to dimension.
 */
export function wallFaceSegments(room, wall, side, settings) {
  const { length } = wallSideFrame(room, wall, side);
  const features = faceFeatures(room, wall, side, settings);
  const spans = features
    .filter(({ kind }) => kind === 'landing')
    .map(({ x, width }) => ({ a: x, b: x + width, kind: 'landing' }));
  const openings = features
    .filter(({ kind }) => kind === 'opening')
    .map(({ x, width }) => ({ a: x, b: x + width, kind: 'opening' }));
  spans.push(...openings);
  // SPEC-38: each recess on this face at its width, split around the openings inside it.
  for (const { x, width } of features.filter(({ kind }) => kind === 'recess' || kind === 'projection')) {
    const inside = openings
      .filter((span) => span.a >= x - EPSILON && span.b <= x + width + EPSILON)
      .map((span) => ({ start: span.a, end: span.b }));
    for (const part of uncoveredSpans(x, x + width, inside)) {
      spans.push({ a: part.start, b: part.end, kind: 'recess' });
    }
  }
  if (spans.length === 0) return [];
  const segments = [];
  let cursor = 0;
  const push = (start, end, kind) => {
    if (end - start > EPSILON) segments.push({ start, end, kind });
  };
  for (const span of [...spans].sort((one, two) => one.a - two.a)) {
    const start = Math.max(cursor, Math.min(length, span.a));
    const end = Math.min(length, span.b);
    push(cursor, start, 'space');
    push(start, end, span.kind);
    cursor = Math.max(cursor, end);
  }
  push(cursor, length, 'space');
  return segments;
}
