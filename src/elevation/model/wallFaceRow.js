import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;

/**
 * The plan dimension row along one face of a wall (SPEC-36.3.1), between the wall and its length:
 * each wing wall landing on that face and, on the front, each door or window from outside casing to
 * outside casing (its jamb when it has no casing), with the spaces between them and the face's ends.
 * Returns segments { start, end, kind: 'space' | 'landing' | 'opening' } left to right along the face,
 * or [] when the face has nothing to dimension.
 */
export function wallFaceSegments(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  const { length } = wallSideFrame(room, wall, side);
  const spans = landingsOn(room, view).map(({ a, b }) => ({ a, b, kind: 'landing' }));
  if (side === 'front') {
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, length, settings);
      const outside = geometry.casing ?? geometry.jamb;
      spans.push({ a: outside.x, b: outside.x + outside.width, kind: 'opening' });
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
