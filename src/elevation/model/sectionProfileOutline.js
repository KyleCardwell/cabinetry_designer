const FULL_TURN = Math.PI * 2;
const MAX_ANGLE = Math.PI / 12;

/** Flatten a chained loop, keeping exact endpoints and at most 15 degrees per arc segment. */
function flattenLoop(loop, points) {
  const outline = [points[loop.segs[0].from]];
  for (const segment of loop.segs) {
    if (segment.type === 'arc') {
      const [cx, cy] = segment.center;
      const [fx, fy] = points[segment.from];
      const [tx, ty] = points[segment.to];
      const start = Math.atan2(fy - cy, fx - cx);
      const end = Math.atan2(ty - cy, tx - cx);
      const direction = segment.ccw ? 1 : -1;
      const sweep = ((direction * (end - start)) % FULL_TURN + FULL_TURN) % FULL_TURN;
      const count = Math.ceil(sweep / MAX_ANGLE);
      const radius = Math.hypot(fx - cx, fy - cy);
      for (let i = 1; i < count; i += 1) {
        const angle = start + direction * sweep * i / count;
        outline.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    outline.push(points[segment.to]);
  }
  // Outlines are implicitly closed; don't repeat the first point.
  return outline.slice(0, -1);
}

function area(outline) {
  return Math.abs(outline.reduce((sum, [x, y], i) => {
    const [nextX, nextY] = outline[(i + 1) % outline.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
}

/** The largest closed loop by area; open cuts don't contribute to molding outlines. */
export function sectionProfileOutline(geometry) {
  const outlines = geometry.loops.filter((loop) => loop.closed)
    .map((loop) => flattenLoop(loop, geometry.points));
  return outlines.reduce((largest, outline) => (
    !largest || area(outline) > area(largest) ? outline : largest
  ), null);
}
