import { useCallback, useEffect, useRef, useState } from 'react';
import { CURSORS } from '../canvas/cursor.js';
import { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { dot, subtract } from '../model/geometry.js';
import { moveRun } from '../model/room.js';
import { formatInches } from '../model/units.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';
import { replaceRun, replaceWallLayout, setMessage } from '../store/elevationSlice.js';

export default function usePlanRunMove({
  room, settings, tool, view, activeWallId, activeWallSide,
  entry, beginEntry, cancelEntry, updateEntry, cursor, dispatch,
  stageRef, toWorld, setEntryPointer, showMessage,
}) {
  const originRef = useRef(null);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [previewRoom, setPreviewRoom] = useState(null);
  const clearMove = useCallback(() => {
    originRef.current = null;
    setPreviewRoom(null);
    cursor.releaseHold();
  }, [cursor]);
  const cancelMove = useCallback(() => {
    if (originRef.current) cancelEntry();
  }, [cancelEntry]);

  useEffect(() => cancelMove, [cancelMove, room?.id, activeWallId, activeWallSide, tool, view]);

  const applyMove = useCallback((delta, commit = false) => {
    const origin = originRef.current;
    if (!origin) return;
    const result = moveRun(origin.room, origin.wallId, origin.runId, origin.x + delta, settings, {
      exact: (entryRef.current?.typed ?? null) !== null,
    });
    if (!result.ok) {
      if (commit) clearMove();
      else cancelMove();
      showMessage(result.reason === 'anchored'
        ? 'Anchored — set Anchor to Free to move' : result.reason);
      return;
    }
    if (!commit) {
      setPreviewRoom(result.room);
      return;
    }
    const wall = result.room.walls.find(({ id }) => id === origin.wallId);
    clearMove();
    dispatch(setMessage(null));
    dispatch(result.joints
      ? replaceWallLayout({ wallId: wall.id, runs: wall.runs, joints: wall.joints })
      : replaceRun({ wallId: wall.id, run: wall.runs.find(({ id }) => id === origin.runId) }));
    if (result.limit?.reason === 'min-width') {
      showMessage(`${result.limit.type} can't go below ${formatInches(result.limit.min)}`);
    } else if (result.limit?.reason === 'fixed-width') {
      showMessage(`${result.limit.type} is fixed at ${formatInches(result.limit.width)} (all cabinets fixed)`);
    }
  }, [cancelMove, clearMove, dispatch, settings, showMessage]);

  const kind = entry?.kind;
  const value = resolveLiveEntryValue(entry);
  useEffect(() => {
    if (kind === 'run-move') applyMove(value);
  }, [applyMove, kind, entry?.typed, value]);

  const startMoveMode = useCallback((runId) => {
    if (tool !== 'select' || !room || originRef.current) return;
    const wall = room.walls.find((wall) => wall.runs.some(({ id }) => id === runId));
    const run = wall?.runs.find(({ id }) => id === runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer) return;
    const result = moveRun(room, wall.id, run.id, run.x, settings);
    if (!result.ok) {
      showMessage(result.reason === 'anchored'
        ? 'Anchored — set Anchor to Free to move' : result.reason);
      return;
    }
    cancelEntry();
    const frame = wallSideFrame(room, wall, wallSideOf(run));
    originRef.current = {
      room, wallId: wall.id, runId, x: run.x, frame,
      pointerX: dot(subtract(toWorld(pointer), frame.leftPoint), frame.r),
    };
    setPreviewRoom(room);
    cursor.hold(CURSORS.move);
    setEntryPointer(pointer);
    beginEntry({
      kind: 'run-move', label: 'Move', value: 0,
      min: result.joints ? result.range.min : -Infinity,
      max: result.joints ? result.range.max : Infinity,
      onCommit: (delta) => applyMove(delta, true),
      onCancel: clearMove,
    });
  }, [applyMove, beginEntry, cancelEntry, clearMove, cursor, room, setEntryPointer,
    settings, showMessage, stageRef, toWorld, tool]);

  const updateMovePointer = useCallback((pointer) => {
    const origin = originRef.current;
    if (!origin) return;
    const x = dot(subtract(toWorld(pointer), origin.frame.leftPoint), origin.frame.r);
    updateEntry(x - origin.pointerX);
  }, [toWorld, updateEntry]);

  return { previewRoom, moving: Boolean(previewRoom), startMoveMode, cancelMove, updateMovePointer };
}
