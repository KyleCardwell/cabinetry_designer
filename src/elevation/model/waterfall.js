import { bandOutline } from './bandEnds.js';
import { outlineBounds } from './sectionProfileOutline.js';

/** Join the top band and its floor legs, keeping the other end's contour intact. */
export function waterfallBand(band, edges, ends, run, thickness, surface, overhangs) {
  const width = band.height;
  const legs = [ends.left && {
    outer: run.x - overhangs.left - thickness, direction: 1,
  }, ends.right && {
    outer: run.x + run.width + overhangs.right + thickness, direction: -1,
  }].map((leg) => leg && { ...leg, inner: leg.outer + leg.direction * width });
  const contours = edges.map((edge, i) => legs[i]
    ? [[legs[i].inner, band.z, 0], [legs[i].outer, surface, 0]] : edge);
  const outline = bandOutline(...contours, band.z, width);
  // bandOutline starts at the left bottom, then follows the right contour upward.
  if (legs[1]) outline.splice(2, 0, [legs[1].inner, 0, 0], [legs[1].outer, 0, 0]);
  if (legs[0]) outline.unshift([legs[0].outer, 0, 0], [legs[0].inner, 0, 0]);
  const lines = legs.filter(Boolean).map(({ outer, inner }) => ({
    x1: outer, z1: surface, x2: inner, z2: band.z,
  }));
  for (const line of band.lines ?? []) {
    const xs = legs.map((leg, i) => leg
      ? leg.outer + leg.direction * (surface - line.z1) : (i === 0 ? line.x1 : line.x2));
    lines.push({ ...line, x1: xs[0], x2: xs[1] });
    legs.forEach((leg, i) => {
      if (leg) lines.push({ x1: xs[i], z1: 0, x2: xs[i], z2: line.z1 });
    });
  }
  const { minX, maxX } = outlineBounds(outline);
  return { x: minX, z: 0, width: maxX - minX, height: surface, outline, lines };
}
