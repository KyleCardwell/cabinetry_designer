import { DEFAULT_SETTINGS } from './constants.js';
import { cornerAt } from './corners.js';
import { wallFrame, wallLength } from './geometry.js';
import { followLeaders } from './joints.js';
import { validateRunPlacement } from './overlap.js';
import { endMinWidthsForRun, horizontalResolution } from './runAnchors.js';
import { pinTargetsForRun } from './runPins.js';
import { runFlexNeeds } from './splitRun.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

/**
 * Each run flexes only its own edges on the 1/16" grid, within settings.runFlex. Free ends can
 * grow or shrink; opening, soffit and recess offsets can grow only into their gap. Wall anchors
 * at corners, joints, follow edges and edges touching another run hold at zero. Free wall ends grow
 * only outward, decided by the first front run that moves (lowest z first); other runs follow.
 * Runs with holdWidth or no needs hold their undecided edges. Flex never changes the drawn auto box count.
 *
 * A need uses the sum of its listed edges' outward moves. Choose, in order: fewest unmet exact
 * needs, lowest met candidate indexes, fewest missed filler raises, least offset movement, smallest
 * largest edge move, least total movement, then most right-edge movement. Elastic needs must stay
 * in range. Try choices in that order until one places; only growth beyond the drawn span needs
 * validation, excluding followers, and an already invalid run is not blocked. Leaders solve before
 * followers on both faces; followers re-resolve against moved leaders before flexing their own ends.
 *
 * The room sync stores the result in run.x / run.width and records
 * run.flex = { left, right, x, width, boxes? }: outward edge moves (+ grows, − shrinks), the written
 * span, and a flex filler's remembered box sizes (run, or left/right beside pins). unflexRoom takes
 * the previous flex back out before syncing so nothing drifts. Edited edges keep their drawn
 * position; a translated run keeps its flex. wall._endFlex records non-zero free wall end moves.
 */

const EPSILON = 1e-6;
const STEP = 1 / 16;

const grid = (value) => Math.round(value / STEP) * STEP;

/** The run's drawn span: its stored span with the last sync's flex taken back out. */
export function unflexRun(run) {
  const record = run.flex;
  if (!record) return run;
  const { flex, ...rest } = run;
  void flex;
  const left = run.x;
  const right = run.x + run.width;
  const translated = Math.abs(run.width - record.width) <= EPSILON;
  const keepLeft = translated || Math.abs(left - record.x) <= EPSILON;
  const keepRight = translated || Math.abs(right - (record.x + record.width)) <= EPSILON;
  const x = left + (keepLeft ? record.left ?? 0 : 0);
  const drawnRight = right - (keepRight ? record.right ?? 0 : 0);
  return {
    ...rest,
    x,
    width: drawnRight - x,
    ...(translated && record.boxes ? { _flexBoxes: record.boxes } : {}),
  };
}

function hasFlex(wall) {
  return Object.hasOwn(wall, '_endFlex') || wall.runs.some((run) => run.flex);
}

/** Take every run's and wall end's flex back out before a sync. */
export function unflexRoom(room) {
  if (!room.walls.some(hasFlex)) return room;
  return {
    ...room,
    walls: room.walls.map((wall) => {
      if (!hasFlex(wall)) return wall;
      const { _endFlex, ...rest } = wall;
      void _endFlex;
      return { ...rest, runs: wall.runs.map(unflexRun) };
    }),
  };
}

/** How far one run edge may move out (+) or in (−) on its own, and what kind of edge it is. */
function flexEdge(run, side, settings, tolerance) {
  const anchor = run.anchors?.[side];
  if (!anchor) return { kind: 'free', lo: -tolerance, hi: tolerance };
  const offsetEdge = (gap) => ({
    kind: 'offset',
    lo: -tolerance,
    hi: Math.min(tolerance, Math.max(0, gap)),
  });
  if (anchor.to === 'opening') {
    return offsetEdge(anchor.clearance ?? settings.casingClearance ?? DEFAULT_SETTINGS.casingClearance);
  }
  if (anchor.to === 'soffit' || anchor.to === 'recess') return offsetEdge(anchor.offset ?? 0);
  return { kind: 'hard', lo: 0, hi: 0 };
}

function followsEdge(other, run) {
  return ['left', 'right'].some((side) => (
    other.anchors?.[side]?.to === 'follow' && other.anchors[side].runId === run.id));
}

/**
 * Whether a run edge sits flush against another run on the same face that overlaps it vertically
 * without a joint: flex would open a gap there or push into it, so the edge holds.
 */
function touches(wall, run, side) {
  if (run.anchors?.[side]) return false;
  const edge = side === 'left' ? run.x : run.x + run.width;
  return wall.runs.some((other) => other.id !== run.id
    && !followsEdge(other, run)
    && wallSideOf(other) === wallSideOf(run)
    && Math.min(run.z + run.height, other.z + other.height) - Math.max(run.z, other.z) > EPSILON
    && Math.abs((side === 'left' ? other.x + other.width : other.x) - edge) <= EPSILON);
}

/** The physical free wall endpoint for a wall-anchored edge, viewed from the run's face. */
function freeWallEndpoint(room, wall, run, side) {
  if (run.anchors?.[side] !== true) return null;
  const view = wallViewForRun(wall, run);
  if (cornerAt(room, view, side).type !== 'open') return null;
  const frame = wallFrame(room, view);
  return side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
}

/** The allowed outward movement of one edge; flexEdge already expresses outward ranges. */
function flexRange(room, wall, run, side, settings, t, endMoves) {
  const endpoint = freeWallEndpoint(room, wall, run, side);
  if (endpoint) {
    if (wallSideOf(run) === 'front' && !Object.hasOwn(endMoves, endpoint)) {
      return { kind: 'wallEnd', lo: 0, hi: t, endpoint };
    }
    return { kind: 'fixed', move: endMoves[endpoint] ?? 0 };
  }
  if (run.anchors?.[side] === true || touches(wall, run, side)) return { kind: 'fixed', move: 0 };
  const edge = flexEdge(run, side, settings, t);
  return edge.kind === 'hard' ? { kind: 'fixed', move: 0 } : edge;
}

/** Every sixteenth-grid value inside a range, without rounding past either bound. */
function rangeValues({ kind, move, lo, hi }) {
  if (kind === 'fixed') return [move];
  const values = [];
  const first = Math.ceil((lo - EPSILON) / STEP);
  const last = Math.floor((hi + EPSILON) / STEP);
  for (let index = first; index <= last; index += 1) values.push(index === 0 ? 0 : index * STEP);
  return values;
}

function compareCosts(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    const difference = a[index] - b[index];
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return 0;
}

function placementOk(wall, run, settings) {
  const view = wallViewForRun(wall, run);
  return validateRunPlacement({ ...view, length: wallLength(view) }, run, settings).ok;
}

/** A run's needs, including remembered flex-filler box sizes. */
function runModel(room, wall, run, settings) {
  const { _flexBoxes: priorBoxes, ...withoutPrior } = run;
  const clean = Object.hasOwn(run, '_flexBoxes') ? withoutPrior : run;
  const opts = {
    endMinWidths: endMinWidthsForRun(room, wall, clean, settings),
    pinTargets: pinTargetsForRun(clean, wall, wallLength(wall), settings),
  };
  const needs = runFlexNeeds(clean, settings, opts).map((need) => {
    const prior = priorBoxes?.[need.key];
    const raise = need.raise && Number.isFinite(prior) && prior > need.box + EPSILON
      ? need.raise(prior)
      : null;
    return {
      ...need,
      ...(need.elastic && raise !== null ? {
        elastic: { lo: need.elastic.lo, hi: Math.max(need.elastic.hi, raise + (need.elastic.hi - need.elastic.lo)) },
      } : {}),
      raise,
    };
  });
  return { run: clean, needs, opts };
}

/** A run moved by two outward edge moves, with its flex record and filler box sizes. */
function flexedRun(model, left, right, settings) {
  const { run, opts } = model;
  left = grid(left);
  right = grid(right);
  const moved = Math.abs(left) > EPSILON || Math.abs(right) > EPSILON;
  const next = moved ? { ...run, x: run.x - left, width: run.width + left + right } : run;
  const boxes = {};
  for (const need of runFlexNeeds(next, settings, opts)) {
    if (need.box !== null && need.box !== undefined) boxes[need.key] = need.box;
  }
  const hasBoxes = Object.keys(boxes).length > 0;
  if (!moved && !hasBoxes) return run;
  return {
    ...next,
    flex: {
      left,
      right,
      x: next.x,
      width: next.width,
      ...(hasBoxes ? { boxes } : {}),
    },
  };
}

/** Enumerate this run's independent edge choices and take the cheapest one that places. */
function solveRun(room, wall, run, settings, t, endMoves) {
  const model = runModel(room, wall, run, settings);
  const fixed = run.holdWidth === true || model.needs.length === 0;
  const ranges = Object.fromEntries(['left', 'right'].map((side) => {
    const range = flexRange(room, wall, run, side, settings, t, endMoves);
    return [side, fixed && range.kind !== 'fixed' ? { kind: 'fixed', move: 0 } : range];
  }));
  const options = [];
  for (const left of rangeValues(ranges.left)) {
    for (const right of rangeValues(ranges.right)) {
      const moves = { left, right };
      let unmet = 0;
      let candidateIndexes = 0;
      let missedRaises = 0;
      let feasible = true;
      for (const need of model.needs) {
        const change = need.edges.reduce((sum, side) => sum + moves[side], 0);
        if (need.elastic) {
          if (change < need.elastic.lo - EPSILON || change > need.elastic.hi + EPSILON) {
            feasible = false;
            break;
          }
          if (need.raise !== null && change < need.raise - EPSILON) missedRaises += 1;
        } else {
          const index = need.candidates.findIndex((candidate) => Math.abs(candidate - change) <= EPSILON);
          if (index < 0) unmet += 1;
          else candidateIndexes += index;
        }
      }
      if (!feasible) continue;
      options.push({
        left,
        right,
        cost: [
          unmet,
          candidateIndexes,
          missedRaises,
          (ranges.left.kind === 'offset' ? Math.abs(left) : 0)
            + (ranges.right.kind === 'offset' ? Math.abs(right) : 0),
          Math.max(Math.abs(left), Math.abs(right)),
          Math.abs(left) + Math.abs(right),
          -Math.abs(right),
        ],
      });
    }
  }
  options.sort((a, b) => compareCosts(a.cost, b.cost));
  const others = { ...wall, runs: wall.runs.filter((other) => !followsEdge(other, run)) };
  for (const { left, right } of options) {
    const next = flexedRun(model, left, right, settings);
    const grows = next.x < run.x - EPSILON || next.x + next.width > run.x + run.width + EPSILON;
    if (!grows || !placementOk(others, run, settings) || placementOk(others, next, settings)) return next;
  }
  return flexedRun(model, ranges.left.move ?? 0, ranges.right.move ?? 0, settings);
}

/** Leaders first, then front runs at free wall ends by height, then their back-face runs. */
function runOrder(room, wall) {
  const order = [];
  const endpoints = (run) => ['left', 'right']
    .map((side) => freeWallEndpoint(room, wall, run, side)).filter(Boolean);
  let pending = wall.runs;
  while (pending.length > 0) {
    const waiting = new Set(pending.map((run) => run.id));
    const ready = pending.filter((run) => followLeaders(run).every((id) => !waiting.has(id)));
    if (ready.length === 0) return [...order, ...pending];
    const preferred = ready.filter((run) => !pending.some((other) => other.id !== run.id
      && wallSideOf(other) === 'front'
      && (wallSideOf(run) === 'back' || other.z < run.z)
      && endpoints(other).some((endpoint) => endpoints(run).includes(endpoint))));
    const next = preferred[0] ?? ready[0];
    order.push(next);
    pending = pending.filter((run) => run.id !== next.id);
  }
  return order;
}

/** Flex one run at a time, re-resolving followers against moved leaders first. */
function flexWall(room, wall, settings, tolerance, decidedMoves = null) {
  if (wall.runs.length === 0) return wall;
  let current = wall;
  const moved = new Set();
  const deciding = decidedMoves === null;
  const endMoves = decidedMoves ?? {};
  if (deciding && tolerance > 0) {
    for (const run of wall.runs.filter((run) => wallSideOf(run) === 'front' && run.holdWidth === true)) {
      for (const side of ['left', 'right']) {
        const endpoint = freeWallEndpoint(room, wall, run, side);
        if (endpoint) endMoves[endpoint] = 0;
      }
    }
  }
  for (const original of runOrder(room, wall)) {
    let run = current.runs.find(({ id }) => id === original.id);
    const before = run;
    if (tolerance > 0 && followLeaders(run).some((id) => moved.has(id))) {
      const horizontal = horizontalResolution(room, current, run, settings);
      run = { ...run, x: horizontal.x, width: horizontal.width };
    }
    let next;
    if (tolerance > 0) next = solveRun(room, current, run, settings, tolerance, endMoves);
    else {
      const { _flexBoxes, ...rest } = run;
      void _flexBoxes;
      next = Object.hasOwn(run, '_flexBoxes') ? rest : run;
    }
    current = { ...current, runs: current.runs.map((other) => other.id === next.id ? next : other) };
    if (deciding && tolerance > 0 && wallSideOf(run) === 'front') {
      for (const side of ['left', 'right']) {
        const endpoint = freeWallEndpoint(room, current, run, side);
        const move = next.flex?.[side] ?? 0;
        if (endpoint && !Object.hasOwn(endMoves, endpoint) && move > EPSILON) endMoves[endpoint] = move;
      }
    }
    if (Math.abs(next.x - before.x) > EPSILON || Math.abs(next.width - before.width) > EPSILON) moved.add(next.id);
  }
  // An earlier run may have held at zero before a higher front run decided this endpoint.
  // Re-solve from the drawn spans with those decisions fixed, including any followers.
  if (deciding && current.runs.some((run) => ['left', 'right'].some((side) => {
    const endpoint = freeWallEndpoint(room, current, run, side);
    return endpoint && Math.abs((run.flex?.[side] ?? 0) - (endMoves[endpoint] ?? 0)) > EPSILON;
  }))) return flexWall(room, wall, settings, tolerance, endMoves);
  const nonzero = Object.fromEntries(Object.entries(endMoves).filter(([, move]) => move > EPSILON));
  return Object.keys(nonzero).length > 0 ? { ...current, _endFlex: nonzero } : current;
}

/** The last step of a room sync: flex every wall's runs (see the module comment). */
export function flexRoom(room, settings) {
  const tolerance = settings.runFlex ?? DEFAULT_SETTINGS.runFlex ?? 0;
  if (!(tolerance > 0) && !room.walls.some((wall) => wall.runs.some((run) => Object.hasOwn(run, '_flexBoxes')))) {
    return room;
  }
  return { ...room, walls: room.walls.map((wall) => flexWall(room, wall, settings, tolerance)) };
}
