import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { cornerForRunSide, cornerReserve } from './corners.js';
import { isJointAnchor, jointEdgeX, jointMembers } from './joints.js';
import { landingsOn } from './landings.js';
import { recessEdges, recessEndType } from './recesses.js';
import { wallLength } from './geometry.js';
import { validateRunPlacement } from './overlap.js';
import { soffitEndType, soffitsOn } from './soffits.js';
import { roundTo } from './units.js';
import { wallViewForRun } from './wallSides.js';
import { cloneRun, cloneRoom } from './roomClone.js';
import { syncRoom } from './roomSync.js';
import { joinEdges, jointXRange, moveJoint, runsOverlapVertically } from './runJoins.js';

const STRETCH_EDGE_SNAP_DISTANCE = 2;
const PIN_EPSILON = 1e-6;

/**
 * Stretch one run edge, resolve its room geometry, and validate the result.
 *
 * @returns {{ok:boolean,reason:string|null,room:object}}
 */
export function stretchRun(room, wallId, runId, side, newEdgeX, settings, { exact = false } = {}) {
  if (side !== 'left' && side !== 'right') {
    return { ok: false, reason: 'invalid-side', room };
  }
  const sourceWall = room.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === runId);
  if (!sourceWall || !sourceRun || !Number.isFinite(newEdgeX)) {
    return { ok: false, reason: 'run-not-found', room };
  }
  const sideWall = wallViewForRun(sourceWall, sourceRun);
  const jointAnchor = sourceRun.anchors?.[side];
  if (isJointAnchor(jointAnchor)) {
    const offset = jointAnchor.offset ?? 0;
    const jointX = side === 'right' ? newEdgeX + offset : newEdgeX - offset;
    return moveJoint(room, wallId, jointAnchor.jointId, jointX, settings);
  }

  const length = wallLength(sideWall);
  const atEnd = (end) => ({
    ...sourceRun,
    anchors: { ...sourceRun.anchors, [end]: true },
  });
  const reserveLeft = cornerReserve(room, sideWall, 'left', atEnd('left'), settings);
  const reserveRight = cornerReserve(room, sideWall, 'right', atEnd('right'), settings);
  const candidates = [
    { value: 0, anchor: side === 'left' },
    { value: length, anchor: side === 'right' },
    { value: reserveLeft, anchor: side === 'left' },
    { value: length - reserveRight, anchor: side === 'right' },
    ...sideWall.runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => [
        { value: run.x, anchor: false, runId: run.id, side: 'left' },
        { value: run.x + run.width, anchor: false, runId: run.id, side: 'right' },
      ]),
    ...landingsOn(room, sideWall).flatMap((interval) => [
      {
        value: interval.b,
        anchor: side === 'left' && { to: 'wall', wallId: interval.wallId },
      },
      {
        value: interval.a,
        anchor: side === 'right' && { to: 'wall', wallId: interval.wallId },
      },
    ]),
    ...soffitsOn(sideWall).flatMap((soffit) => {
      const reachesSoffit = (
        sourceRun.cabinetTypeId === CABINET_TYPE_IDS.UPPER
        || sourceRun.cabinetTypeId === CABINET_TYPE_IDS.TALL
      ) && sourceRun.z + sourceRun.height > soffit.bottom;
      return [
        {
          value: soffit.x + soffit.width,
          anchor: reachesSoffit && side === 'left'
            ? { to: 'soffit', soffitId: soffit.id, offset: 0 }
            : false,
        },
        {
          value: soffit.x,
          anchor: reachesSoffit && side === 'right'
            ? { to: 'soffit', soffitId: soffit.id, offset: 0 }
            : false,
        },
      ];
    }),
    ...recessEdges(sideWall).map((edge) => ({
      value: edge.value,
      anchor: { to: 'recess', recessId: edge.recessId, edge: edge.edge, offset: 0 },
    })),
  ];

  let edge = exact ? newEdgeX : roundTo(newEdgeX, 0.5);
  let snapped = null;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.value - edge);
    if (distance > (exact ? 1e-9 : STRETCH_EDGE_SNAP_DISTANCE + 1e-9)) continue;
    if (!snapped
      || distance < snapped.distance - 1e-9
      || (Math.abs(distance - snapped.distance) <= 1e-9
        && candidate.anchor && !snapped.anchor)) {
      snapped = { ...candidate, distance };
    }
  }
  if (snapped) edge = snapped.value;

  const fixedEdge = side === 'left' ? sourceRun.x + sourceRun.width : sourceRun.x;
  const unclampedEdge = edge;
  edge = side === 'left'
    ? Math.min(edge, fixedEdge - settings.minRunWidth)
    : Math.max(edge, fixedEdge + settings.minRunWidth);
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  if (edge < -maxRunOverhang || edge > length + maxRunOverhang) {
    return { ok: false, reason: 'out-of-bounds', room };
  }
  const anchorsAtSnap = snapped && Math.abs(edge - unclampedEdge) <= 1e-9
    ? snapped.anchor || false
    : false;
  const proposed = {
    ...sourceRun,
    x: side === 'left' ? edge : sourceRun.x,
    width: side === 'left' ? fixedEdge - edge : edge - fixedEdge,
    anchors: { ...sourceRun.anchors, [side]: anchorsAtSnap },
    ends: {
      left: { ...sourceRun.ends.left },
      right: { ...sourceRun.ends.right },
    },
  };
  if (anchorsAtSnap) {
    if (anchorsAtSnap.to === 'soffit') {
      proposed.ends[side] = {
        type: soffitEndType(sideWall, proposed, side, anchorsAtSnap, settings),
        width: null,
      };
    } else if (anchorsAtSnap.to === 'recess') {
      proposed.ends[side] = { type: recessEndType(sideWall, proposed, side), width: null };
    } else {
      const inside = cornerForRunSide(room, sideWall, proposed, side).type === 'inside';
      if (inside && proposed.ends[side].type !== 'blind') {
        proposed.ends[side] = { type: 'filler', width: null };
      } else if (!inside && proposed.ends[side].type !== 'end_panel') {
        proposed.ends[side] = { type: 'end_panel', width: null };
      }
    }
  }

  const temporary = cloneRoom(room);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const runIndex = wall.runs.findIndex((candidate) => candidate.id === runId);
  wall.runs[runIndex] = cloneRun(proposed);
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedRun,
    settings,
  );
  if (!validation.ok) return { ok: false, reason: validation.reason, room };

  const snappedRun = snapped?.runId
    ? resolvedWall.runs.find((candidate) => candidate.id === snapped.runId)
    : null;
  const buttingRunEdge = snappedRun
    && snapped.side !== side
    && Math.abs(edge - unclampedEdge) <= PIN_EPSILON
    && runsOverlapVertically(resolvedRun, snappedRun);
  if (buttingRunEdge) {
    const joined = joinEdges(
      synced,
      wallId,
      { runId, side },
      { runId: snapped.runId, side: snapped.side },
      settings,
    );
    if (joined.ok) {
      return {
        ok: true,
        reason: null,
        room: joined.room,
        joined: { runId: snapped.runId, side: snapped.side },
      };
    }
  }
  return { ok: true, reason: null, room: synced };
}

/**
 * Move a run along its wall without changing its width, snapping either edge to the
 * same candidates stretchRun snaps to, then resolve and validate the room.
 *
 * @returns {{ok:boolean,reason:string|null,room:object,snap:{value:number,edge:string}|null}}
 */
export function moveRun(room, wallId, runId, newX, settings, { exact = false } = {}) {
  const sourceWall = room.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === runId);
  if (!sourceWall || !sourceRun || !Number.isFinite(newX)) {
    return { ok: false, reason: 'run-not-found', room, snap: null };
  }
  const anchors = [sourceRun.anchors?.left, sourceRun.anchors?.right];
  if (anchors.some((anchor) => anchor && !isJointAnchor(anchor))) {
    return { ok: false, reason: 'anchored', room, snap: null };
  }

  if (!anchors.some(isJointAnchor)) {
    const length = wallLength(sourceWall);
    const candidates = [
      0,
      length,
      cornerReserve(room, sourceWall, 'left', sourceRun, settings),
      length - cornerReserve(room, sourceWall, 'right', sourceRun, settings),
      ...wallViewForRun(sourceWall, sourceRun).runs
        .filter((run) => run.id !== runId)
        .flatMap((run) => [run.x, run.x + run.width]),
      ...landingsOn(room, wallViewForRun(sourceWall, sourceRun))
        .flatMap((interval) => [interval.a, interval.b]),
      ...recessEdges(wallViewForRun(sourceWall, sourceRun)).map((edge) => edge.value),
    ];

    let x = exact ? newX : roundTo(newX, 0.5);
    let snap = null;
    for (const candidate of candidates) {
      for (const edge of ['left', 'right']) {
        const edgeX = edge === 'left' ? x : x + sourceRun.width;
        const distance = Math.abs(candidate - edgeX);
        if (distance > (exact ? 1e-9 : STRETCH_EDGE_SNAP_DISTANCE + 1e-9)) continue;
        if (snap && distance >= snap.distance - 1e-9) continue;
        snap = { value: candidate, edge, distance };
      }
    }
    if (snap) x = snap.edge === 'left' ? snap.value : snap.value - sourceRun.width;

    const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
    if (x < -maxRunOverhang || x + sourceRun.width > length + maxRunOverhang) {
      return { ok: false, reason: 'out-of-bounds', room, snap: null };
    }

    const temporary = cloneRoom(room);
    const wall = temporary.walls.find((candidate) => candidate.id === wallId);
    const runIndex = wall.runs.findIndex((candidate) => candidate.id === runId);
    wall.runs[runIndex] = cloneRun({ ...sourceRun, x });
    const synced = syncRoom(temporary, settings);
    const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
    const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === runId);
    const validation = validateRunPlacement(
      { ...resolvedWall, length: wallLength(resolvedWall) },
      resolvedRun,
      settings,
    );
    return validation.ok
      ? {
          ok: true,
          reason: null,
          room: synced,
          snap: snap ? { value: snap.value, edge: snap.edge } : null,
          x,
          range: null,
          limit: null,
          joints: false,
        }
      : { ok: false, reason: validation.reason, room, snap: null };
  }

  const resolvedRoom = syncRoom(room, settings);
  const resolvedWall = resolvedRoom.walls.find((wall) => wall.id === wallId);
  const resolvedRun = resolvedWall.runs.find((run) => run.id === runId);
  const jointIds = [...new Set(['left', 'right']
    .map((side) => resolvedRun.anchors?.[side])
    .filter(isJointAnchor)
    .map((anchor) => anchor.jointId))];
  const joints = jointIds.map((jointId) => ({
    joint: resolvedWall.joints.find((joint) => joint.id === jointId),
    members: jointMembers(resolvedWall, jointId),
  }));
  const movingEdges = new Map();
  for (const { members } of joints) {
    for (const member of members) {
      if (member.runId === runId) continue;
      if (!movingEdges.has(member.runId)) movingEdges.set(member.runId, new Set());
      movingEdges.get(member.runId).add(member.side);
    }
  }

  const length = wallLength(resolvedWall);
  const candidates = [
    0,
    length,
    cornerReserve(resolvedRoom, resolvedWall, 'left', resolvedRun, settings),
    length - cornerReserve(resolvedRoom, resolvedWall, 'right', resolvedRun, settings),
    ...wallViewForRun(resolvedWall, resolvedRun).runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => {
        const edges = movingEdges.get(run.id);
        return [
          ...(edges?.has('left') ? [] : [run.x]),
          ...(edges?.has('right') ? [] : [run.x + run.width]),
        ];
      }),
  ];

  let x = exact ? newX : roundTo(newX, 0.5);
  let snap = null;
  for (const candidate of candidates) {
    for (const edge of ['left', 'right']) {
      const edgeX = edge === 'left' ? x : x + resolvedRun.width;
      const distance = Math.abs(candidate - edgeX);
      if (distance > (exact ? 1e-9 : STRETCH_EDGE_SNAP_DISTANCE + 1e-9)) continue;
      if (snap && distance >= snap.distance - 1e-9) continue;
      snap = { value: candidate, edge, distance };
    }
  }
  if (snap) x = snap.edge === 'left' ? snap.value : snap.value - resolvedRun.width;

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
  for (const { joint } of joints) {
    const jointRange = jointXRange(
      resolvedRoom,
      resolvedWall,
      joint.id,
      settings,
      { excludeRunId: runId },
    );
    constrainMin(jointRange.min - joint.x, jointRange.minLimit);
    constrainMax(jointRange.max - joint.x, jointRange.maxLimit);
  }
  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const wallLimit = { runId, reason: 'wall-bounds' };
  constrainMin(-maxRunOverhang - resolvedRun.x, wallLimit);
  constrainMax(length + maxRunOverhang - (resolvedRun.x + resolvedRun.width), wallLimit);

  const range = { min, max };
  if (min > max + PIN_EPSILON) {
    return {
      ok: false,
      reason: 'over-constrained',
      room,
      snap: null,
      x: resolvedRun.x,
      range,
      limit: null,
      joints: true,
    };
  }

  const requestedDx = x - resolvedRun.x;
  const dx = Math.max(min, Math.min(requestedDx, max));
  const movedX = resolvedRun.x + dx;
  const limit = requestedDx < min ? minLimit : requestedDx > max ? maxLimit : null;
  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  for (const { joint: sourceJoint, members } of joints) {
    const joint = wall.joints.find((candidate) => candidate.id === sourceJoint.id);
    joint.x += dx;
    for (const member of members) {
      if (member.runId === runId) continue;
      const memberIndex = wall.runs.findIndex((run) => run.id === member.runId);
      if (memberIndex < 0) continue;
      const memberRun = wall.runs[memberIndex];
      const edge = jointEdgeX(joint, member.side, member.offset);
      const otherEdge = member.side === 'right'
        ? memberRun.x
        : memberRun.x + memberRun.width;
      wall.runs[memberIndex] = {
        ...memberRun,
        x: member.side === 'left' ? edge : otherEdge,
        width: member.side === 'left' ? otherEdge - edge : edge - otherEdge,
      };
    }
  }
  const runIndex = wall.runs.findIndex((run) => run.id === runId);
  wall.runs[runIndex] = cloneRun({ ...wall.runs[runIndex], x: movedX, width: resolvedRun.width });
  const synced = syncRoom(temporary, settings);
  const syncedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const affectedIds = new Set([
    runId,
    ...joints.flatMap(({ members }) => members.map((member) => member.runId)),
  ]);

  for (const affectedRunId of affectedIds) {
    const affectedRun = syncedWall.runs.find((run) => run.id === affectedRunId);
    const validation = validateRunPlacement({
      ...syncedWall,
      length: wallLength(syncedWall),
      runs: syncedWall.runs.filter((run) => (
        run.id === affectedRunId || !affectedIds.has(run.id)
      )),
    }, affectedRun, settings);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        room,
        snap: null,
        x: movedX,
        range,
        limit,
        joints: true,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    room: synced,
    snap: snap ? { value: snap.value, edge: snap.edge } : null,
    x: movedX,
    range,
    limit,
    joints: true,
  };
}
