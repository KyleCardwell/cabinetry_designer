import { CABINET_TYPE_IDS } from './constants.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

const RUN_TYPE_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base',
  [CABINET_TYPE_IDS.UPPER]: 'Upper',
  [CABINET_TYPE_IDS.TALL]: 'Tall',
};

/** Return a compact type and horizontal-span label for a run. */
export function runShortLabel(run) {
  const type = RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run';
  return `${type} ${formatInches(run.x)}–${formatInches(run.x + run.width)}`;
}

/** Return the run sides that belong to a joint, in wall run order. */
export function jointMembers(wall, jointId) {
  return (wall.runs ?? []).flatMap((run) => ['left', 'right'].flatMap((side) => {
    const anchor = run.anchors?.[side];
    return isJointAnchor(anchor) && anchor.jointId === jointId
      ? [{ runId: run.id, side, offset: anchor.offset }]
      : [];
  }));
}

/** Return one link glyph for each joined pair owner or unpaired member. */
export function jointGlyphs(wall, jointId) {
  const runs = wall.runs ?? [];
  const runIndexes = new Map(runs.map((run, index) => [run.id, index]));
  const members = jointMembers(wall, jointId).map((member) => ({
    ...member,
    run: runs.find((run) => run.id === member.runId),
  })).filter((member) => member.run);
  const pairedRunIds = new Set();
  const owned = new Map();

  const rightMembers = members.filter((member) => member.side === 'right');
  const leftMembers = members.filter((member) => member.side === 'left');
  rightMembers.forEach((right) => {
    leftMembers.forEach((left) => {
      const overlapStart = Math.max(right.run.z, left.run.z);
      const overlapEnd = Math.min(
        right.run.z + right.run.height,
        left.run.z + left.run.height,
      );
      const overlap = overlapEnd - overlapStart;
      if (overlap <= 0) return;

      pairedRunIds.add(right.runId);
      pairedRunIds.add(left.runId);
      const owner = right.run.height < left.run.height
        ? right
        : left.run.height < right.run.height
          ? left
          : runIndexes.get(right.runId) > runIndexes.get(left.runId) ? right : left;
      const previous = owned.get(owner.runId);
      if (!previous || overlap > previous.overlap) {
        owned.set(owner.runId, {
          ownerRunId: owner.runId,
          z: (overlapStart + overlapEnd) / 2,
          overlap,
        });
      }
    });
  });

  const glyphs = [...owned.values()].map(({ ownerRunId, z }) => ({ ownerRunId, z }));
  members.forEach((member) => {
    if (!pairedRunIds.has(member.runId)) {
      glyphs.push({
        ownerRunId: member.runId,
        z: member.run.z + member.run.height / 2,
      });
    }
  });
  return glyphs.sort((a, b) => a.z - b.z);
}

/** Resolve a joined run edge from the joint line and its signed offset. */
export function jointEdgeX(joint, side, offset) {
  return side === 'right'
    ? joint.x - (offset ?? 0)
    : joint.x + (offset ?? 0);
}

/** Return whether an anchor points to a wall joint. */
export function isJointAnchor(anchor) {
  return Boolean(anchor) && anchor.to === 'joint' && typeof anchor.jointId === 'string';
}

const JOINT_EPSILON = 1e-6;

function runEdgeX(run, side) {
  return side === 'left' ? run.x : run.x + run.width;
}

function withoutAuto(end) {
  const { auto, ...manualEnd } = end;
  void auto;
  return manualEnd;
}

function endIsCovered(wall, run, side) {
  const anchor = run.anchors?.[side];
  const opposite = side === 'left' ? 'right' : 'left';
  const edge = runEdgeX(run, side);
  const spans = (wall.runs ?? [])
    .filter((candidate) => candidate.id !== run.id
      && (isFollowAnchor(anchor)
        ? candidate.id === anchor.runId
        : candidate.anchors?.[opposite]?.jointId === anchor.jointId)
      && Math.abs(runEdgeX(candidate, opposite) - edge) <= JOINT_EPSILON
      && candidate.depth >= run.depth)
    .map((candidate) => [candidate.z, candidate.z + candidate.height])
    .sort((a, b) => a[0] - b[0]);

  let coveredTo = run.z;
  const runTop = run.z + run.height;
  for (const [start, end] of spans) {
    if (end < coveredTo - JOINT_EPSILON) continue;
    if (start > coveredTo + JOINT_EPSILON) return false;
    coveredTo = Math.max(coveredTo, end);
    if (coveredTo >= runTop - JOINT_EPSILON) return true;
  }
  return false;
}

/** Return automatic end types for every run side anchored to a joint or following a run. */
export function jointEndTypes(wall) {
  return new Map((wall.runs ?? []).flatMap((run) => {
    const types = Object.fromEntries(['left', 'right'].flatMap((side) => (
      isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side])
        ? [[side, endIsCovered(wall, run, side) ? 'none' : 'end_panel']]
        : []
    )));
    return Object.keys(types).length > 0 ? [[run.id, types]] : [];
  }));
}

/** Remove missing and under-subscribed joints without mutating the wall. */
export function pruneJoints(wall) {
  const joints = wall.joints ?? [];
  const existingIds = new Set(joints.map((joint) => joint.id));
  const runsWithExistingAnchors = (wall.runs ?? []).map((run) => {
    const missingSides = new Set(Object.entries(run.anchors ?? {})
      .filter(([, anchor]) => isJointAnchor(anchor) && !existingIds.has(anchor.jointId))
      .map(([side]) => side));
    return {
      ...run,
      anchors: Object.fromEntries(Object.entries(run.anchors ?? {}).map(([side, anchor]) => [
        side,
        missingSides.has(side) ? false : anchor,
      ])),
      ends: Object.fromEntries(Object.entries(run.ends ?? {}).map(([side, end]) => [
        side,
        missingSides.has(side) ? withoutAuto(end) : end,
      ])),
    };
  });
  const retainedIds = new Set(joints
    .filter((joint) => jointMembers({ runs: runsWithExistingAnchors }, joint.id).length >= 2)
    .map((joint) => joint.id));

  return {
    ...wall,
    joints: joints.filter((joint) => retainedIds.has(joint.id)).map((joint) => ({ ...joint })),
    runs: runsWithExistingAnchors.map((run) => {
      const prunedSides = new Set(Object.entries(run.anchors)
        .filter(([, anchor]) => isJointAnchor(anchor) && !retainedIds.has(anchor.jointId))
        .map(([side]) => side));
      return {
        ...run,
        anchors: Object.fromEntries(Object.entries(run.anchors).map(([side, anchor]) => [
          side,
          prunedSides.has(side) ? false : anchor,
        ])),
        ends: Object.fromEntries(Object.entries(run.ends ?? {}).map(([side, end]) => [
          side,
          prunedSides.has(side) ? withoutAuto(end) : end,
        ])),
      };
    }),
  };
}

/** Return whether an anchor makes a run side follow another run's edge (one-way). */
export function isFollowAnchor(anchor) {
  return Boolean(anchor) && anchor.to === 'follow'
    && typeof anchor.runId === 'string'
    && (anchor.side === 'left' || anchor.side === 'right');
}

/** Ids of the runs a run's sides follow. */
export function followLeaders(run) {
  return ['left', 'right']
    .map((side) => run.anchors?.[side])
    .filter(isFollowAnchor)
    .map((anchor) => anchor.runId);
}

/** Ids of every run that follows any of runIds, directly or through another follower. */
export function followersOf(wall, runIds) {
  const found = [];
  const queue = [...runIds];
  while (queue.length > 0) {
    const leaderId = queue.shift();
    for (const run of wall.runs ?? []) {
      if (found.includes(run.id) || runIds.includes(run.id)) continue;
      if (followLeaders(run).includes(leaderId)) {
        found.push(run.id);
        queue.push(run.id);
      }
    }
  }
  return found;
}

/** Whether making sourceRunId follow leaderRunId would close a loop. */
export function followCreatesCycle(wall, sourceRunId, leaderRunId) {
  return leaderRunId === sourceRunId || followersOf(wall, [sourceRunId]).includes(leaderRunId);
}

/** One link glyph per followed side, at the middle of its height overlap with the leader. */
export function followGlyphs(wall) {
  const runs = wall.runs ?? [];
  return runs.flatMap((run) => ['left', 'right'].flatMap((side) => {
    const anchor = run.anchors?.[side];
    if (!isFollowAnchor(anchor)) return [];
    const leader = runs.find((candidate) => candidate.id === anchor.runId);
    if (!leader) return [];
    const bottom = Math.max(run.z, leader.z);
    const top = Math.min(run.z + run.height, leader.z + leader.height);
    return [{
      runId: run.id,
      side,
      leaderRunId: leader.id,
      x: runEdgeX(run, side),
      z: top > bottom ? (bottom + top) / 2 : run.z + run.height / 2,
    }];
  }));
}

/** Free every followed side whose leader is missing, itself, or on the other wall side. */
export function pruneFollows(wall) {
  const runs = wall.runs ?? [];
  const sides = new Map(runs.map((run) => [run.id, wallSideOf(run)]));
  let changed = false;
  const next = runs.map((run) => {
    const dropped = ['left', 'right'].filter((side) => {
      const anchor = run.anchors?.[side];
      return isFollowAnchor(anchor)
        && (anchor.runId === run.id || sides.get(anchor.runId) !== wallSideOf(run));
    });
    if (dropped.length === 0) return run;
    changed = true;
    return {
      ...run,
      anchors: { ...run.anchors, ...Object.fromEntries(dropped.map((side) => [side, false])) },
      ends: {
        ...run.ends,
        ...Object.fromEntries(dropped.map((side) => [side, withoutAuto(run.ends[side])])),
      },
    };
  });
  return changed ? { ...wall, runs: next } : wall;
}
