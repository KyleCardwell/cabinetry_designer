import { useCallback } from 'react';
import { dot, subtract } from '../model/geometry.js';
import { roundTo } from '../model/units.js';
import { addWallSegment } from '../store/elevationSlice.js';

export default function usePlanStageGestures({
  settings, tool, entry, dispatch, stageRef, panRef, spacePressedRef,
  suppressClickRef, liveGestureRef, toWorld, measure, closeContextMenu,
  commitEntry, updateEntry, updateMovePointer, updateGroupPointer, pickAt, moveHandle, gridAndOrtho,
  snapDrawPoint, updateDrawPointer, wallDrawStart, setWallDrawStart, setMouseWorldPos,
  setAlignmentGuides, setEntryPointer,
}) {
  const handleStageClick = useCallback((event) => {
    if (suppressClickRef.current) return;
    if (tool === 'measure') {
      const pointer = stageRef.current?.getPointerPosition();
      if (event.evt?.button === 0 && pointer && !panRef.current && !spacePressedRef.current) {
        measure.click(toWorld(pointer), event.evt.shiftKey);
      }
      return;
    }
    if (event.evt?.button && event.evt.button !== 0) return;
    closeContextMenu();
    if (entry?.kind === 'run-move' || entry?.kind === 'wall-group-move') {
      commitEntry();
      return;
    }
    if (event.target !== event.target.getStage()) return;
    if (entry) {
      commitEntry();
      return;
    }
    if (tool === 'select') {
      pickAt(event);
      return;
    }
    if (tool !== 'wall') return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const fixed = wallDrawStart ? { x: wallDrawStart.x, y: wallDrawStart.y } : null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed, 45);
    const { point, connect, land, faceLabel, guides } = snapDrawPoint(snapped, fixed);
    setAlignmentGuides(guides);

    if (!wallDrawStart) {
      setEntryPointer(pointer);
      setWallDrawStart({
        ...point,
        _connectTo: connect,
        _landOn: land,
      });
      setMouseWorldPos({ ...point, _faceLabel: faceLabel });
      return;
    }

    if (point.x === wallDrawStart.x && point.y === wallDrawStart.y) return;
    const action = addWallSegment({
      x1: wallDrawStart.x,
      y1: wallDrawStart.y,
      x2: point.x,
      y2: point.y,
      connectStart: wallDrawStart._connectTo,
      connectEnd: connect,
      landStart: wallDrawStart._connectTo ? null : wallDrawStart._landOn,
      landEnd: land,
    });
    dispatch(action);
    setAlignmentGuides([]);
    setWallDrawStart({
      ...point,
      _connectTo: { wallId: action.payload.id, endpoint: 'end' },
      _landOn: null,
    });
    setMouseWorldPos(null);
  }, [
    closeContextMenu,
    commitEntry,
    dispatch,
    entry,
    gridAndOrtho,
    measure,
    panRef,
    setAlignmentGuides,
    setEntryPointer,
    setMouseWorldPos,
    setWallDrawStart,
    spacePressedRef,
    stageRef,
    suppressClickRef,
    pickAt,
    snapDrawPoint,
    toWorld,
    tool,
    wallDrawStart,
  ]);

  const handleMouseMove = useCallback((event) => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    if (tool === 'measure') {
      if (!panRef.current && !spacePressedRef.current) {
        measure.move(toWorld(pointer), event.evt?.shiftKey);
      }
      return;
    }
    if (entry) {
      if (entry.kind !== 'corner-angle') setEntryPointer(pointer);
      if (entry.kind === 'run-move') {
        updateMovePointer(pointer);
      } else if (entry.kind === 'wall-group-move') {
        updateGroupPointer(pointer);
      } else if (entry.kind === 'wall-perpendicular' && moveHandle) {
        const delta = dot(
          subtract(toWorld(pointer), moveHandle.point),
          moveHandle.frame.n,
        );
        updateEntry(roundTo(delta, settings.planGrid));
      } else if (entry.kind === 'wall-draw' && wallDrawStart) {
        const draw = updateDrawPointer(toWorld(pointer));
        setMouseWorldPos({ ...draw.point, _faceLabel: draw.faceLabel });
        setAlignmentGuides(draw.guides);
      } else if (entry.kind === 'wall-length') {
        const gesture = liveGestureRef.current;
        if (gesture?.kind === 'wall-length') {
          const delta = dot(
            subtract(toWorld(pointer), gesture.pointerStart),
            gesture.aOut,
          );
          // WL3: in Extend past mode the drag is the extension itself (the entry clamps it at 0).
          updateEntry(entry.modeKey === 'extend'
            ? roundTo(delta, settings.planGrid)
            : roundTo(gesture.initialLength + delta, settings.planGrid));
        }
      }
      return;
    }
    if (tool !== 'wall' || panRef.current) return;
    const fixed = wallDrawStart ?? null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed, 45);
    const { point, faceLabel, guides } = snapDrawPoint(snapped, fixed);
    setAlignmentGuides(guides);
    setMouseWorldPos({ ...point, _faceLabel: faceLabel });
  }, [
    entry,
    gridAndOrtho,
    measure,
    liveGestureRef,
    panRef,
    setAlignmentGuides,
    setEntryPointer,
    setMouseWorldPos,
    spacePressedRef,
    stageRef,
    moveHandle,
    settings.planGrid,
    snapDrawPoint,
    toWorld,
    tool,
    updateEntry,
    updateDrawPointer,
    updateMovePointer,
    updateGroupPointer,
    wallDrawStart,
  ]);

  return { handleStageClick, handleMouseMove };
}
