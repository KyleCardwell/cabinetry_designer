import { useCallback, useEffect, useState } from 'react';
import { screenToWall } from '../../canvas/transform.js';
import { defaultPick, pickStack } from '../../model/pick.js';
import { setSelection, setTool } from '../../store/elevationSlice.js';

export default function useRunContextMenu({
  room, wall, settings, tool, transform, dispatch, stageRef, doorsOff, measure, moving,
  cancelMove, centerPick, closePicker, cancelEntry, viewKey, activeKey, menuContext,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
    if (centerPick.active) {
      centerPick.cancel();
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || !room || !wall || !transform) return;
    const candidates = pickStack(room, wall, settings, screenToWall(pointer, transform), { doorsOff });
    const runId = defaultPick(candidates)?.selection?.runId;
    if (!runId) return;
    cancelEntry();
    dispatch(setTool('select'));
    dispatch(setSelection({ runId }));
    setContextMenu({
      ...pointer,
      runId,
      context: `${room.id}:${viewKey}:${activeKey}:select:${doorsOff}`,
    });
  }, [activeKey, cancelEntry, cancelMove, centerPick, closeContextMenu, closePicker, dispatch, doorsOff,
    measure.cancelFirst, moving, room, settings, tool, transform, viewKey, wall]);

  return { contextMenu, closeContextMenu, handleContextMenu };
}
