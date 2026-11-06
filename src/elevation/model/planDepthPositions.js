import { CABINET_TYPE_IDS } from './constants.js';
import { frontDepth } from './corners.js';
import { elevationToPlan, planPointToWallX } from './geometry.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

export const DEPTH_LANES = {
  [CABINET_TYPE_IDS.BASE]: 0,
  [CABINET_TYPE_IDS.UPPER]: -1,
  [CABINET_TYPE_IDS.TALL]: 1,
};
const EPSILON = 1e-6;
const clamp = (x, left, right) => Math.max(left, Math.min(right, x));
const laneOrder = (lane) => lane === 0 ? 0 : lane < 0 ? 1 : 2;
const placementOrder = (a, b) => (a.right - a.left) - (b.right - b.left)
  || laneOrder(a.lane) - laneOrder(b.lane) || a.order - b.order;

/** The overlap of the two faces' spans, in front-face inches. */
function overlap(entries) {
  const spans = ['front', 'back'].map((side) => entries.filter((entry) => entry.side === side));
  if (spans.some((face) => face.length === 0)) return null;
  const left = Math.max(...spans.map((face) => Math.min(...face.map((entry) => entry.frontLeft))));
  const right = Math.min(...spans.map((face) => Math.max(...face.map((entry) => entry.frontRight))));
  return right >= left ? { middle: (left + right) / 2, width: right - left } : null;
}

/** Narrow ranges reserve their positions first; search left before right at each quarter-gap. */
function place(entry, taken, gap) {
  const preferred = clamp(entry.preferred, entry.left, entry.right);
  const clear = (x) => taken.every((other) => Math.abs(x - other) >= gap - EPSILON);
  if (clear(preferred)) return preferred;
  const step = gap / 4;
  if (step > 0) {
    const distance = Math.max(preferred - entry.left, entry.right - preferred);
    for (let i = 1; i * step <= distance + EPSILON; i += 1) {
      for (const x of [preferred - i * step, preferred + i * step]) {
        if (x >= entry.left - EPSILON && x <= entry.right + EPSILON && clear(x)) {
          return clamp(x, entry.left, entry.right);
        }
      }
    }
  }
  return preferred;
}

/** Shared depth-line positions in each run's own face frame, with aligned island base pairs. */
export function planDepthPositions(room, settings, { laneShift, gap, margin }) {
  const positions = new Map();
  for (const wall of room.walls) {
    const frames = Object.fromEntries(['front', 'back'].map((side) => [side, wallSideFrame(room, wall, side)]));
    const toFront = (entry, x) => planPointToWallX(frames.front, elevationToPlan(frames[entry.side], x, 0));
    const entries = (wall.runs ?? []).flatMap((run, order) => {
      if (!(run.width > 0) || !(run.depth > 0)
        || frontDepth(run, settings) - (run._plane?.offset ?? 0) <= 0) return [];
      const side = wallSideOf(run);
      const lane = DEPTH_LANES[run.cabinetTypeId] ?? 0;
      const inset = Math.min(run.width / 2, margin);
      const entry = { run, order, side, lane, left: run.x + inset, right: run.x + run.width - inset };
      const ends = [toFront(entry, run.x), toFront(entry, run.x + run.width)];
      return [{ ...entry, frontLeft: Math.min(...ends), frontRight: Math.max(...ends) }];
    });
    const bases = entries.filter(({ run }) => run.cabinetTypeId === CABINET_TYPE_IDS.BASE);
    const baseOverlap = overlap(bases);
    const anchor = baseOverlap && baseOverlap.width >= 2 * margin ? baseOverlap : overlap(entries);
    for (const entry of entries) {
      entry.preferred = anchor
        ? planPointToWallX(frames[entry.side], elevationToPlan(frames.front, anchor.middle + entry.lane * laneShift, 0))
        : entry.run.x + entry.run.width / 2 + entry.lane * laneShift;
    }
    for (const side of ['front', 'back']) {
      const face = entries.filter((entry) => entry.side === side).sort(placementOrder);
      // An island's base lines establish the common anchor before its other lanes.
      const ordered = anchor ? [
        ...face.filter((entry) => bases.includes(entry)),
        ...face.filter((entry) => !bases.includes(entry)),
      ] : face;
      const taken = [];
      for (const entry of ordered) {
        const x = place(entry, taken, gap);
        positions.set(entry.run.id, { x });
        taken.push(x);
      }
    }
    const paired = new Set();
    for (const front of bases.filter(({ side }) => side === 'front')) {
      const frontX = toFront(front, positions.get(front.run.id).x);
      const back = bases.find((entry) => entry.side === 'back' && !paired.has(entry.run.id)
        && Math.abs(toFront(entry, positions.get(entry.run.id).x) - frontX) <= 1 / 32 + EPSILON);
      if (!back) continue;
      const pair = { front: front.run.id, back: back.run.id };
      positions.get(front.run.id).pair = pair;
      positions.get(back.run.id).pair = pair;
      paired.add(back.run.id);
    }
  }
  return positions;
}
