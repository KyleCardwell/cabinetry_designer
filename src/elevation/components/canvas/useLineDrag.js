import { useCallback, useEffect } from 'react';
import { CURSORS } from '../../canvas/cursor.js';
import { lineX, linesOn } from '../../model/layoutLines.js';
import { moveLineTo } from '../../model/linePlacement.js';
import { wallSideView } from '../../model/wallSides.js';
import { updateLayoutLine } from '../../store/elevationSlice.js';

export default function useLineDrag({
  beginEntry, cancelEntry, commitEntry, cursor, dispatch, entry, entryRef, entryValue,
  liveGestureRef, room, setEntryPointer, setStretchPreview, settings, stageRef, updateEntry, wall,
}) {
  const clearLineDrag = useCallback(() => {
    liveGestureRef.current = null;
    setStretchPreview(null);
    cursor.releaseHold();
  }, [cursor, liveGestureRef, setStretchPreview]);

  const previewLineDrag = useCallback((lineId, x, exact) => {
    const result = moveLineTo(room, wall.id, lineId, x, settings, { exact });
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const face = wallSideView(previewWall, wall.side);
    const runIds = face.runs.filter((run) => {
      const before = wall.runs.find((candidate) => candidate.id === run.id);
      return before && (Math.abs(run.x - before.x) > 1e-9 || Math.abs(run.width - before.width) > 1e-9);
    }).map((run) => run.id);
    setStretchPreview({ room: result.room, wall: face, runIds });
    return result;
  }, [room, setStretchPreview, settings, wall]);

  const startLineDrag = useCallback((lineId) => {
    if (!room || !wall) return;
    const line = linesOn(wall).find((candidate) => candidate.id === lineId);
    if (!line) return;
    cancelEntry();
    cursor.hold(CURSORS.resizeX);
    const x = lineX(line, wall.length);
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    liveGestureRef.current = { kind: 'line-move', lineId, x };
    const modes = [
      { key: 'from-left', label: 'From left', value: x, min: 0, max: wall.length },
      { key: 'from-right', label: 'From right', value: wall.length - x, min: 0, max: wall.length },
    ];
    if (line.from === 'right') modes.reverse();
    beginEntry({
      kind: 'line-move',
      label: line.label,
      value: line.value,
      modes,
      onCommit: (value, modeKey) => {
        const gesture = liveGestureRef.current;
        if (gesture?.kind !== 'line-move' || gesture.lineId !== lineId) return;
        const exact = (entryRef.current?.typed ?? null) !== null;
        const x = exact ? (modeKey === 'from-left' ? value : wall.length - value) : gesture.x;
        const result = moveLineTo(room, wall.id, lineId, x, settings, { exact });
        clearLineDrag();
        if (result.ok) dispatch(updateLayoutLine({ wallId: wall.id, lineId, value: result.value }));
      },
      onCancel: clearLineDrag,
    });
  }, [beginEntry, cancelEntry, clearLineDrag, cursor, dispatch, entryRef, liveGestureRef, room,
    setEntryPointer, settings, stageRef, wall]);

  const updateLineDrag = useCallback((lineId, x) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'line-move' || gesture.lineId !== lineId) return;
    liveGestureRef.current = { ...gesture, x };
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    const result = moveLineTo(room, wall.id, lineId, x, settings);
    if (result.ok) updateEntry(entryRef.current?.modeKey === 'from-left' ? result.x : wall.length - result.x);
  }, [entryRef, liveGestureRef, room, setEntryPointer, settings, stageRef, updateEntry, wall]);

  const finishLineDrag = useCallback((lineId, x) => {
    if (liveGestureRef.current?.kind !== 'line-move' || liveGestureRef.current.lineId !== lineId) return;
    updateLineDrag(lineId, x);
    if ((entryRef.current?.typed ?? null) === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, entryRef, liveGestureRef, updateLineDrag]);

  useEffect(() => {
    const gesture = liveGestureRef.current;
    if (entry?.kind !== 'line-move' || gesture?.kind !== 'line-move' || entryValue === null) return;
    const exact = entry.typed !== null;
    const x = exact ? (entry.modeKey === 'from-left' ? entryValue : wall.length - entryValue) : gesture.x;
    const result = previewLineDrag(gesture.lineId, x, exact);
    // Cycling modes keeps the dragged position instead of restoring the mode's initial value.
    if (result && !exact) {
      const value = entry.modeKey === 'from-left' ? result.x : wall.length - result.x;
      if (entry.value !== value) updateEntry(value);
    }
  }, [entry, entryValue, liveGestureRef, previewLineDrag, updateEntry, wall]);

  return { startLineDrag, updateLineDrag, finishLineDrag };
}
