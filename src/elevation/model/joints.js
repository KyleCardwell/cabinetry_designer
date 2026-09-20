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
