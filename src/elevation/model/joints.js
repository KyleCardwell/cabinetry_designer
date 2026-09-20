/** Return the run sides that belong to a joint, in wall run order. */
export function jointMembers(wall, jointId) {
  return (wall.runs ?? []).flatMap((run) => ['left', 'right'].flatMap((side) => {
    const anchor = run.anchors?.[side];
    return isJointAnchor(anchor) && anchor.jointId === jointId
      ? [{ runId: run.id, side, offset: anchor.offset }]
      : [];
  }));
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

function endIsCovered(wall, run, side) {
  const anchor = run.anchors?.[side];
  const opposite = side === 'left' ? 'right' : 'left';
  const edge = runEdgeX(run, side);
  const spans = (wall.runs ?? [])
    .filter((candidate) => candidate.id !== run.id
      && candidate.anchors?.[opposite]?.jointId === anchor.jointId
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

/** Return automatic end types for every run side anchored to a joint. */
export function jointEndTypes(wall) {
  return new Map((wall.runs ?? []).flatMap((run) => {
    const types = Object.fromEntries(['left', 'right'].flatMap((side) => (
      isJointAnchor(run.anchors?.[side])
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
  const runsWithExistingAnchors = (wall.runs ?? []).map((run) => ({
    ...run,
    anchors: Object.fromEntries(Object.entries(run.anchors ?? {}).map(([side, anchor]) => [
      side,
      isJointAnchor(anchor) && !existingIds.has(anchor.jointId) ? false : anchor,
    ])),
  }));
  const retainedIds = new Set(joints
    .filter((joint) => jointMembers({ runs: runsWithExistingAnchors }, joint.id).length >= 2)
    .map((joint) => joint.id));

  return {
    ...wall,
    joints: joints.filter((joint) => retainedIds.has(joint.id)).map((joint) => ({ ...joint })),
    runs: runsWithExistingAnchors.map((run) => ({
      ...run,
      anchors: Object.fromEntries(Object.entries(run.anchors).map(([side, anchor]) => [
        side,
        isJointAnchor(anchor) && !retainedIds.has(anchor.jointId) ? false : anchor,
      ])),
    })),
  };
}
