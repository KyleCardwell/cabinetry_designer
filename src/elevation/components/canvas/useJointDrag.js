import { useCallback, useEffect } from 'react';
import { CURSORS } from '../../canvas/cursor.js';
import { jointMembers } from '../../model/joints.js';
import { moveJoint } from '../../model/room.js';
import { formatInches } from '../../model/units.js';
import { wallSideView } from '../../model/wallSides.js';
import { replaceWallLayout, setMessage, setRunAnchor } from '../../store/elevationSlice.js';

export default function useJointDrag({
  applyRunMove,
  beginEntry,
  cancelEntry,
  commitEntry,
  cursor,
  dispatch,
  entry,
  entryRef,
  entryValue,
  liveGestureRef,
  previewStretch,
  room,
  RUN_TYPE_LABELS,
  runEdgeXForWidth,
  runWidthForEdgeX,
  selectionRef,
  setAlignmentGuides,
  setEntryPointer,
  setHoveredGlyphId,
  setStretchPreview,
  settings,
  showMessage,
  stageRef,
  updateEntry,
  wall,
}) {
  const previewJointDrag = useCallback((jointId, x) => {
    if (!room || !wall) return;
    const result = moveJoint(room, wall.id, jointId, x, settings);
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!previewWall) return;
    setStretchPreview({
      room: result.room,
      wall: wallSideView(previewWall, wall.side),
      runIds: jointMembers(previewWall, jointId).map((member) => member.runId),
    });
  }, [room, settings, wall]);

  const commitJointDrag = useCallback((jointId, x) => {
    setStretchPreview(null);
    if (!room || !wall) return;
    const result = moveJoint(room, wall.id, jointId, x, settings);
    if (!result.ok) {
      showMessage(result.reason);
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!resolvedWall) return;
    dispatch(replaceWallLayout({
      wallId: wall.id,
      runs: resolvedWall.runs,
      joints: resolvedWall.joints,
    }));

    const limitingRun = result.limit
      ? resolvedWall.runs.find((run) => run.id === result.limit.runId)
      : null;
    const type = RUN_TYPE_LABELS[limitingRun?.cabinetTypeId] ?? 'Run';
    if (result.limit?.reason === 'min-width') {
      showMessage(`${type} can't go below ${formatInches(limitingRun.width)}`);
    } else if (result.limit?.reason === 'fixed-width') {
      showMessage(`${type} is fixed at ${formatInches(limitingRun.width)} (all cabinets fixed)`);
    } else {
      dispatch(setMessage(null));
    }
  }, [dispatch, room, settings, showMessage, wall]);

  const startJointDrag = useCallback((jointId) => {
    if (!room || !wall) return;
    const member = jointMembers(wall, jointId).find(
      (candidate) => candidate.runId === selectionRef.current.runId,
    );
    const run = wall.runs.find((candidate) => candidate.id === member?.runId);
    const joint = (wall.joints ?? []).find((candidate) => candidate.id === jointId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!member || !run || !joint || !pointer) return;
    cancelEntry();
    const rangeResult = moveJoint(room, wall.id, jointId, joint.x, settings);
    if (!rangeResult.range || rangeResult.range.min > rangeResult.range.max) return;
    cursor.hold(CURSORS.resizeX);
    const offset = member.offset ?? 0;
    const grabbedEdgeAtJoint = (jointX) => (
      member.side === 'right' ? jointX - offset : jointX + offset
    );
    const edgeMin = grabbedEdgeAtJoint(rangeResult.range.min);
    const edgeMax = grabbedEdgeAtJoint(rangeResult.range.max);
    const members = jointMembers(wall, jointId);
    const orderedMembers = [member, ...members.filter((candidate) => (
      candidate.runId !== member.runId || candidate.side !== member.side
    ))];
    const memberModes = orderedMembers.flatMap((candidate) => {
      const memberRun = wall.runs.find((wallRun) => wallRun.id === candidate.runId);
      if (!memberRun) return [];
      const memberOffset = candidate.offset ?? 0;
      const memberWidthAtJoint = (jointX) => runWidthForEdgeX(
        memberRun,
        candidate.side,
        candidate.side === 'right'
          ? jointX - memberOffset
          : jointX + memberOffset,
      );
      const widthLimits = [
        memberWidthAtJoint(rangeResult.range.min),
        memberWidthAtJoint(rangeResult.range.max),
      ];
      return [{
        key: `run:${candidate.runId}:${candidate.side}`,
        label: `${RUN_TYPE_LABELS[memberRun.cabinetTypeId] ?? 'Run'} width`,
        value: memberRun.width,
        min: Math.min(...widthLimits),
        max: Math.max(...widthLimits),
      }];
    });
    const modes = [
      ...memberModes,
      {
        key: 'from-left',
        label: 'From left',
        value: grabbedEdgeAtJoint(joint.x),
        min: edgeMin,
        max: edgeMax,
      },
      {
        key: 'from-right',
        label: 'From right',
        value: wall.length - grabbedEdgeAtJoint(joint.x),
        min: wall.length - edgeMax,
        max: wall.length - edgeMin,
      },
    ];
    const runIds = members.map((candidate) => candidate.runId);
    setEntryPointer(pointer);
    setStretchPreview({ room, wall, runIds });
    liveGestureRef.current = {
      kind: 'run-edge',
      run,
      side: member.side,
      jointId,
      offset,
    };
    beginEntry({
      kind: 'run-edge',
      label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
      value: run.width,
      min: memberModes[0].min,
      max: memberModes[0].max,
      modes,
      onCommit: (value, modeKey) => {
        const activeGesture = liveGestureRef.current;
        liveGestureRef.current = null;
        const typed = entryRef.current?.typed;
        const modeMember = orderedMembers.find(
          (candidate) => `run:${candidate.runId}:${candidate.side}` === modeKey,
        );
        const modeRun = wall.runs.find((candidate) => candidate.id === modeMember?.runId);
        const modeOffset = modeMember?.offset ?? 0;
        const modeEdgeX = modeRun && modeMember
          ? runEdgeXForWidth(modeRun, modeMember.side, value)
          : null;
        const enteredEdgeX = modeKey === 'from-left'
          ? value
          : wall.length - value;
        const enteredJointX = modeKey === 'from-left' || modeKey === 'from-right'
          ? member.side === 'right'
            ? enteredEdgeX + offset
            : enteredEdgeX - offset
            : modeMember?.side === 'right'
              ? modeEdgeX + modeOffset
              : modeEdgeX - modeOffset;
        const jointX = typed === null && Number.isFinite(activeGesture?.requestedJointX)
          ? activeGesture.requestedJointX
          : enteredJointX;
        commitJointDrag(jointId, jointX);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [beginEntry, cancelEntry, commitJointDrag, cursor, room, settings, wall]);

  const updateJointDrag = useCallback((jointId, x) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-edge' || gesture.jointId !== jointId) return;
    liveGestureRef.current = { ...gesture, requestedJointX: x };
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    const edgeX = gesture.side === 'right' ? x - gesture.offset : x + gesture.offset;
    updateEntry(runWidthForEdgeX(gesture.run, gesture.side, edgeX));
  }, [updateEntry]);

  const finishJointDrag = useCallback((jointId, x) => {
    updateJointDrag(jointId, x);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateJointDrag]);

  useEffect(() => {
    const gesture = liveGestureRef.current;
    if (!entry || entryValue === null || !gesture) return;
    if (entry.kind === 'run-edge' && gesture.kind === 'run-edge') {
      const edgeX = runEdgeXForWidth(gesture.run, gesture.side, entryValue);
      if (gesture.jointId) {
        const jointX = gesture.side === 'right'
          ? edgeX + gesture.offset
          : edgeX - gesture.offset;
        previewJointDrag(gesture.jointId, jointX);
      } else {
        previewStretch(gesture.run.id, gesture.side, edgeX);
      }
    } else if (entry.kind === 'run-move' && gesture.kind === 'run-move') {
      applyRunMove(gesture.segment, entryValue, false);
    }
  }, [applyRunMove, entry, entryValue, previewJointDrag, previewStretch]);

  const unjoinRunSide = useCallback((runId, side) => {
    if (!wall) return;
    setHoveredGlyphId(null);
    dispatch(setRunAnchor({ wallId: wall.id, runId, side, anchor: false }));
  }, [dispatch, wall]);

  return {
    previewJointDrag,
    commitJointDrag,
    startJointDrag,
    updateJointDrag,
    finishJointDrag,
    unjoinRunSide,
  };
}
