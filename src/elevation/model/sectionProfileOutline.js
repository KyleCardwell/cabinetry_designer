import { roundBulge } from './units.js';

const FULL_TURN = Math.PI * 2;

/** Keep each segment's bulge at its start; split arcs over 180 degrees at their midpoint. */
function loopOutline(loop, points) {
  return loop.segs.flatMap((segment) => {
    const [x, y] = points[segment.from];
    if (segment.type !== 'arc') return [[x, y, 0]];
    const [cx, cy] = segment.center;
    const [tx, ty] = points[segment.to];
    const start = Math.atan2(y - cy, x - cx);
    const end = Math.atan2(ty - cy, tx - cx);
    const direction = segment.ccw ? 1 : -1;
    const sweep = ((direction * (end - start)) % FULL_TURN + FULL_TURN) % FULL_TURN;
    const count = sweep > Math.PI ? 2 : 1;
    const bulge = roundBulge(direction * Math.tan(sweep / count / 4));
    const outline = [[x, y, bulge]];
    if (count === 2) {
      const radius = Math.hypot(x - cx, y - cy);
      const angle = start + direction * sweep / 2;
      outline.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), bulge]);
    }
    return outline;
  });
}

/** Trace every loop in drawing order, retaining the final endpoint of open loops. */
export function shapeOutlines(geometry) {
  return geometry.loops.map((loop) => {
    const outline = loopOutline(loop, geometry.points);
    if (!loop.closed && loop.segs.length) {
      outline.push([...geometry.points[loop.segs.at(-1).to], 0]);
    }
    return { closed: loop.closed, outline };
  });
}

function arcGeometry([x, y, bulge = 0], [tx, ty]) {
  if (!bulge || (x === tx && y === ty)) return null;
  const offset = (1 - bulge * bulge) / (4 * bulge);
  const cx = (x + tx) / 2 - (ty - y) * offset;
  const cy = (y + ty) / 2 + (tx - x) * offset;
  return {
    cx, cy, radius: Math.hypot(x - cx, y - cy),
    start: Math.atan2(y - cy, x - cx), sweep: 4 * Math.atan(bulge),
  };
}

/** Flatten a closed outline into pairs for math, retaining endpoints and limiting chord sagitta. */
export function flattenOutline(outline, maxSagitta = 0.001) {
  if (!Number.isFinite(maxSagitta) || maxSagitta <= 0) throw new RangeError('maxSagitta must be positive and finite');
  return outline.flatMap((point, index) => {
    const [x, y] = point;
    const result = [[x, y]];
    const arc = arcGeometry(point, outline[(index + 1) % outline.length]);
    if (arc) {
      const { cx, cy, radius, start, sweep } = arc;
      const maxAngle = 4 * Math.asin(Math.sqrt(Math.min(1, maxSagitta / (2 * radius))));
      const count = Math.max(1, Math.ceil(Math.abs(sweep) / maxAngle));
      for (let i = 1; i < count; i += 1) {
        const angle = start + sweep * i / count;
        result.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    return result;
  });
}

/** Bounds of the outline's flattened geometry, including arc interiors. */
export function outlineBounds(outline) {
  const points = flattenOutline(outline);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Place outline points and preserve their bulges, negating them when orientation flips. */
export function transformOutline(outline, fn, mirrored = false) {
  return outline.map(([x, y, bulge = 0]) => [...fn([x, y]), roundBulge(mirrored ? -bulge : bulge)]);
}

function area(outline) {
  return Math.abs(outline.reduce((sum, point, i) => {
    const [x, y] = point;
    const next = outline[(i + 1) % outline.length];
    const [nextX, nextY] = next;
    const arc = arcGeometry(point, next);
    const curvedArea = arc ? arc.radius ** 2 * (arc.sweep - Math.sin(arc.sweep)) : 0;
    return sum + x * nextY - nextX * y + curvedArea;
  }, 0)) / 2;
}

/** The largest closed loop by area; open cuts don't contribute to molding outlines. */
export function sectionProfileOutline(geometry) {
  const outlines = geometry.loops.filter((loop) => loop.closed && loop.segs.length)
    .map((loop) => loopOutline(loop, geometry.points));
  return outlines.reduce((largest, outline) => (
    !largest || area(outline) > area(largest) ? outline : largest
  ), null);
}
