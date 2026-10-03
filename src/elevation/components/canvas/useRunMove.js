import { useCallback } from 'react';
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
  setSelection,
} from '../../store/elevationSlice.js';

export default function useRunMove({
  beginEntry,
  cancelEntry,
  commitEntry,
  cursor,
  dispatch,
  entryRef,
  liveGestureRef,
  moveOriginRef,
  room,
  selectionRef,
  setAlignmentGuides,
  setEntryPointer,
  setStretchPreview,
  settings,
  showMessage,
  stageRef,
  tool,
  transform,
  updateEntry,
  wall,
}) {
  const applyRunMove = useCallback((segment, delta, commit) => {
    const origin = moveOriginRef.current;
    if (!origin || !room || !wall || origin.runId !== segment.runId) return;
    const result = moveRun(room, wall.id, segment.runId, origin.x + delta, settings);
    if (!result.ok) {
      if (commit) {
        moveOriginRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        showMessage(result.reason === 'anchored'
          ? 'Anchored — set Anchor to Free to move'
          : result.reason);
      }
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
    moveOriginRef.current = null;
    setStretchPreview(null);
    setAlignmentGuides([]);
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
  }, [dispatch, room, settings, showMessage, wall]);

  const startRunMove = useCallback((segment) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === segment.runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer || !transform) return;
    const result = moveRun(room, wall.id, run.id, run.x, settings);
    cancelEntry();
    cursor.hold(CURSORS.move);
    dispatch(setSelection({ runId: run.id, pieceId: null }));
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
        liveGestureRef.current = null;
        applyRunMove(segment, delta, true);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        moveOriginRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [applyRunMove, beginEntry, cancelEntry, cursor, dispatch, room, settings, transform, wall]);

  const handleRunSegmentClick = useCallback((segment) => {
    if (tool !== 'select' || segment.kind !== 'run') return;
    if (selectionRef.current?.runId !== segment.runId || selectionRef.current?.pieceId) {
      dispatch(setSelection({ runId: segment.runId, pieceId: null }));
      return;
    }
    startRunMove(segment);
  }, [dispatch, startRunMove, tool]);

  const updateRunMove = useCallback((segment, delta) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-move' || gesture.segment.runId !== segment.runId) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    updateEntry(delta);
  }, [updateEntry]);

  const finishRunMove = useCallback((segment, delta) => {
    updateRunMove(segment, delta);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateRunMove]);

  return {
    applyRunMove,
    startRunMove,
    handleRunSegmentClick,
    updateRunMove,
    finishRunMove,
  };
}
