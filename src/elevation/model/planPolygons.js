import { elevationToPlan } from './geometry.js';

const EPSILON = 1e-6;
export const cross = (ax, ay, bx, by) => ax * by - ay * bx;

export function toPlan(frame, points) {
  return points.map(([u, v]) => {
    const { x, y } = elevationToPlan(frame, u, v);
    return [x + 0, 0 - y];
  });
}

export function signedArea(points) {
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

/** Counter-clockwise in plan (y up), bulges dropped. */
export function ccw(points) {
  const flat = points.map(([x, y]) => [x, y]);
  return signedArea(flat) < 0 ? flat.reverse() : flat;
}

export function lineIntersection([a, b], [c, d]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ex = d[0] - c[0];
  const ey = d[1] - c[1];
  const denominator = cross(dx, dy, ex, ey);
  if (Math.abs(denominator) <= EPSILON) return null;
  const t = cross(c[0] - a[0], c[1] - a[1], ex, ey) / denominator;
  return [a[0] + dx * t, a[1] + dy * t];
}

/** Keep the side of line i→o that holds `keep` (one Sutherland–Hodgman pass). */
export function clipToSide(polygon, i, o, keep) {
  const side = (p) => cross(o[0] - i[0], o[1] - i[1], p[0] - i[0], p[1] - i[1]);
  const sign = Math.sign(side(keep));
  if (!sign) return polygon;
  const result = [];
  polygon.forEach((p, k) => {
    const q = polygon[(k + 1) % polygon.length];
    const sp = side(p) * sign;
    const sq = side(q) * sign;
    if (sp >= -EPSILON) result.push(p);
    if ((sp > EPSILON && sq < -EPSILON) || (sp < -EPSILON && sq > EPSILON)) {
      const t = sp / (sp - sq);
      result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return result;
}
