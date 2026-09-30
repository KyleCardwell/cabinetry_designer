import { CABINET_TYPE_IDS } from './constants.js';
import { wallFrame } from './geometry.js';
import { runFootprint } from './footprints.js';
import { wallComponents } from './topology.js';
import { wallEndPanels } from './wallEndPanels.js';
import { wallOutline } from './wallOutline.js';
import { wallSideFrame, wallSideOf, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const PROBE = 1e-3;
const SAME = 1e-3;

/** An edge or an overlap shorter than this (inches) is left out of the clearances. */
export const CLEARANCE_MIN_EDGE = 1;

const clean = (value) => Math.round(value * 10000) / 10000 + 0;
const dot = (a, b) => a.x * b.x + a.y * b.y;

function area(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

/** A polygon's edges with outward normals. `front` marks a run's front edge. */
function edgesOf(part) {
  const sign = area(part.points) >= 0 ? 1 : -1;
  return part.points.map((a, index) => {
    const b = part.points[(index + 1) % part.points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      partId: part.id,
      a,
      b,
      length,
      n: { x: (sign * (b.y - a.y)) / length, y: (-sign * (b.x - a.x)) / length },
      front: part.kind === 'run' && part.frontIndex === index,
    };
  });
}

/** An edge as a line: normal `n`, offset `c` along it, and its extent along `d`. */
function lineOf(edge) {
  const d = { x: -edge.n.y, y: edge.n.x };
  const one = dot(d, edge.a);
  const two = dot(d, edge.b);
  return {
    n: edge.n,
    c: dot(edge.n, edge.a),
    d,
    start: Math.min(one, two),
    end: Math.max(one, two),
    front: edge.front,
  };
}

/**
 * Every base and tall run, wall end panel and wall as a convex plan polygon (SPEC-36.3):
 * { id, wallId, kind: 'run' | 'panel' | 'wall', points, frontIndex? }. Uppers never count, and a wall
 * with no thickness has no polygon.
 */
export function clearanceParts(room, settings) {
  const parts = [];
  for (const wall of room.walls) {
    const outline = wallOutline(room, wall);
    if (Math.abs(area(outline)) > EPSILON) {
      parts.push({ id: `${wall.id}:wall`, wallId: wall.id, kind: 'wall', points: outline });
    }
    for (const run of wall.runs) {
      if (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER) continue;
      parts.push({
        id: run.id,
        wallId: wall.id,
        kind: 'run',
        frontIndex: 2,
        points: runFootprint(wallSideFrame(room, wall, wallSideOf(run)), run, settings),
      });
    }
    const frame = wallFrame(room, wallSideView(wall.sideSource ?? wall, 'front'));
    const point = (x, offset) => ({
      x: frame.leftPoint.x + frame.r.x * x + frame.n.x * offset,
      y: frame.leftPoint.y + frame.r.y * x + frame.n.y * offset,
    });
    for (const panel of wallEndPanels(room, wall, settings)) {
      const back = -(panel.thickness + panel.back.depth);
      const left = panel.front.x;
      const right = left + panel.width;
      parts.push({
        id: `${wall.id}:${panel.endpoint}:panel`,
        wallId: wall.id,
        kind: 'panel',
        points: [point(left, back), point(right, back), point(right, panel.front.depth), point(left, panel.front.depth)],
      });
    }
  }
  return parts;
}

/** The stretch of segment a→b inside a convex polygon, as [t0, t1] along it, or null. */
function clipSegment(a, b, points) {
  const sign = area(points) >= 0 ? 1 : -1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  let t0 = 0;
  let t1 = 1;
  for (let index = 0; index < points.length; index += 1) {
    const p = points[index];
    const q = points[(index + 1) % points.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const n = { x: (sign * (q.y - p.y)) / length, y: (-sign * (q.x - p.x)) / length };
    const distance = dot(n, { x: a.x - p.x, y: a.y - p.y });
    const slope = dot(n, d);
    if (Math.abs(slope) < 1e-12) {
      if (distance > EPSILON) return null;
    } else {
      const bound = (EPSILON - distance) / slope;
      if (slope > 0) t1 = Math.min(t1, bound);
      else t0 = Math.max(t0, bound);
    }
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

function mergeIntervals(intervals, tolerance = EPSILON) {
  const merged = [];
  for (const [start, end] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + tolerance) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The outside edges of a group of parts (SPEC-36.3): each polygon edge less whatever another part
 * covers just outside it, with collinear stretches of one normal merged into one edge. Edges under
 * CLEARANCE_MIN_EDGE are dropped. Each is { n, c, d, start, end } (see lineOf).
 */
export function exposedEdges(parts) {
  const groups = new Map();
  for (const part of parts) {
    for (const edge of edgesOf(part)) {
      const probe = {
        a: { x: edge.a.x + edge.n.x * PROBE, y: edge.a.y + edge.n.y * PROBE },
        b: { x: edge.b.x + edge.n.x * PROBE, y: edge.b.y + edge.n.y * PROBE },
      };
      const covered = parts
        .filter((other) => other.id !== part.id)
        .map((other) => clipSegment(probe.a, probe.b, other.points))
        .filter(Boolean);
      const open = [];
      let cursor = 0;
      for (const [start, end] of mergeIntervals(covered)) {
        if (start > cursor) open.push([cursor, start]);
        cursor = Math.max(cursor, end);
      }
      if (cursor < 1) open.push([cursor, 1]);

      const line = lineOf(edge);
      const direction = dot(line.d, { x: edge.b.x - edge.a.x, y: edge.b.y - edge.a.y });
      const origin = dot(line.d, edge.a);
      const key = `${line.n.x.toFixed(4)}:${line.n.y.toFixed(4)}:${(Math.round(line.c / SAME) * SAME).toFixed(3)}`;
      for (const [start, end] of open) {
        if ((end - start) * edge.length < EPSILON) continue;
        const one = origin + direction * start;
        const two = origin + direction * end;
        const group = groups.get(key) ?? { line, spans: [] };
        group.spans.push([Math.min(one, two), Math.max(one, two)]);
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()].flatMap(({ line, spans }) => mergeIntervals(spans, SAME)
    .filter(([start, end]) => end - start >= CLEARANCE_MIN_EDGE)
    .map(([start, end]) => ({
      n: { x: clean(line.n.x), y: clean(line.n.y) },
      c: clean(line.c),
      d: { x: clean(line.d.x), y: clean(line.d.y) },
      start: clean(start),
      end: clean(end),
    })));
}

/** The nearest edge facing `edge` from across, as { distance, start, end, front }, or null. */
function nearestAcross(edge, obstacles) {
  let best = null;
  for (const obstacle of obstacles) {
    if (dot(edge.n, obstacle.n) > -1 + EPSILON) continue;
    const distance = -obstacle.c - edge.c;
    if (distance < -EPSILON) continue;
    // A facing edge's own along-axis points the other way.
    const start = Math.max(edge.start, -obstacle.end);
    const end = Math.min(edge.end, -obstacle.start);
    if (end - start < CLEARANCE_MIN_EDGE) continue;
    const gap = Math.max(0, distance);
    const nearer = !best
      || gap < best.distance - SAME
      || (Math.abs(gap - best.distance) <= SAME && end - start > best.end - best.start);
    if (nearer) best = { distance: gap, start, end, front: Boolean(obstacle.front) };
  }
  return best;
}

function dimensionOf(edge, across, kind) {
  const point = (along, offset) => ({
    x: edge.d.x * along + edge.n.x * offset,
    y: edge.d.y * along + edge.n.y * offset,
  });
  const middle = (across.start + across.end) / 2;
  const from = point(middle, edge.c);
  const to = point(middle, edge.c + across.distance);
  // The same gap measured from either side has the same axis, lines and span.
  const flip = edge.n.x < -EPSILON || (Math.abs(edge.n.x) <= EPSILON && edge.n.y < 0) ? -1 : 1;
  const axis = { x: edge.n.x * flip, y: edge.n.y * flip };
  const along = { x: -axis.y, y: axis.x };
  const sorted = (a, b) => [Math.min(a, b), Math.max(a, b)];
  return {
    kind,
    from: { x: clean(from.x), y: clean(from.y) },
    to: { x: clean(to.x), y: clean(to.y) },
    length: clean(across.distance),
    axis,
    lines: sorted(dot(axis, from), dot(axis, to)),
    span: sorted(dot(along, point(across.start, edge.c)), dot(along, point(across.end, edge.c))),
  };
}

function sameGap(a, b) {
  return dot(a.axis, b.axis) > 1 - EPSILON
    && Math.abs(a.lines[0] - b.lines[0]) <= SAME && Math.abs(a.lines[1] - b.lines[1]) <= SAME
    && Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]) > EPSILON;
}

/**
 * The clearances among plan parts (SPEC-36.3). `islands` lists the wall ids of each island group.
 * Each is { kind: 'island' | 'aisle', from, to, length }, at the tightest point, each gap once: an
 * island's outside edge to the nearest thing straight across (a cabinet front, an end panel, a wall
 * face, or the island's own facing edge), or one run's front to the front of the run facing it.
 * Only parallel, facing edges count.
 */
export function partClearances(parts, islands) {
  const found = [];
  for (const ids of islands) {
    const own = parts.filter((part) => ids.includes(part.wallId));
    const edges = exposedEdges(own);
    const ownIds = new Set(own.map((part) => part.id));
    const others = parts.filter((part) => !ownIds.has(part.id)).flatMap(edgesOf).map(lineOf);
    for (const edge of edges) {
      const across = nearestAcross(edge, [...others, ...edges.filter((other) => other !== edge)]);
      if (across) found.push(dimensionOf(edge, across, 'island'));
    }
  }
  for (const part of parts) {
    for (const front of edgesOf(part).filter((edge) => edge.front)) {
      const others = parts.filter((other) => other.id !== part.id).flatMap(edgesOf).map(lineOf);
      const across = nearestAcross(lineOf(front), others);
      if (across?.front) found.push(dimensionOf(lineOf(front), across, 'aisle'));
    }
  }
  const kept = [];
  for (const dimension of found) {
    if (!kept.some((other) => sameGap(other, dimension))) kept.push(dimension);
  }
  return kept.map(({
    kind, from, to, length,
  }) => ({
    kind, from, to, length,
  }));
}

function wallGroups(room) {
  const parent = new Map(room.walls.map((wall) => [wall.id, wall.id]));
  const root = (id) => (parent.get(id) === id ? id : root(parent.get(id)));
  for (const wall of room.walls) {
    for (const endpoint of ['start', 'end']) {
      const other = wall.connections?.[endpoint]?.wallId ?? wall.landings?.[endpoint]?.wallId;
      if (other && parent.has(other)) parent.set(root(wall.id), root(other));
    }
  }
  const groups = new Map();
  for (const wall of room.walls) {
    const key = root(wall.id);
    groups.set(key, [...(groups.get(key) ?? []), wall.id]);
  }
  return [...groups.values()];
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether `points` lie inside the walls `ids`: inside a closed room's outline, or an open group's bounding box. */
function within(room, parts, ids, points) {
  const cycle = wallComponents(room).find((component) => component.kind === 'cycle'
    && component.walls.every((entry) => ids.includes(entry.wallId)));
  if (cycle) {
    const byId = new Map(room.walls.map((wall) => [wall.id, wall]));
    const outline = cycle.walls.map((entry) => {
      const wall = byId.get(entry.wallId);
      return entry.from === 'start' ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
    });
    return points.every((point) => insidePolygon(point, outline));
  }
  const corners = parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return points.every((point) => point.x >= Math.min(...xs) - EPSILON && point.x <= Math.max(...xs) + EPSILON
    && point.y >= Math.min(...ys) - EPSILON && point.y <= Math.max(...ys) + EPSILON);
}

/**
 * Island groups (SPEC-36.3): walls joined only to each other (connections, or a wing wall's landing)
 * whose footprint, cabinets included, lies inside another group's outline. Each is a list of wall ids.
 */
export function islandGroups(room, parts) {
  const groups = wallGroups(room);
  return groups.filter((ids) => {
    const points = parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points);
    return points.length > 0 && groups.some((other) => other !== ids && within(room, parts, other, points));
  });
}

/** Plan clearances for a room (SPEC-36.3): islands' outside edges and facing-run aisles. */
export function planClearances(room, settings) {
  if (!room?.walls?.length) return [];
  const parts = clearanceParts(room, settings);
  return partClearances(parts, islandGroups(room, parts));
}
