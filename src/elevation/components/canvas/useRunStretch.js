import { useCallback } from 'react';
import { CURSORS } from '../../canvas/cursor.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { endMinWidthsForRun, stretchRun } from '../../model/room.js';
import { wallSideView } from '../../model/wallSides.js';
import { runWidthRange } from '../../model/splitRun.js';
import { replaceRun, replaceWallLayout, setMessage } from '../../store/elevationSlice.js';

export default function useRunStretch({
  applyRunAlignment,
  beginEntry,
  cancelEntry,
  commitEntry,
  cursor,
  dispatch,
  entryRef,
  liveGestureRef,
  messageTimeoutRef,
  room,
  RUN_TYPE_LABELS,
  runEdgeXForWidth,
  runWidthForEdgeX,
  setAlignmentGuides,
  setEntryPointer,
  setStretchPreview,
  settings,
  showMessage,
  stageRef,
  updateEntry,
  wall,
}) {
  const previewStretch = useCallback((runId, side, newEdgeX) => {
    if (!room || !wall) return;
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).point.x;
    const result = stretchRun(room, wall.id, runId, side, alignedEdgeX, settings);
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!previewWall?.runs.some((candidate) => candidate.id === runId)) return;
    setStretchPreview({
      room: result.room,
      wall: wallSideView(previewWall, wall.side),
      runIds: [runId],
    });
  }, [applyRunAlignment, room, settings, wall]);

  const commitStretch = useCallback((runId, side, newEdgeX, { exact = false } = {}) => {
    const alignedEdgeX = exact ? newEdgeX : applyRunAlignment({ x: newEdgeX }, runId).point.x;
    setStretchPreview(null);
    setAlignmentGuides([]);
    if (!room || !wall) return;
    const result = stretchRun(room, wall.id, runId, side, alignedEdgeX, settings, { exact });
    if (!result.ok) {
      showMessage(result.reason);
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const resolvedRun = resolvedWall?.runs.find((candidate) => candidate.id === runId);
    if (!resolvedRun) return;
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    if (result.joined) {
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
    }
  }, [applyRunAlignment, dispatch, room, settings, showMessage, wall]);

  const startStretch = useCallback((runId, side) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer) return;
    cancelEntry();
    cursor.hold(CURSORS.resizeX);
    const widthRange = runWidthRange(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    });
    const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
    const wallMaximum = side === 'left'
      ? run.x + run.width + maxRunOverhang
      : wall.length + maxRunOverhang - run.x;
    const maximum = Math.max(widthRange.min, Math.min(widthRange.max, wallMaximum));
    const widthModeKey = `run:${run.id}:${side}`;
    const edgeX = runEdgeXForWidth(run, side, run.width);
    const edgeLimits = [
      runEdgeXForWidth(run, side, widthRange.min),
      runEdgeXForWidth(run, side, maximum),
    ];
    const edgeMin = Math.min(...edgeLimits);
    const edgeMax = Math.max(...edgeLimits);
    const modes = [
      {
        key: widthModeKey,
        label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
        value: run.width,
        min: widthRange.min,
        max: maximum,
      },
      {
        key: 'from-left',
        label: 'From left',
        value: edgeX,
        min: edgeMin,
        max: edgeMax,
      },
      {
        key: 'from-right',
        label: 'From right',
        value: wall.length - edgeX,
        min: wall.length - edgeMax,
        max: wall.length - edgeMin,
      },
    ];
    setEntryPointer(pointer);
    setStretchPreview({ room, wall, runIds: [run.id] });
    liveGestureRef.current = { kind: 'run-edge', run, side, jointId: null, offset: 0 };
    beginEntry({
      kind: 'run-edge',
      label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
      value: run.width,
      min: widthRange.min,
      max: maximum,
      modes,
      onCommit: (value, modeKey) => {
        const exact = (entryRef.current?.typed ?? null) !== null;
        liveGestureRef.current = null;
        const committedEdgeX = modeKey === 'from-left'
          ? value
          : modeKey === 'from-right'
            ? wall.length - value
            : runEdgeXForWidth(run, side, value);
        commitStretch(run.id, side, committedEdgeX, { exact });
      },
      onCancel: () => {
        liveGestureRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [beginEntry, cancelEntry, commitStretch, cursor, room, settings, wall]);

  const updateStretch = useCallback((runId, side, newEdgeX) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-edge' || gesture.run.id !== runId || gesture.side !== side) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    updateEntry(runWidthForEdgeX(gesture.run, side, newEdgeX));
  }, [updateEntry]);

  const finishStretch = useCallback((runId, side, newEdgeX) => {
    updateStretch(runId, side, newEdgeX);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateStretch]);

  return {
    previewStretch,
    commitStretch,
    startStretch,
    updateStretch,
    finishStretch,
  };
}
