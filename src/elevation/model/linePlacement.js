/**
 * Layout lines placing things (LL3: openings; LL4 adds runs and cells). See plans/LAYOUT-PLAN.md.
 * The line is the hard stop: an attached thing's `at` point sits on line + offset. No snap, no clamp;
 * validation reports what doesn't fit.
 */
import { wallFrame } from './geometry.js';
import { findLine, lineX } from './layoutLines.js';
import { openingReferenceRect } from './openings.js';
import { isJointAnchor } from './joints.js';
import { resolveWallSpans } from './placement.js';
import { positionReadouts } from './positions.js';
import { resolveRunAnchorDatum } from './runAnchors.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

const EPSILON = 1e-9;
const MIRROR_AT = { left: 'right', center: 'center', right: 'left' };
const AT_FRACTION = { left: 0, center: 0.5, right: 1 };

/** Where an attachment's point sits, in front-face coordinates, and which front-face point it is. */
export function attachPoint(line, attach, wallLength) {
  const onFace = lineX(line, wallLength) + attach.offset;
  if (wallSideOf(line) === 'back') {
    return { x: wallLength - onFace, at: MIRROR_AT[attach.at] };
  }
  return { x: onFace, at: attach.at };
}

/** The opening with its stored offset rewritten so its `at` point sits on the line (same object when it already does). */
export function placeOpeningOnLine(opening, line, wallLength, settings) {
  if (!opening.attach || !line) return opening;
  const reference = openingReferenceRect(opening, wallLength, settings);
  const { x, at } = attachPoint(line, opening.attach, wallLength);
  const left = x - AT_FRACTION[at] * reference.width;
  const offset = positionReadouts(left, reference.width, wallLength)
    [opening.offsetFrom][opening.offsetAnchor ?? 'edge'];
  return Math.abs(offset - opening.offset) < EPSILON ? opening : { ...opening, offset };
}

/** The attachment offset that puts the opening's `at` point exactly where the opening already is. */
export function attachOffsetHere(opening, line, at, wallLength, settings) {
  const reference = openingReferenceRect(opening, wallLength, settings);
  const back = wallSideOf(line) === 'back';
  const frontAt = back ? MIRROR_AT[at] : at;
  const point = reference.x + AT_FRACTION[frontAt] * reference.width;
  const onFace = back ? wallLength - point : point;
  return onFace - lineX(line, wallLength);
}

function placeWallOpenings(room, wall, settings) {
  if (!wall.openings?.some((opening) => opening.attach)) return wall;
  const length = wallFrame(room, wall).length;
  let changed = false;
  const openings = wall.openings.map((opening) => {
    if (!opening.attach) return opening;
    const placed = placeOpeningOnLine(opening, findLine(wall, opening.attach.lineId), length, settings);
    if (placed !== opening) changed = true;
    return placed;
  });
  return changed ? { ...wall, openings } : wall;
}

/** Sync stage: every attached opening on every wall takes its position from its line. */
export function placeAttachedOpenings(room, settings) {
  let changed = false;
  const walls = room.walls.map((wall) => {
    const placed = placeWallOpenings(room, wall, settings);
    if (placed !== wall) changed = true;
    return placed;
  });
  return changed ? { ...room, walls } : room;
}

const SIDES = ['left', 'right'];

/** Joint ownership is structural: a joint is held even when its run already sits on the line. */
function movableRunSides(run, held) {
  return SIDES.filter((side) => {
    const anchor = run.anchors?.[side];
    return !anchor || (isJointAnchor(anchor)
      && (!held.has(anchor.jointId) || held.get(anchor.jointId).runId === run.id));
  });
}

function drivenRunSides(run, held) {
  const movable = movableRunSides(run, held);
  return movable.length === 2 || run.attach.at === 'center'
    ? movable : movable.filter((side) => side === run.attach.at);
}

/** The first attached run in wall order that can drive a joint holds it; no geometry is read. */
export function lineHeldJoints(wall) {
  const held = new Map();
  for (const run of wall.runs ?? []) {
    const line = run.attach && findLine(wall, run.attach.lineId);
    if (!line || wallSideOf(line) !== wallSideOf(run)) continue;
    for (const side of drivenRunSides(run, held)) {
      const anchor = run.anchors?.[side];
      if (isJointAnchor(anchor)) {
        held.set(anchor.jointId, { lineId: line.id, runId: run.id });
      }
    }
  }
  return held;
}

function placeWallRuns(room, wall, settings) {
  if (!wall.runs?.some((run) => run.attach)) return wall;
  const held = lineHeldJoints(wall);
  const length = wallFrame(room, wall).length;
  let next = wall;
  const placedRuns = new Map();
  for (let index = 0; index < wall.runs.length; index += 1) {
    const run = next.runs[index];
    const line = run.attach && findLine(wall, run.attach.lineId);
    if (!line || wallSideOf(line) !== wallSideOf(run)) continue;
    const movable = drivenRunSides(run, held);
    if (!movable.length) continue;
    const view = wallViewForRun(next, run);
    const left = resolveRunAnchorDatum(room, view, run, 'left', settings);
    const right = resolveRunAnchorDatum(room, view, run, 'right', settings);
    if (left.error || right.error) continue;
    const target = lineX(line, length) + run.attach.offset;
    let x = left.x;
    let end = right.x;
    if (movable.length === 2) {
      x = target - AT_FRACTION[run.attach.at] * run.width;
      end = x + run.width;
    } else if (movable[0] === 'left') {
      x = run.attach.at === 'center' ? 2 * target - end : target;
    } else {
      end = run.attach.at === 'center' ? 2 * target - x : target;
    }
    let placed = run;
    if (Math.abs(x - run.x) >= EPSILON || Math.abs(end - run.x - run.width) >= EPSILON) {
      placed = { ...run, x, width: end - x };
    }
    placedRuns.set(run.id, placed);
    const joints = (next.joints ?? []).map((joint) => {
      for (const side of movable) {
        const anchor = run.anchors?.[side];
        if (!isJointAnchor(anchor) || anchor.jointId !== joint.id) continue;
        // Inverse of jointEdgeX: left adds the offset; right subtracts it.
        const jointX = side === 'left' ? x - (anchor.offset ?? 0) : end + (anchor.offset ?? 0);
        if (Math.abs(jointX - joint.x) >= EPSILON) return { ...joint, x: jointX };
      }
      return joint;
    });
    if (placed !== run || joints.some((joint, i) => joint !== next.joints[i])) {
      next = { ...next, joints, runs: next.runs.map((item, i) => i === index ? placed : item) };
    }
  }
  // Only changed walls need another edge pass: neighbours and follow chains read the moved datums.
  return next === wall ? wall : { ...next, runs: resolveWallSpans(room, next, settings, placedRuns) };
}

/** Sync stage after run-edges and before column target growth. */
export function placeAttachedRuns(room, settings) {
  let changed = false;
  const walls = room.walls.map((wall) => {
    const placed = placeWallRuns(room, wall, settings);
    if (placed !== wall) changed = true;
    return placed;
  });
  return changed ? { ...room, walls } : room;
}
