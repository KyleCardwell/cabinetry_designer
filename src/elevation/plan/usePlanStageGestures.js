import { useCallback } from 'react';
import { dot, subtract } from '../model/geometry.js';
import { roundTo } from '../model/units.js';
import { addWallSegment } from '../store/elevationSlice.js';

export default function usePlanStageGestures({
  settings, tool, entry, dispatch, stageRef, panRef, spacePressedRef,
  suppressClickRef, liveGestureRef, toWorld, measure, closeContextMenu,
  commitEntry, updateEntry, updateMovePointer, pickAt, moveHandle, gridAndOrtho,
  snapDrawPoint, wallDrawStart, setWallDrawStart, setMouseWorldPos,
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
    if (entry?.kind === 'run-move') {
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
    const snapped = gridAndOrtho(toWorld(pointer), fixed);
    const { point, connect, land, faceLabel } = snapDrawPoint(snapped, fixed);

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
    measure.click,
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
      setEntryPointer(pointer);
      if (entry.kind === 'run-move') {
        updateMovePointer(pointer);
      } else if (entry.kind === 'wall-perpendicular' && moveHandle) {
        const delta = dot(
          subtract(toWorld(pointer), moveHandle.point),
          moveHandle.frame.n,
        );
        updateEntry(roundTo(delta, settings.planGrid));
      } else if (entry.kind === 'wall-draw' && wallDrawStart) {
        const snapped = gridAndOrtho(toWorld(pointer), wallDrawStart);
        const { point, connect, land, faceLabel } = snapDrawPoint(
          snapped,
          wallDrawStart,
        );
        const dx = point.x - wallDrawStart.x;
        const dy = point.y - wallDrawStart.y;
        const length = Math.hypot(dx, dy);
        liveGestureRef.current = {
          kind: 'wall-draw',
          direction: length > 0 ? { x: dx / length, y: dy / length } : null,
          connectEnd: connect,
          landEnd: land,
          pointerLength: length,
        };
        setMouseWorldPos({ ...point, _faceLabel: faceLabel });
        updateEntry(length);
      } else if (entry.kind === 'wall-length') {
        const gesture = liveGestureRef.current;
        if (gesture?.kind === 'wall-length') {
          const delta = dot(
            subtract(toWorld(pointer), gesture.pointerStart),
            gesture.aOut,
          );
          updateEntry(roundTo(
            gesture.initialLength + delta,
            settings.planGrid,
          ));
        }
      }
      return;
    }
    if (tool !== 'wall' || panRef.current) return;
    const fixed = wallDrawStart ?? null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed);
    const { point, faceLabel } = snapDrawPoint(snapped, fixed);
    setMouseWorldPos({ ...point, _faceLabel: faceLabel });
  }, [
    entry,
    gridAndOrtho,
    measure.move,
    moveHandle,
    settings.planGrid,
    snapDrawPoint,
    toWorld,
    tool,
    updateEntry,
    updateMovePointer,
    wallDrawStart,
  ]);

  return { handleStageClick, handleMouseMove };
}
