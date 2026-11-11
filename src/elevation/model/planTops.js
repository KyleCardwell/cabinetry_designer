import { bandParts } from './bandParts.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { elevationToPlan, wallLength } from './geometry.js';
import { resolveWall } from './room.js';
import { topOverhangs } from './topOverhang.js';
import { cornerBandEdge, lazyCornerShapes } from './cornerBands.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';
import { woodTopCorners, woodTopGroups } from './woodTopGroups.js';

const EPSILON = 1e-6;
const SNAP = 1024;
export const PLAN_TOP_DIM_MIN = 3;
const key = ([u, v]) => `${u},${v}`;

function topRectangles(room, wall, settings) {
  const length = wallLength(wall);
  const thickness = wall.thickness ?? 0;
  const tops = WALL_SIDES.flatMap((side) => bandParts(room, wall, side, settings)
    .filter(({ kind }) => kind === 'countertop')
    .map(({ x, width, z, height, back, front }) => ({
      side, back, surface: z + height,
      u0: side === 'back' ? length - x - width : x,
      u1: side === 'back' ? length - x : x + width,
      v0: side === 'back' ? -thickness - front : back,
      v1: side === 'back' ? -thickness - back : front,
    })));
  const groups = [];
  for (const top of tops) {
    let group = groups.find(({ surface }) => Math.abs(surface - top.surface) <= EPSILON);
    if (!group) {
      group = { surface: top.surface, tops: [], rectangles: [] };
      groups.push(group);
    }
    group.tops.push(top);
    group.rectangles.push([top.u0, top.u1, top.v0, top.v1]);
  }
  for (const group of groups) {
    for (const front of group.tops.filter(({ side }) => side === 'front')) {
      for (const back of group.tops.filter(({ side }) => side === 'back')) {
        const u0 = Math.max(front.u0, back.u0);
        const u1 = Math.min(front.u1, back.u1);
        if (u1 - u0 > EPSILON && Math.abs(front.surface - back.surface) <= EPSILON) {
          group.rectangles.push([u0, u1, -thickness - back.back, front.back]);
        }
      }
    }
  }
  return groups.map(({ rectangles }) => rectangles);
}

function unionLoops(rectangles) {
  // Integer grid coordinates make shared edges exact, including nearly touching spans.
  const rects = rectangles.map((rect) => rect.map((value) => Math.round(value * SNAP)))
    .filter(([u0, u1, v0, v1]) => u1 > u0 && v1 > v0);
  const us = [...new Set(rects.flatMap(([u0, u1]) => [u0, u1]))].sort((a, b) => a - b);
  const vs = [...new Set(rects.flatMap(([, , v0, v1]) => [v0, v1]))].sort((a, b) => a - b);
  const cells = us.slice(1).map((u1, i) => vs.slice(1).map((v1, j) => {
    const u = (us[i] + u1) / 2;
    const v = (vs[j] + v1) / 2;
    return rects.some(([u0, endU, v0, endV]) => u > u0 && u < endU && v > v0 && v < endV);
  }));
  const edges = new Map();
  const add = (start, end, direction) => {
    const edge = { start, end, direction };
    const id = key(start);
    if (!edges.has(id)) edges.set(id, []);
    edges.get(id).push(edge);
  };
  // Walk with filled cells to the left: east, north, west, south.
  cells.forEach((column, i) => column.forEach((inside, j) => {
    if (!inside) return;
    const [u0, u1, v0, v1] = [us[i], us[i + 1], vs[j], vs[j + 1]];
    if (!cells[i]?.[j - 1]) add([u0, v0], [u1, v0], 0);
    if (!cells[i + 1]?.[j]) add([u1, v0], [u1, v1], 1);
    if (!cells[i]?.[j + 1]) add([u1, v1], [u0, v1], 2);
    if (!cells[i - 1]?.[j]) add([u0, v1], [u0, v0], 3);
  }));
  const loops = [];
  while (edges.size) {
    const start = edges.values().next().value[0].start;
    const loop = [];
    let edge = edges.get(key(start))[0];
    do {
      loop.push(edge.start);
      const id = key(edge.start);
      const outgoing = edges.get(id);
      outgoing.splice(outgoing.indexOf(edge), 1);
      if (!outgoing.length) edges.delete(id);
      if (key(edge.end) === key(start)) break;
      const candidates = edges.get(key(edge.end));
      // At point contacts, turn left first so separate outlines stay separate.
      edge = [1, 0, 3, 2].map((turn) => candidates.find((candidate) =>
        candidate.direction === (edge.direction + turn) % 4)).find(Boolean);
    } while (edge);
    const corners = loop.filter((point, i) => {
      const before = loop[(i + loop.length - 1) % loop.length];
      const after = loop[(i + 1) % loop.length];
      return (point[0] - before[0]) * (after[1] - point[1])
        !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    loops.push(corners.map(([u, v]) => [u / SNAP, v / SNAP]));
  }
  return loops;
}

/** Top boundaries per wall in its front-face frame, with each top height unioned separately. */
export function planTops(room, settings = DEFAULT_SETTINGS) {
  return (room?.walls ?? []).flatMap((wall) => {
    const loops = topRectangles(room, wall, settings).flatMap(unionLoops);
    return loops.length ? [{ wallId: wall.id, loops }] : [];
  });
}

/** Map a front-frame outline to plan inches, y up, as planParts does. */
export function planTopPoints(room, wall, loop) {
  const frame = wallSideFrame(room, wall, 'front');
  return loop.map(([u, v]) => {
    const { x, y } = elevationToPlan(frame, u, v);
    return [x + 0, 0 - y];
  });
}

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
const refKey = (wallId, side, bandId) => `${wallId}|${side}|${bandId}`;
const near = (a, b) => Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function toPlan(frame, points) {
  return points.map(([u, v]) => {
    const { x, y } = elevationToPlan(frame, u, v);
    return [x + 0, 0 - y];
  });
}

function signedArea(points) {
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

/** Counter-clockwise in plan (y up), bulges dropped. */
function ccw(points) {
  const flat = points.map(([x, y]) => [x, y]);
  return signedArea(flat) < 0 ? flat.reverse() : flat;
}

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

function lineIntersection([a, b], [c, d]) {
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
function clipToSide(polygon, i, o, keep) {
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

/** Every countertop band as a piece in plan (y up), plus PT1's island bridges. */
function topPieces(room, settings) {
  const parts = new Map(woodTopGroups(room, settings).flatMap(({ key, bandRefs = [] }) =>
    bandRefs.map(({ wallId, side, bandId }) => [refKey(wallId, side, bandId), key])));
  const pieces = [];
  for (const wall of room?.walls ?? []) {
    const length = wallLength(wall);
    const thickness = wall.thickness ?? 0;
    const bySide = {};
    for (const side of WALL_SIDES) {
      const frame = wallSideFrame(room, wall, side);
      const view = { ...wallSideView(wall, side), length };
      const runs = new Map(resolveWall(room, wall, side).runs.map((run) => [run.id, run]));
      const shapes = lazyCornerShapes(room, view, settings);
      bySide[side] = bandParts(room, wall, side, settings)
        .filter(({ kind }) => kind === 'countertop')
        .map((band) => {
          const ref = refKey(wall.id, side, band.id);
          const piece = { ref, wallId: wall.id, side, band, frame,
            u0: band.x, u1: band.x + band.width, v0: band.back, v1: band.front,
            surface: band.z + band.height, part: parts.get(ref) ?? 'stone' };
          // Stone that stops at a corner return's top runs on into the corner (one surface);
          // the overlap is a seam. Wood corners follow woodTopCorners below.
          const run = runs.get(band.runId);
          if (piece.part === 'stone' && run) {
            for (const end of ['left', 'right']) {
              const edge = cornerBandEdge(shapes, run, end, 'countertop', band.z, band.height);
              const at = end === 'left' ? piece.u0 : piece.u1;
              if (edge && Math.abs(at - edge.x) <= EPSILON) piece[end === 'left' ? 'u0' : 'u1'] = edge.reach;
            }
          }
          pieces.push(piece);
          return piece;
        });
    }
    const front = wallSideFrame(room, wall, 'front');
    for (const top of bySide.front) {
      for (const back of bySide.back) {
        const u0 = Math.max(top.u0, length - back.u1);
        const u1 = Math.min(top.u1, length - back.u0);
        if (u1 - u0 > EPSILON && Math.abs(top.surface - back.surface) <= EPSILON) {
          pieces.push({ ref: `${top.ref}|bridge|${back.band.id}`, wallId: wall.id, side: 'front', frame: front,
            u0, u1, v0: -thickness - back.band.back, v1: top.band.back,
            surface: top.surface, part: top.part, bridge: true });
        }
      }
    }
  }
  const byRef = new Map(pieces.map((piece) => [piece.ref, piece]));
  const miters = woodTopCorners(room, settings).flatMap(({ mode, x, y }) => {
    const pieceX = byRef.get(refKey(x.wallId, x.side, x.bandId));
    const pieceY = byRef.get(refKey(y.wallId, y.side, y.bandId));
    if (!pieceX || !pieceY) return [];
    // Same ends as woodTopGroups: butt runs Y into the corner square; a miter runs both in.
    if (y.reach !== null) pieceY[y.end === 'left' ? 'u0' : 'u1'] = y.reach;
    if (mode !== 'miter') return [];
    pieceX[x.end === 'left' ? 'u0' : 'u1'] = x.reach;
    return [{ x: pieceX, xEnd: x.end, y: pieceY, yEnd: y.end }];
  });
  for (const piece of pieces) {
    const { frame, u0, u1, v0, v1 } = piece;
    piece.polygon = ccw(toPlan(frame, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]));
    piece.line = (v) => toPlan(frame, [[u0, v], [u1, v]]);
    piece.farEnd = (end) => toPlan(frame, [[end === 'left' ? u1 : u0, (v0 + v1) / 2]])[0];
  }
  for (const { x, xEnd, y, yEnd } of miters) {
    const i = lineIntersection(x.line(x.v0), y.line(y.v0));
    const o = lineIntersection(x.line(x.v1), y.line(y.v1));
    if (!i || !o || near(i, o)) continue;
    x.polygon = clipToSide(x.polygon, i, o, x.farEnd(xEnd));
    y.polygon = clipToSide(y.polygon, i, o, y.farEnd(yEnd));
  }
  return pieces.filter(({ polygon }) => polygon.length >= 3 && Math.abs(signedArea(polygon)) > EPSILON);
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
  for (const piece of topPieces(room, settings)) {
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
