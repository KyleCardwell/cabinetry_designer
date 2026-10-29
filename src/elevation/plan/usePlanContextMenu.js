import { useCallback, useEffect, useState } from 'react';
import { footprintsAtPoint } from '../model/footprints.js';
import { wallSideOf } from '../model/wallSides.js';
import { setActiveWall, setSelection, setTool } from '../store/elevationSlice.js';

export default function usePlanContextMenu({
  room, walls, settings, tool, view, activeRoomId, activeWallId, activeWallSide,
  dispatch, stageRef, toWorld, measure, moving, cancelMove, closePicker, cancelEntry,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const menuContext = `${activeRoomId}:${activeWallId}:${activeWallSide}:${view}:${tool}`;
  useEffect(() => {
    if (moving || (contextMenu && contextMenu.context !== menuContext)) closeContextMenu();
  }, [closeContextMenu, contextMenu, menuContext, moving]);

  const handleContextMenu = useCallback((event) => {
    event.evt.preventDefault();
    closeContextMenu();
    closePicker();
    if (tool === 'measure') {
      measure.cancelFirst();
      return;
    }
    if (moving) {
      cancelMove();
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || !room) return;
    const runId = footprintsAtPoint(room, toWorld(pointer), settings)[0];
    if (!runId) return;
    const wall = walls.find((wall) => wall.runs.some(({ id }) => id === runId));
    const side = wallSideOf(wall.runs.find(({ id }) => id === runId));
    cancelEntry();
    dispatch(setTool('select'));
    dispatch(setActiveWall(wall.id));
    dispatch(setSelection({ runId, pieceId: null }));
    setContextMenu({
      ...pointer, runId,
      context: `${activeRoomId}:${wall.id}:${side}:${view}:select`,
    });
  }, [activeRoomId, cancelEntry, cancelMove, closeContextMenu, closePicker, dispatch,
    measure.cancelFirst, moving, room, settings, toWorld, tool, view, walls]);

  return { contextMenu, closeContextMenu, handleContextMenu };
}
