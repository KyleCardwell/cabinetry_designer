import { bandFootprints } from './bandFootprints.js';
import { bandParts } from './bandParts.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { cross } from './planPolygons.js';
import { resolveWall } from './room.js';
import { topOverhangs } from './topOverhang.js';
import { WALL_SIDES } from './wallSides.js';

const EPSILON = 1e-6;
export const PLAN_TOP_DIM_MIN = 3;

/** Qualifying core overhangs, measured inward from each top edge in the wall's front frame. */
export function planTopOverhangs(room, settings = DEFAULT_SETTINGS) {
  return (room?.walls ?? []).flatMap((wall) => WALL_SIDES.flatMap((side) => {
    const view = resolveWall(room, wall, side);
    const toFront = ([u, v]) => side === 'back'
      ? [view.length - u, -(wall.thickness ?? 0) - v] : [u, v];
    return bandParts(room, wall, side, settings).flatMap((top) => {
      if (top.kind !== 'countertop') return [];
      const run = view.runs.find(({ id }) => id === top.runId);
      // Insert segments have no independent run overhang to dimension.
      if (!run || top.id.startsWith(`${run.id}:top-`)) return [];
      const values = topOverhangs(room, view, run, settings);
      const { x, width, back, front } = top;
      const middleU = x + width / 2;
      const middleV = (back + front) / 2;
      const edges = [
        ['front', front - frontDepth(run, settings), [middleU, front], [0, -1]],
        ['back', -back, [middleU, back], [0, 1]],
        ['left', run.x - x, [x, middleV], [1, 0]],
        ['right', x + width - (run.x + run.width), [x + width, middleV], [-1, 0]],
      ];
      return edges.flatMap(([edge, reach, to, inward]) => {
        const value = values[edge];
        if (value <= PLAN_TOP_DIM_MIN + EPSILON || reach < value - EPSILON) return [];
        const from = to.map((coordinate, i) => coordinate + inward[i] * value);
        return [{ wallId: wall.id, runId: run.id, side, edge, value, from: toFront(from), to: toFront(to) }];
      });
    });
  }));
}

// ---- PT2: exposed top edges and joints in plan -------------------------------------------------

const OFFSET = 1 / 256;
const COVER_KINDS = new Set(['cabinet', 'face', 'filler', 'end_panel', 'panel', 'frame', 'wall_end_panel']);
const near = (a, b) => Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;

/** Strictly inside (ray cast); points within EPSILON of an edge count as outside. */
function inside(polygon, [px, py]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const dx = xj - xi;
    const dy = yj - yi;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      const t = ((px - xi) * dx + (py - yi) * dy) / (length * length);
      if (t >= 0 && t <= 1 && Math.abs(cross(dx, dy, px - xi, py - yi)) / length <= EPSILON) return false;
    }
    if ((yi > py) !== (yj > py) && px < xi + (py - yi) / (yj - yi) * (xj - xi)) hit = !hit;
  }
  return hit;
}

/** Split parameters along a→b where other edges cross, touch or overlap it. */
function splitParams(a, b, polygons) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const ts = [0, 1];
  for (const polygon of polygons) {
    polygon.forEach((c, i) => {
      const d = polygon[(i + 1) % polygon.length];
      const ex = d[0] - c[0];
      const ey = d[1] - c[1];
      const denominator = cross(dx, dy, ex, ey);
      const length = Math.sqrt(length2);
      if (Math.abs(denominator) <= EPSILON * length * Math.hypot(ex, ey)) {
        // Parallel: only collinear overlaps split, at the other edge's ends.
        if (Math.abs(cross(dx, dy, c[0] - a[0], c[1] - a[1])) / length > EPSILON) return;
        for (const point of [c, d]) ts.push(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2);
        return;
      }
      const t = cross(c[0] - a[0], c[1] - a[1], ex, ey) / denominator;
      const s = cross(c[0] - a[0], c[1] - a[1], dx, dy) / denominator;
      const slack = EPSILON / Math.hypot(ex, ey);
      if (s >= -slack && s <= 1 + slack) ts.push(t);
    });
  }
  const tolerance = EPSILON / Math.sqrt(length2);
  return [...new Set(ts.filter((t) => t >= 0 && t <= 1))].sort((x, y) => x - y)
    .filter((t, i, sorted) => i === 0 || t - sorted[i - 1] > tolerance);
}

/** Walls taller than the surface and solids standing through it, as plain polygons. */
function obstacles(room, solids, surface) {
  const heights = new Map();
  for (const wall of room?.walls ?? []) {
    const height = wall.height ?? Infinity;
    heights.set(`${wall.id}:wall`, height);
    for (const recess of wall.recesses ?? []) heights.set(`${recess.id}:fill`, height);
  }
  return solids.filter(({ kind, id, top, bottom }) => (kind === 'wall'
    ? (heights.get(id) ?? Infinity) > surface + EPSILON
    : COVER_KINDS.has(kind) && top !== undefined && top > surface + EPSILON
      && (bottom ?? 0) < surface - EPSILON))
    .map(({ points }) => points.map(([x, y]) => [x, y]))
    .filter((points) => points.length >= 3);
}

/** Join segments end to end into polylines; drop collinear points; close loops. */
function chains(segments) {
  const remaining = [...segments];
  const result = [];
  while (remaining.length) {
    const chain = [...remaining.shift()];
    let grown = true;
    while (grown) {
      grown = false;
      for (let k = 0; k < remaining.length; k += 1) {
        const [a, b] = remaining[k];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (near(tail, a)) chain.push(b);
        else if (near(tail, b)) chain.push(a);
        else if (near(head, b)) chain.unshift(a);
        else if (near(head, a)) chain.unshift(b);
        else continue;
        remaining.splice(k, 1);
        grown = true;
        break;
      }
    }
    const closed = chain.length > 3 && near(chain[0], chain[chain.length - 1]);
    if (closed) chain.pop();
    const straight = (before, point, after) => Math.abs(cross(point[0] - before[0], point[1] - before[1],
      after[0] - point[0], after[1] - point[1])) <= EPSILON * Math.hypot(after[0] - before[0], after[1] - before[1]);
    const points = chain.filter((point, i) => {
      if (!closed && (i === 0 || i === chain.length - 1)) return true;
      return !straight(chain[(i + chain.length - 1) % chain.length], point, chain[(i + 1) % chain.length]);
    });
    result.push({ points, closed });
  }
  return result;
}

/**
 * Countertop / wood top lines in plan (SPEC-PT2): only exposed edges, plus joints between
 * different parts at one surface. `solids` = planSolidParts(room, settings, { bottoms: true }).
 * → [{ id, kind: 'edge' | 'joint', points: [[x, y], …] (plan inches, y up), closed }]
 */
export function planTopEdges(room, settings = DEFAULT_SETTINGS, solids = []) {
  const groups = [];
  for (const piece of bandFootprints(room, settings)) {
    let group = groups.find(({ surface }) => Math.abs(surface - piece.surface) <= EPSILON);
    if (!group) groups.push(group = { surface: piece.surface, pieces: [] });
    group.pieces.push(piece);
  }
  groups.sort((a, b) => a.surface - b.surface);
  return groups.flatMap(({ surface, pieces }, g) => {
    const covers = obstacles(room, solids, surface);
    const polygons = [...pieces.map(({ polygon }) => polygon), ...covers];
    const edges = [];
    const joints = [];
    pieces.forEach((piece, index) => {
      const others = polygons.filter((polygon) => polygon !== piece.polygon);
      piece.polygon.forEach((a, k) => {
        const b = piece.polygon[(k + 1) % piece.polygon.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length <= EPSILON) return;
        const normal = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
        const ts = splitParams(a, b, others);
        for (let s = 1; s < ts.length; s += 1) {
          const start = [a[0] + (b[0] - a[0]) * ts[s - 1], a[1] + (b[1] - a[1]) * ts[s - 1]];
          const end = [a[0] + (b[0] - a[0]) * ts[s], a[1] + (b[1] - a[1]) * ts[s]];
          const probe = [(start[0] + end[0]) / 2 + normal[0] * OFFSET, (start[1] + end[1]) / 2 + normal[1] * OFFSET];
          if (covers.some((polygon) => inside(polygon, probe))) continue;
          const other = pieces.findIndex((candidate, c) => c !== index && inside(candidate.polygon, probe));
          if (other < 0) edges.push([start, end]);
          else if (pieces[other].part !== piece.part && index < other) joints.push([start, end]);
        }
      });
    });
    return [
      ...chains(edges).map((chain, i) => ({ id: `top:${g}:${i}`, kind: 'edge', ...chain })),
      ...chains(joints).map((chain, i) => ({ id: `top-joint:${g}:${i}`, kind: 'joint', ...chain })),
    ];
  });
}
