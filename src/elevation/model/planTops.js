import { bandParts } from './bandParts.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { elevationToPlan, wallLength } from './geometry.js';
import { resolveWall } from './room.js';
import { topOverhangs } from './topOverhang.js';
import { WALL_SIDES, wallSideFrame } from './wallSides.js';

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
