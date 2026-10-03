import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from './constants.js';
import {
  followCreatesCycle,
  isJointAnchor,
  jointEdgeX,
  jointMembers,
} from './joints.js';
import { wallLength } from './geometry.js';
import { validateRunPlacement, verticalStart } from './overlap.js';
import { resolveProfile } from './profile.js';
import { stretchedStart } from './positions.js';
import { runWidthRange } from './splitRun.js';
import {
  STACK_EDGES,
  outerBottom,
  outerTop,
  stackCreatesCycle,
  stackLink,
} from './stacks.js';
import { wallSideOf } from './wallSides.js';
import { cloneRoom } from './roomClone.js';
import { endMinWidthsForRun } from './runAnchors.js';
import { syncRoom } from './roomSync.js';

const PIN_EPSILON = 1e-6;
const JOIN_EDGE_TOLERANCE = 0.015625;

/** Stack a run on another run's top (edge 'below') or under another run's bottom (edge 'above'), one-way. */
export function joinStack(room, wallId, runId, edge, leaderRunId, settings) {
  if (edge !== 'below' && edge !== 'above') return { ok: false, reason: 'stack-edge', room };
  const resolvedRoom = syncRoom(room, settings);
  const wall = resolvedRoom.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  const leader = wall?.runs.find((candidate) => candidate.id === leaderRunId);
  if (!run || !leader) return { ok: false, reason: 'run-not-found', room };
  if (wallSideOf(run) !== wallSideOf(leader)) return { ok: false, reason: 'stack-wall-side', room };
  if (Math.min(run.x + run.width, leader.x + leader.width) - Math.max(run.x, leader.x) <= PIN_EPSILON) {
    return { ok: false, reason: 'stack-no-overlap', room };
  }
  if (stackCreatesCycle(wall, runId, leaderRunId)) return { ok: false, reason: 'stack-cycle', room };

  const temporary = cloneRoom(resolvedRoom);
  const mutableRun = temporary.walls.find((candidate) => candidate.id === wallId)
    .runs.find((candidate) => candidate.id === runId);
  mutableRun.stack = {
    below: null,
    above: null,
    ...mutableRun.stack,
    [edge]: { runId: leaderRunId, offset: 0 },
  };
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedWall.runs.find((candidate) => candidate.id === runId),
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced }
    : { ok: false, reason: validation.reason, room };
}

/** Stack a newly drawn run on the run whose top it touches and under the run whose bottom it touches. */
export function joinTouchingStack(room, wallId, runId, settings) {
  let current = syncRoom(room, settings);
  const joined = [];
  for (const edge of STACK_EDGES) {
    const wall = current.walls.find((candidate) => candidate.id === wallId);
    const run = wall?.runs.find((candidate) => candidate.id === runId);
    if (!run) return { ok: false, reason: 'run-not-found', room, joined };
    if (stackLink(run, edge)) continue;
    const profile = resolveProfile(settings, current, wall);
    const line = edge === 'below' ? outerBottom(run) : outerTop(wall, run, profile);
    const leader = wall.runs.find((candidate) => candidate.id !== runId
      && wallSideOf(candidate) === wallSideOf(run)
      && Math.min(candidate.x + candidate.width, run.x + run.width)
        - Math.max(candidate.x, run.x) > PIN_EPSILON
      && Math.abs((edge === 'below' ? outerTop(wall, candidate, profile) : outerBottom(candidate))
        - line) <= JOIN_EDGE_TOLERANCE);
    if (!leader) continue;
    const result = joinStack(current, wallId, runId, edge, leader.id, settings);
    if (result.ok) {
      current = result.room;
      joined.push({ edge, runId: leader.id });
    }
  }
  return { ok: true, reason: null, room: current, joined };
}

export function runEdgeX(run, side) {
  return side === 'left' ? run.x : run.x + run.width;
}

export function runsOverlapVertically(a, b) {
  return Math.min(a.z + a.height, b.z + b.height)
    - Math.max(verticalStart(a), verticalStart(b)) > 0;
}

export function withoutAuto(end) {
  const { auto, ...manualEnd } = end;
  void auto;
  return manualEnd;
}

/** Join one run edge to another edge or its joint; an already-anchored target edge is followed one-way. */
export function joinEdges(room, wallId, source, target, settings) {
  const validSide = (side) => side === 'left' || side === 'right';
  if (!validSide(source?.side) || !validSide(target?.side)) {
    return { ok: false, reason: 'run-not-found', room };
  }
  if (source.runId === target.runId) {
    return { ok: false, reason: 'joint-same-run', room };
  }

  const resolvedRoom = syncRoom(room, settings);
  const sourceWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === source.runId);
  const targetRun = sourceWall?.runs.find((run) => run.id === target.runId);
  if (!sourceWall || !sourceRun || !targetRun) {
    return { ok: false, reason: 'run-not-found', room };
  }
  if (wallSideOf(sourceRun) !== wallSideOf(targetRun)) {
    return { ok: false, reason: 'joint-other-side', room };
  }

  const targetAnchor = targetRun.anchors?.[target.side];
  const follow = Boolean(targetAnchor) && !isJointAnchor(targetAnchor);
  if (follow && followCreatesCycle(sourceWall, source.runId, target.runId)) {
    return { ok: false, reason: 'follow-cycle', room };
  }

  const jointId = follow ? null : isJointAnchor(targetAnchor) ? targetAnchor.jointId : uuid();
  const otherSide = source.side === 'left' ? 'right' : 'left';
  if (!follow && sourceRun.anchors?.[otherSide]?.jointId === jointId) {
    return { ok: false, reason: 'joint-same-run', room };
  }
  const jointX = isJointAnchor(targetAnchor)
    ? sourceWall.joints.find((joint) => joint.id === jointId)?.x
    : runEdgeX(targetRun, target.side);
  if (!Number.isFinite(jointX)) {
    return { ok: false, reason: 'run-not-found', room };
  }

  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const mutableSource = wall.runs.find((run) => run.id === source.runId);
  const mutableTarget = wall.runs.find((run) => run.id === target.runId);
  if (!follow && !isJointAnchor(targetAnchor)) {
    wall.joints ??= [];
    wall.joints.push({ id: jointId, x: jointX, wallSide: wallSideOf(sourceRun) });
    mutableTarget.anchors[target.side] = { to: 'joint', jointId, offset: 0 };
  }
  const otherEdge = runEdgeX(mutableSource, otherSide);
  mutableSource.x = source.side === 'left' ? jointX : otherEdge;
  mutableSource.width = source.side === 'left' ? otherEdge - jointX : jointX - otherEdge;
  mutableSource.anchors[source.side] = follow
    ? { to: 'follow', runId: target.runId, side: target.side, offset: 0 }
    : { to: 'joint', jointId, offset: 0 };
  mutableSource.ends[source.side] = { ...mutableSource.ends[source.side], auto: true };
  if (!follow) {
    mutableTarget.ends[target.side] = { ...mutableTarget.ends[target.side], auto: true };
  }

  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedSource = resolvedWall.runs.find((run) => run.id === source.runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedSource,
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced, ...(follow ? { follow: true } : {}) }
    : { ok: false, reason: validation.reason, room };
}

/** Join or follow both touching sides of a newly placed run, preferring existing joints. */
export function joinTouchingEdges(room, wallId, runId, settings) {
  let nextRoom = syncRoom(room, settings);
  const joined = [];

  for (const side of ['left', 'right']) {
    const wall = nextRoom.walls.find((candidate) => candidate.id === wallId);
    const run = wall?.runs.find((candidate) => candidate.id === runId);
    if (!wall || !run) return { ok: false, reason: 'run-not-found', room, joined };
    if (run.anchors?.[side]) continue;
    const opposite = side === 'left' ? 'right' : 'left';
    const edge = runEdgeX(run, side);
    const candidates = wall.runs
      .filter((candidate) => (
        candidate.id !== runId
        && wallSideOf(candidate) === wallSideOf(run)
        && runsOverlapVertically(run, candidate)
      ))
      .map((candidate) => ({
        run: candidate,
        anchor: candidate.anchors?.[opposite],
      }))
      .filter(({ run: candidate }) => (
        Math.abs(runEdgeX(candidate, opposite) - edge) <= JOIN_EDGE_TOLERANCE
      ))
      .sort((a, b) => Number(isJointAnchor(b.anchor)) - Number(isJointAnchor(a.anchor)));
    const target = candidates[0]?.run;
    if (!target) continue;
    const result = joinEdges(
      nextRoom,
      wallId,
      { runId, side },
      { runId: target.id, side: opposite },
      settings,
    );
    if (!result.ok) return { ...result, joined };
    nextRoom = result.room;
    joined.push({ runId: target.id, side: opposite });
  }

  return { ok: true, reason: null, room: nextRoom, joined };
}

/** Disconnect every member of a joint without moving any run edge. */
export function dissolveJoint(room, wallId, jointId, settings) {
  const temporary = cloneRoom(syncRoom(room, settings));
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const joint = wall?.joints?.find((candidate) => candidate.id === jointId);
  if (!wall || !joint) return { ok: false, reason: 'joint-not-found', room };

  for (const member of jointMembers(wall, jointId)) {
    const run = wall.runs.find((candidate) => candidate.id === member.runId);
    run.anchors[member.side] = false;
    run.ends[member.side] = withoutAuto(run.ends[member.side]);
  }
  wall.joints = wall.joints.filter((candidate) => candidate.id !== jointId);
  return { ok: true, reason: null, room: syncRoom(temporary, settings) };
}

/** Resize a run, moving joined sides through their joints as needed. */
export function resizeRun(room, wallId, runId, width, grow, settings) {
  if (!Number.isFinite(width) || width <= 0 || !['left', 'both', 'right'].includes(grow)) {
    return { ok: false, reason: 'invalid-width', room };
  }
  const resolvedRoom = syncRoom(room, settings);
  const wall = resolvedRoom.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  if (!wall || !run) return { ok: false, reason: 'run-not-found', room };

  const desiredLeft = stretchedStart(run.x, run.width, width, grow);
  const desiredRight = desiredLeft + width;
  let nextRoom = resolvedRoom;
  for (const side of ['left', 'right']) {
    const anchor = run.anchors?.[side];
    if (!isJointAnchor(anchor)) continue;
    const desiredEdge = side === 'left' ? desiredLeft : desiredRight;
    if (Math.abs(desiredEdge - runEdgeX(run, side)) <= PIN_EPSILON) continue;
    const jointX = side === 'right'
      ? desiredEdge + (anchor.offset ?? 0)
      : desiredEdge - (anchor.offset ?? 0);
    const moved = moveJoint(nextRoom, wallId, anchor.jointId, jointX, settings);
    if (!moved.ok) return { ok: false, reason: moved.reason, room };
    nextRoom = moved.room;
  }

  const nextWall = nextRoom.walls.find((candidate) => candidate.id === wallId);
  const nextRun = nextWall.runs.find((candidate) => candidate.id === runId);
  const leftJoined = isJointAnchor(nextRun.anchors?.left);
  const rightJoined = isJointAnchor(nextRun.anchors?.right);
  if (!leftJoined || !rightJoined) {
    const temporary = cloneRoom(nextRoom);
    const mutableWall = temporary.walls.find((candidate) => candidate.id === wallId);
    const mutableRun = mutableWall.runs.find((candidate) => candidate.id === runId);
    if (leftJoined) {
      mutableRun.width = width;
    } else if (rightJoined) {
      mutableRun.x = runEdgeX(mutableRun, 'right') - width;
      mutableRun.width = width;
    } else {
      mutableRun.x = desiredLeft;
      mutableRun.width = width;
    }
    const synced = syncRoom(temporary, settings);
    const syncedWall = synced.walls.find((candidate) => candidate.id === wallId);
    const syncedRun = syncedWall.runs.find((candidate) => candidate.id === runId);
    const validation = validateRunPlacement(
      { ...syncedWall, length: wallLength(syncedWall) },
      syncedRun,
      settings,
    );
    if (!validation.ok) return { ok: false, reason: validation.reason, room };
    nextRoom = synced;
  }

  return { ok: true, reason: null, room: nextRoom };
}

export function jointXRange(resolvedRoom, wall, jointId, settings, { excludeRunId = null } = {}) {
  const members = jointMembers(wall, jointId);
  const runsById = new Map(wall.runs.map((run) => [run.id, run]));
  const length = wallLength(wall);
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  let min = -Infinity;
  let max = Infinity;
  let minLimit = null;
  let maxLimit = null;
  const constrainMin = (value, limit) => {
    if (value > min) {
      min = value;
      minLimit = limit;
    }
  };
  const constrainMax = (value, limit) => {
    if (value < max) {
      max = value;
      maxLimit = limit;
    }
  };

  for (const member of members) {
    if (member.runId === excludeRunId) continue;
    const run = runsById.get(member.runId);
    if (!run) continue;
    const offset = member.offset ?? 0;
    const widthRange = runWidthRange(run, settings, {
      endMinWidths: endMinWidthsForRun(resolvedRoom, wall, run, settings),
    });
    const rigid = Number.isFinite(widthRange.max);
    const widthLimit = { runId: run.id, reason: rigid ? 'fixed-width' : 'min-width' };
    const wallLimit = { runId: run.id, reason: 'wall-bounds' };

    if (member.side === 'right') {
      const otherEdge = run.x;
      constrainMin(otherEdge + widthRange.min + offset, widthLimit);
      if (rigid) constrainMax(otherEdge + widthRange.max + offset, widthLimit);
      constrainMin(-maxRunOverhang + offset, wallLimit);
      constrainMax(length + maxRunOverhang + offset, wallLimit);
    } else {
      const otherEdge = run.x + run.width;
      constrainMax(otherEdge - widthRange.min - offset, widthLimit);
      if (rigid) constrainMin(otherEdge - widthRange.max - offset, widthLimit);
      constrainMin(-maxRunOverhang - offset, wallLimit);
      constrainMax(length + maxRunOverhang - offset, wallLimit);
    }
  }

  return { min, max, minLimit, maxLimit };
}

/** Move a wall joint within the width and wall limits of all its member runs. */
export function moveJoint(room, wallId, jointId, x, settings) {
  if (!Number.isFinite(x)) {
    return {
      ok: false,
      reason: 'joint-not-found',
      room,
      x,
      range: null,
      limit: null,
    };
  }

  const resolvedRoom = syncRoom(room, settings);
  const sourceWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const sourceJoint = sourceWall?.joints?.find((joint) => joint.id === jointId);
  if (!sourceWall || !sourceJoint) {
    return {
      ok: false,
      reason: 'joint-not-found',
      room,
      x,
      range: null,
      limit: null,
    };
  }

  const members = jointMembers(sourceWall, jointId);
  const { min, max, minLimit, maxLimit } = jointXRange(
    resolvedRoom,
    sourceWall,
    jointId,
    settings,
  );
  const range = { min, max };
  if (min > max + PIN_EPSILON) {
    return {
      ok: false,
      reason: 'over-constrained',
      room,
      x: sourceJoint.x,
      range,
      limit: null,
    };
  }

  const clampedX = Math.max(min, Math.min(x, max));
  const limit = x < min ? minLimit : x > max ? maxLimit : null;
  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const joint = wall.joints.find((candidate) => candidate.id === jointId);
  joint.x = clampedX;
  for (const member of members) {
    const runIndex = wall.runs.findIndex((run) => run.id === member.runId);
    if (runIndex < 0) continue;
    const run = wall.runs[runIndex];
    const edge = jointEdgeX(joint, member.side, member.offset);
    const otherEdge = member.side === 'right' ? run.x : run.x + run.width;
    wall.runs[runIndex] = {
      ...run,
      x: member.side === 'left' ? edge : otherEdge,
      width: member.side === 'left' ? otherEdge - edge : edge - otherEdge,
    };
  }
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const memberIds = new Set(members.map((member) => member.runId));

  for (const member of members) {
    const resolvedRun = resolvedWall.runs.find((run) => run.id === member.runId);
    const validation = validateRunPlacement({
      ...resolvedWall,
      length: wallLength(resolvedWall),
      runs: resolvedWall.runs.filter((run) => (
        run.id === member.runId || !memberIds.has(run.id)
      )),
    }, resolvedRun, settings);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        room,
        x: clampedX,
        range,
        limit,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    room: synced,
    x: clampedX,
    range,
    limit,
  };
}
