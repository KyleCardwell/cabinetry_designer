import { useCallback, useEffect, useState } from 'react';
import { CURSORS } from '../../canvas/cursor.js';
import { screenToWall } from '../../canvas/transform.js';
import { isJointAnchor, jointMembers } from '../../model/joints.js';
import { moveRun } from '../../model/room.js';
import { formatInches } from '../../model/units.js';
import { wallSideView } from '../../model/wallSides.js';
import {
  replaceRun,
  replaceWallLayout,
  setMessage,
} from '../../store/elevationSlice.js';

export default function useRunMove({
  beginEntry,
  cancelEntry,
  cursor,
  dispatch,
  entryRef,
  liveGestureRef,
  moveOriginRef,
  room,
  setAlignmentGuides,
  setEntryPointer,
  setStretchPreview,
  settings,
  showMessage,
  stageRef,
  tool,
  transform,
  wall,
}) {
  const [moving, setMoving] = useState(false);
  const clearMove = useCallback(() => {
    liveGestureRef.current = null;
    moveOriginRef.current = null;
    setMoving(false);
    setStretchPreview(null);
    setAlignmentGuides([]);
    cursor.releaseHold();
  }, [cursor, liveGestureRef, moveOriginRef, setAlignmentGuides, setStretchPreview]);

  const cancelMove = useCallback(() => {
    if (liveGestureRef.current?.kind === 'run-move') cancelEntry();
  }, [cancelEntry, liveGestureRef]);

  useEffect(() => cancelMove, [cancelMove, room?.id, wall?.id, wall?.side, tool]);

  const applyRunMove = useCallback((segment, delta, commit, {
    exact = (entryRef.current?.typed ?? null) !== null,
  } = {}) => {
    const origin = moveOriginRef.current;
    if (!origin || !room || !wall || origin.runId !== segment.runId) return;
    const result = moveRun(room, wall.id, segment.runId, origin.x + delta, settings, { exact });
    if (!result.ok) {
      // A commit clears the live entry before invoking its callback.
      if (commit) clearMove();
      else cancelMove();
      showMessage(result.reason === 'anchored'
        ? 'Anchored — set Anchor to Free to move'
        : result.reason);
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const resolvedRun = resolvedWall?.runs.find((candidate) => candidate.id === segment.runId);
    if (!resolvedRun) return;
    setAlignmentGuides(result.snap ? [{ axis: 'x', value: result.snap.value }] : []);
    if (!commit) {
      const runIds = new Set([resolvedRun.id]);
      ['left', 'right'].forEach((side) => {
        const anchor = resolvedRun.anchors?.[side];
        if (isJointAnchor(anchor)) {
          jointMembers(resolvedWall, anchor.jointId).forEach((member) => runIds.add(member.runId));
        }
      });
      setStretchPreview({
        room: result.room,
        wall: wallSideView(resolvedWall, wall.side),
        runIds: [...runIds],
      });
      return;
    }
    clearMove();
    dispatch(setMessage(null));
    if (result.joints) {
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
    }
    if (result.limit?.reason === 'min-width') {
      showMessage(`${result.limit.type} can't go below ${formatInches(result.limit.min)}`);
    } else if (result.limit?.reason === 'fixed-width') {
      showMessage(`${result.limit.type} is fixed at ${formatInches(result.limit.width)} (all cabinets fixed)`);
    }
  }, [cancelMove, clearMove, dispatch, entryRef, moveOriginRef, room, setAlignmentGuides, setStretchPreview, settings, showMessage, wall]);

  const startMoveMode = useCallback((runId) => {
    if (tool !== 'select' || !room || !wall || liveGestureRef.current?.kind === 'run-move') return;
    const run = wall.runs.find((candidate) => candidate.id === runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer || !transform) return;
    const result = moveRun(room, wall.id, run.id, run.x, settings);
    if (!result.ok) {
      showMessage(result.reason === 'anchored'
        ? 'Anchored — set Anchor to Free to move'
        : result.reason);
      return;
    }
    const segment = { runId: run.id };
    cancelEntry();
    setMoving(true);
    cursor.hold(CURSORS.move);
    setEntryPointer(pointer);
    moveOriginRef.current = { runId: run.id, x: run.x };
    setStretchPreview({ room, wall, runIds: [run.id] });
    liveGestureRef.current = {
      kind: 'run-move',
      segment,
      pointerStartX: screenToWall(pointer, transform).x,
    };
    beginEntry({
      kind: 'run-move',
      label: 'Move',
      value: 0,
      min: result.joints ? result.range.min : -Infinity,
      max: result.joints ? result.range.max : Infinity,
      onCommit: (delta) => {
        applyRunMove(segment, delta, true, { exact: (entryRef.current?.typed ?? null) !== null });
      },
      onCancel: clearMove,
    });
  }, [applyRunMove, beginEntry, cancelEntry, clearMove, cursor, entryRef, liveGestureRef, moveOriginRef, room, setEntryPointer, setStretchPreview, settings, showMessage, stageRef, tool, transform, wall]);

  return { applyRunMove, startMoveMode, moving, cancelMove };
}
