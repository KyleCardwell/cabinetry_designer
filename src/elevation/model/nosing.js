import { frontContour } from './bandEnds.js';
import { sectionProfileOutline } from './sectionProfileOutline.js';
import { sectionProfileBounds } from './sectionProfiles.js';

const EPSILON = 1e-6;

/** Drop coincident points and straight-through joins, retaining curved segments. */
function simplifySection(points) {
  const outline = points.filter((point, i) => {
    const next = points[(i + 1) % points.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]) > EPSILON;
  });
  let changed = true;
  while (changed && outline.length > 3) {
    changed = false;
    for (let i = 0; i < outline.length; i += 1) {
      const previous = outline[(i + outline.length - 1) % outline.length];
      const point = outline[i];
      const next = outline[(i + 1) % outline.length];
      const a = [point[0] - previous[0], point[1] - previous[1]];
      const b = [next[0] - point[0], next[1] - point[1]];
      if (!previous[2] && !point[2] && Math.abs(a[0] * b[1] - a[1] * b[0]) <= EPSILON
        && a[0] * b[0] + a[1] * b[1] > 0) {
        outline.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return outline;
}

/** Nosing's forward projection; a profile without a closed loop keeps the plain top. */
export function nosingProjection(picked) {
  const outline = picked && sectionProfileOutline(picked.geometry);
  if (!outline) return 0;
  // Bound only the chosen loop, with exact arc extrema; other loops and open cuts aren't the top.
  const loop = picked.geometry.loops.find((candidate) => {
    const shape = sectionProfileOutline({ ...picked.geometry, loops: [candidate] });
    return shape?.length === outline.length
      && shape.every((point, i) => point.every((value, axis) => value === outline[i][axis]));
  });
  const points = Object.fromEntries(loop.segs.flatMap(({ from, to }) => [from, to])
    .map((id) => [id, picked.geometry.points[id]]));
  return Math.max(0, sectionProfileBounds({ geometry: { points, loops: [loop] } }).maxX);
}

/** Core plus the largest closed nosing loop, in profile coordinates at the core's front/top. */
export function woodTopSection(picked, thickness, back) {
  const loop = picked && sectionProfileOutline(picked.geometry);
  if (!loop) return null;
  const contour = frontContour(loop);
  const bottom = contour[0][1];
  const outline = simplifySection([
    [back, -thickness, 0], [0, -thickness, 0], [0, bottom, 0],
    ...contour, [back, 0, 0],
  ]);
  return { outline, minY: Math.min(-thickness, bottom) };
}
