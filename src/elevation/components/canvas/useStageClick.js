import { useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { screenToWall } from '../../canvas/transform.js';
import { screenPointToWallSnapped } from '../../canvas/drag.js';
import {
  createOpening,
  openingGeometry,
  validateOpeningPlacement,
} from '../../model/openings.js';
import {
  RECESS_PLACEMENT_MESSAGES,
  createRecess,
  recessForSpan,
  validateRecessPlacement,
} from '../../model/recesses.js';
import {
  addLayoutLine,
  addOpening,
  addRecess,
  setMessage,
  setSelection,
} from '../../store/elevationSlice.js';

/** LL3: a new line on the face being viewed, measured from the nearer wall end; selected after it's added. */
export function layoutLineAt(wall, x) {
  const from = x <= wall.length / 2 ? 'left' : 'right';
  return {
    wallId: wall.id,
    id: uuid(),
    from,
    value: from === 'left' ? x : wall.length - x,
    ...(wall.side === 'back' ? { wallSide: 'back' } : {}),
  };
}

export default function useStageClick({
  room,
  wall,
  settings,
  tool,
  transform,
  dispatch,
  stageRef,
  panRef,
  spacePressedRef,
  suppressClickRef,
  liveGestureRef,
  entry,
  updateEntry,
  commitEntry,
  measure,
  showMessage,
  messageTimeoutRef,
}) {
  const handleStageClick = useCallback((event) => {
    if (suppressClickRef.current) return;
    if (tool === 'measure') {
      const pointer = stageRef.current?.getPointerPosition();
      if (event.evt.button === 0 && pointer && transform && !panRef.current && !spacePressedRef.current) {
        const { x, z } = screenToWall(pointer, transform);
        measure.click({ x, y: z }, event.evt.shiftKey);
      }
      return;
    }
    if (liveGestureRef.current?.kind === 'run-move') {
      if (event.evt.button !== 0) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (pointer && transform) {
        updateEntry(screenToWall(pointer, transform).x - liveGestureRef.current.pointerStartX);
      }
      commitEntry();
      return;
    }
    if (event.target !== event.target.getStage()) return;
    if (entry) {
      commitEntry();
      return;
    }
    if (tool === 'select') {
      dispatch(setSelection({}));
      return;
    }
    if (tool === 'line') {
      if (!room || !wall || !transform) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;
      const rawPoint = screenToWall(pointer, transform);
      if (rawPoint.x < 0 || rawPoint.x > wall.length) return;
      const payload = layoutLineAt(wall, screenPointToWallSnapped(
        pointer, wall, transform, settings.openingSnap, 0,
      ).x);
      dispatch(addLayoutLine(payload));
      dispatch(setSelection({ lineId: payload.id }));
      return;
    }
    if (tool === 'recess') {
      if (!room || !wall || !transform) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;
      const rawPoint = screenToWall(pointer, transform);
      if (rawPoint.x < 0 || rawPoint.x > wall.length
        || rawPoint.z < 0 || rawPoint.z > wall.height) return;
      const recess = createRecess({ kind: 'recess', x: rawPoint.x }, { room, wall });
      const validation = validateRecessPlacement(wall, recess);
      if (!validation.ok) {
        showMessage(RECESS_PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
        return;
      }
      dispatch(addRecess({ wallId: wall.id, recess }));
      return;
    }
    if ((tool !== 'door' && tool !== 'window') || !room || !wall || !transform) return;
    if (wall.side === 'back') {
      showMessage('Add doors and windows from the front');
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const rawPoint = screenToWall(pointer, transform);
    if (rawPoint.x < 0 || rawPoint.x > wall.length
      || rawPoint.z < 0 || rawPoint.z > wall.height) return;
    const point = screenPointToWallSnapped(
      pointer,
      wall,
      transform,
      settings.openingSnap,
      0,
    );
    const opening = createOpening({ kind: tool, x: point.x }, { settings, room, wall });
    const jamb = openingGeometry(opening, wall.length, settings).jamb;
    const host = recessForSpan(wall, {
      left: jamb.x, right: jamb.x + jamb.width, bottom: jamb.z, top: jamb.z + jamb.height,
    }, 0, ['recess']);
    const placed = host ? { ...opening, recessId: host.id } : opening;
    const validation = validateOpeningPlacement(wall, placed, settings);
    if (!validation.ok) {
      showMessage(validation.reason);
      return;
    }
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(addOpening({ wallId: wall.id, opening: placed }));
    dispatch(setSelection({ openingId: placed.id }));
  }, [commitEntry, dispatch, entry, measure.click, room, settings, showMessage, tool, transform, updateEntry, wall]);

  return { handleStageClick };
}
