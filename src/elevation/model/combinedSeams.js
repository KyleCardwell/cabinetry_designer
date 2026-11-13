import { bandParts } from './bandParts.js';
import { combinedHiddenEdges, faceAcross } from './combinedElevations.js';
import { elevationParts } from './elevationParts.js';
import { wallParts } from './wallParts.js';

const EPSILON = 1e-6;

/** Merge overlapping { bottom, top } spans. */
function mergeSpans(spans) {
  const sorted = [...spans].sort((one, two) => one.bottom - two.bottom);
  return sorted.reduce((merged, span) => {
    const last = merged[merged.length - 1];
    if (last && span.bottom <= last.top + EPSILON) last.top = Math.max(last.top, span.top);
    else merged.push({ ...span });
    return merged;
  }, []);
}

/**
 * Where something runs across a seam between two faces (crown, an end panel past a wall end) or a soffit
 * joins the nearer face (Kyle 2026-10-23), neither face's edge is drawn: { left, right } spans by face key.
 * Anything straddling a seam is in front of the corner there, so no depth test is needed.
 */
export function seamHiddenEdges(combined, parts, joins) {
  const edges = combinedHiddenEdges(joins);
  for (const face of combined.faces) {
    for (const side of ['left', 'right']) {
      if (!faceAcross(combined, face, side)) continue;
      const x = side === 'left' ? face.dx : face.dx + face.length;
      const spans = parts.filter((part) => part.x < x - EPSILON && part.x + part.width > x + EPSILON)
        .map((part) => ({ bottom: Math.max(0, part.z), top: Math.min(face.height, part.z + part.height) }))
        .filter(({ bottom, top }) => top > bottom + EPSILON);
      if (!spans.length) continue;
      if (!edges.has(face.key)) edges.set(face.key, { left: [], right: [] });
      edges.get(face.key)[side].push(...spans);
    }
  }
  return new Map([...edges].map(([key, { left, right }]) => [key, { left: mergeSpans(left), right: mergeSpans(right) }])
    .filter(([, { left, right }]) => left.length || right.length));
}

/**
 * Every part the canvas draws on a combined elevation's faces, shifted to the elevation's x (Kyle 2026-10-23),
 * so seamHiddenEdges can hide the seams on screen as the DXF does. `cornerShapes` maps face key to its
 * combined corner shapes.
 */
export function combinedFaceParts(room, combined, settings, cornerShapes) {
  return combined.faces.flatMap((face) => {
    const wall = room.walls.find(({ id }) => id === face.wallId);
    return [
      ...elevationParts(room, wall, face.side, settings),
      ...bandParts(room, wall, face.side, settings),
      ...wallParts(room, wall, face.side, settings),
      ...(cornerShapes.get(face.key) ?? []).flatMap((shape) => shape.parts),
    ].map((part) => ({ ...part, x: part.x + face.dx }));
  });
}
