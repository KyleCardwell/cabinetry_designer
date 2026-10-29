import { useCallback } from 'react';
import { planPointToWallX, wallFrame } from '../model/geometry.js';
import {
  createOpening,
  openingsAtPoint,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  addOpening,
  moveOpening,
  setActiveWall,
  setMessage,
  setSelection,
  setTool,
  setView,
} from '../store/elevationSlice.js';

export default function usePlanSelectHandlers({
  room, walls, settings, tool, entry, dispatch, stageRef, toWorld, pickAt,
  closePicker, showMessage, messageTimeoutRef,
}) {
  const placeOpeningOnWall = useCallback((wallId, event) => {
    if ((tool !== 'door' && tool !== 'window') || !room) return false;
    const pointer = stageRef.current?.getPointerPosition();
    const targetWall = walls.find((wall) => wall.id === wallId);
    if (!pointer || !targetWall) return false;
    event.cancelBubble = true;
    const frame = wallFrame(room, targetWall);
    const x = planPointToWallX(frame, toWorld(pointer));
    const opening = createOpening(
      { kind: tool, x },
      { settings, room, wall: targetWall },
    );
    const validation = validateOpeningPlacement(
      { ...targetWall, length: frame.length },
      opening,
      settings,
    );
    if (!validation.ok) {
      showMessage(validation.reason);
      return true;
    }
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(setActiveWall(targetWall.id));
    dispatch(addOpening({ wallId: targetWall.id, opening }));
    dispatch(setTool('select'));
    dispatch(setSelection({ openingId: opening.id }));
    return true;
  }, [dispatch, room, settings, showMessage, toWorld, tool, walls]);

  const handleWallSelect = useCallback((wallId, event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (placeOpeningOnWall(wallId, event)) return;
    if (tool !== 'select') return;
    pickAt(event);
  }, [entry, pickAt, placeOpeningOnWall, tool]);

  const handleWallOpen = useCallback((wallId, event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select') return;
    event.cancelBubble = true;
    dispatch(setActiveWall(wallId));
    dispatch(setView('elevation'));
  }, [dispatch, entry, tool]);

  const handleRunSelect = useCallback((event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select') return;
    pickAt(event);
  }, [entry, pickAt, tool]);

  const handleOpeningSelect = useCallback((event, targetOpeningId) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select' || !room) return;
    if (event.type !== 'dragstart') {
      pickAt(event);
      return;
    }
    closePicker();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const openingIds = openingsAtPoint(room, toWorld(pointer), settings);
    if (openingIds.length === 0) return;
    const openingId = openingIds.includes(targetOpeningId)
      ? targetOpeningId
      : openingIds[0];
    const openingWall = walls.find((wall) => (
      (wall.openings ?? []).some((opening) => opening.id === openingId)
    ));
    if (!openingWall) return;
    event.cancelBubble = true;
    dispatch(setActiveWall(openingWall.id));
    dispatch(setSelection({ openingId }));
  }, [closePicker, dispatch, entry, pickAt, room, settings, toWorld, tool, walls]);

  const handleOpeningMove = useCallback((wallId, openingId, x) => {
    dispatch(moveOpening({ wallId, openingId, x }));
  }, [dispatch]);

  return {
    handleWallSelect,
    handleWallOpen,
    handleRunSelect,
    handleOpeningSelect,
    handleOpeningMove,
  };
}
