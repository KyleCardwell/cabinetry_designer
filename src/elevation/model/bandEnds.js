import { flattenOutline, transformOutline } from './sectionProfileOutline.js';

const EPSILON = 1e-6;
const TURN = 2 * Math.PI;
const roundBulge = (value) => Math.round(value * 1e6) / 1e6 || 0;

function arcOf([x, z, bulge = 0], [tx, tz]) {
  if (!bulge || (x === tx && z === tz)) return null;
  const offset = (1 - bulge * bulge) / (4 * bulge);
  const cx = (x + tx) / 2 - (tz - z) * offset;
  const cz = (z + tz) / 2 + (tx - x) * offset;
  return { cx, cz, radius: Math.hypot(x - cx, z - cz), start: Math.atan2(z - cz, x - cx), sweep: 4 * Math.atan(bulge) };
}

function fraction(arc, angle) {
  const direction = Math.sign(arc.sweep);
  const distance = ((direction * (angle - arc.start)) % TURN + TURN) % TURN;
  return distance / Math.abs(arc.sweep);
}

/** Reverse an open chain, moving each segment's negated bulge to its new start. */
function reverseChain(chain) {
  return chain.toReversed().map(([x, z], index) => [x, z,
    index < chain.length - 1 ? roundBulge(-chain[chain.length - 2 - index][2]) : 0,
  ]);
}

/** Include top/bottom extrema inside arcs so the contour can start or finish there. */
function splitExtrema(loop) {
  return loop.flatMap((point, index) => {
    const arc = arcOf(point, loop[(index + 1) % loop.length]);
    if (!arc) return [[point[0], point[1], point[2] ?? 0]];
    const splits = [Math.PI / 2, -Math.PI / 2].map((angle) => fraction(arc, angle))
      .filter((t) => t > EPSILON && t < 1 - EPSILON).sort((a, b) => a - b);
    const stops = [0, ...splits, 1];
    return stops.slice(0, -1).map((t, i) => {
      const angle = arc.start + t * arc.sweep;
      const xy = t === 0 ? point.slice(0, 2)
        : [arc.cx + arc.radius * Math.cos(angle), arc.cz + arc.radius * Math.sin(angle)];
      return [...xy, roundBulge(Math.tan((stops[i + 1] - t) * arc.sweep / 4))];
    });
  });
}

/** The outward open chain, bottom to top, retaining arcs and their direction. */
export function frontContour(loop, facing = 1) {
  if (!loop?.length) return null;
  const points = splitExtrema(loop);
  const extreme = (highest) => points.reduce((best, point, index) => {
    const dz = point[1] - points[best][1];
    return (highest ? dz > EPSILON : dz < -EPSILON)
      || (Math.abs(dz) <= EPSILON && facing * point[0] > facing * points[best][0]) ? index : best;
  }, 0);
  const bottom = extreme(false);
  const top = extreme(true);
  const walk = (from, to) => {
    const chain = [];
    for (let i = from; ; i = (i + 1) % points.length) {
      chain.push([...points[i]]);
      if (i === to) break;
    }
    chain.at(-1)[2] = 0;
    return chain;
  };
  const chains = [walk(bottom, top), reverseChain(walk(top, bottom))];
  const score = (chain) => {
    const flat = flattenOutline(chain);
    const outward = Math.max(...flat.map(([x]) => facing * x));
    // Both chains often share their most outward endpoint. Their signed area breaks that tie.
    const area = facing * flat.reduce((sum, [x, z], i) => {
      const [nx, nz] = flat[(i + 1) % flat.length];
      return sum + (x + nx) * (nz - z) / 2;
    }, 0);
    return { outward, area };
  };
  const [a, b] = chains.map(score);
  return b.outward > a.outward + EPSILON
    || (Math.abs(b.outward - a.outward) <= EPSILON && b.area > a.area) ? chains[1] : chains[0];
}

/** Place a closed profile on a run side; the left end mirrors its segment bulges. */
export function placeAtEnd(loop, side, overhang, reference, facing = 1) {
  return transformOutline(loop, ([x, z]) => [side + facing * (overhang + x), reference + z], facing < 0);
}

/** Counter-clockwise band, beginning at the bottom of its left end. */
export function bandOutline(left, right, z, height) {
  const extend = (edge) => {
    const chain = edge.map((point) => [...point]);
    if (Math.abs(chain[0][1] - z) > EPSILON) chain.unshift([chain[0][0], z, 0]);
    if (Math.abs(chain.at(-1)[1] - z - height) > EPSILON) chain.push([chain.at(-1)[0], z + height, 0]);
    return chain;
  };
  const l = extend(left);
  const r = extend(right);
  return [[...l[0].slice(0, 2), 0], ...r, ...reverseChain(l).slice(0, -1)];
}

/** Keep only the returned profile in front of a short wall, collapsing the rest to the run side. */
export function clipReturnEdge(edge, end) {
  const { x, side, facing, returnLength } = end;
  if (returnLength == null || returnLength >= facing * (x - side) || edge.length < 2) return edge;
  const cutX = x - facing * returnLength;
  const stretches = [];
  for (let i = 0; i < edge.length - 1; i += 1) {
    const from = edge[i];
    const to = edge[i + 1];
    const arc = arcOf(from, to);
    let splits = [];
    if (arc) {
      const cosine = (cutX - arc.cx) / arc.radius;
      if (Math.abs(cosine) <= 1) {
        const angle = Math.acos(cosine);
        splits = [angle, -angle].map((a) => fraction(arc, a));
      }
    } else if (from[0] !== to[0]) {
      splits = [(cutX - from[0]) / (to[0] - from[0])];
    }
    const stops = [0, ...splits.filter((t) => t > EPSILON && t < 1 - EPSILON)
      .sort((a, b) => a - b).filter((t, index, all) => !index || t - all[index - 1] > EPSILON), 1];
    const at = (t) => arc
      ? [arc.cx + arc.radius * Math.cos(arc.start + t * arc.sweep),
        arc.cz + arc.radius * Math.sin(arc.start + t * arc.sweep)]
      : [from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])];
    for (let j = 0; j < stops.length - 1; j += 1) {
      const a = stops[j];
      const b = stops[j + 1];
      const keep = facing * (at((a + b) / 2)[0] - cutX) >= 0;
      const start = a === 0 ? from.slice(0, 2) : [cutX, at(a)[1]];
      const finish = b === 1 ? to.slice(0, 2) : [cutX, at(b)[1]];
      if (!keep) {
        start[0] = side;
        finish[0] = side;
      }
      const bulge = keep && arc ? (stops.length === 2 ? from[2] : Math.tan((b - a) * arc.sweep / 4)) : 0;
      if (!keep && stretches.at(-1)?.keep === false) stretches.at(-1).finish = finish;
      else stretches.push({ start, finish, bulge, keep });
    }
  }
  const clipped = [];
  const append = ([px, pz]) => {
    const last = clipped.at(-1);
    if (!last || Math.hypot(px - last[0], pz - last[1]) > EPSILON) clipped.push([px, pz, 0]);
  };
  for (const { start, finish, bulge } of stretches) {
    append(start);
    clipped.at(-1)[2] = bulge;
    append(finish);
  }
  return clipped;
}

/** Most outward intersection at a drawn line's height, including horizontal steps and true arcs. */
export function endEdgeX(edge, z, facing) {
  const xs = [];
  for (let i = 0; i < edge.length - 1; i += 1) {
    const [x, y] = edge[i];
    const [tx, ty] = edge[i + 1];
    if (Math.abs(y - z) <= EPSILON) xs.push(x);
    if (Math.abs(ty - z) <= EPSILON) xs.push(tx);
    const arc = arcOf(edge[i], edge[i + 1]);
    if (arc) {
      const squared = arc.radius ** 2 - (z - arc.cz) ** 2;
      if (squared < -EPSILON) continue;
      for (const candidate of [arc.cx - Math.sqrt(Math.max(0, squared)), arc.cx + Math.sqrt(Math.max(0, squared))]) {
        const t = fraction(arc, Math.atan2(z - arc.cz, candidate - arc.cx));
        // Six-place bulges can put a tangent's second root just inside its endpoint.
        // At that height use the preserved endpoint, rather than the quantization artifact.
        if ((t <= EPSILON && Math.abs(y - z) <= EPSILON)
          || (Math.abs(t - 1) <= EPSILON && Math.abs(ty - z) <= EPSILON)) continue;
        if (t <= 1 + EPSILON) {
          xs.push(Math.hypot(candidate - x, z - y) <= EPSILON ? x
            : Math.hypot(candidate - tx, z - ty) <= EPSILON ? tx : candidate);
        }
      }
    } else if (Math.abs(ty - y) > EPSILON && z > Math.min(y, ty) && z < Math.max(y, ty)) {
      xs.push(x + (tx - x) * (z - y) / (ty - y));
    }
  }
  if (xs.length) return facing < 0 ? Math.min(...xs) : Math.max(...xs);
  return z < edge[0][1] ? edge[0][0] : edge.at(-1)[0];
}
