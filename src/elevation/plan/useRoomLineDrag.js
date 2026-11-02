import { useCallback, useEffect, useRef, useState } from 'react';
import { planPointToWallX } from '../model/geometry.js';
import { moveLineTo } from '../model/linePlacement.js';
import { roomLineFrame } from '../model/roomLines.js';
import { updateRoomLine } from '../store/elevationSlice.js';

// The resize direction is along the reference face, across the plan line.
export function roomLineCursor(frame) {
  const angle = (Math.atan2(frame.r.y, frame.r.x) * 180 / Math.PI + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

export default function useRoomLineDrag({ room, tool, entry, settings, dispatch, toWorld, cursor, onSelect }) {
  const gesture = useRef(null);
  const handledPress = useRef(false);
  const [previewLine, setPreviewLine] = useState(null);

  const cancel = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    setPreviewLine(null);
    cursor?.releaseHold();
  }, [cursor]);

  useEffect(() => {
    const move = (event) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return null;
      current.stage.setPointersPositions(event);
      const pointer = current.stage.getPointerPosition();
      if (!pointer) { cancel(); return null; }
      const x = planPointToWallX(current.reference.frame, toWorld(pointer));
      const result = moveLineTo(room, current.reference.wall.id, current.line.id, x, settings,
        { wallSide: current.reference.side });
      if (!result.ok) { cancel(); return null; }
      // moveLineTo.value is the projected face distance; updateRoomLine takes the stored distance.
      const line = result.room.roomLines.find((line) => line.id === current.line.id);
      setPreviewLine(line);
      return line;
    };
    const finish = (event) => {
      const line = move(event);
      if (!line) return;
      cancel();
      dispatch(updateRoomLine({ roomLineId: line.id, value: line.value }));
    };
    const losePointer = (event) => {
      if (event.pointerId === gesture.current?.pointerId) cancel();
    };
    const leaveWindow = (event) => { if (!event.relatedTarget) losePointer(event); };
    const escape = (event) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault();
      // Run before usePlanKeys so cancelling does not also clear the selection.
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', losePointer);
    window.addEventListener('lostpointercapture', losePointer);
    window.addEventListener('pointerout', leaveWindow);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', losePointer);
      window.removeEventListener('lostpointercapture', losePointer);
      window.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
      cancel();
    };
  }, [cancel, dispatch, room, settings, toWorld]);

  useEffect(() => { cancel(); }, [room, tool, entry, cancel]);

  const start = (line, event) => {
    event.cancelBubble = true;
    if (tool !== 'select' || entry || event.evt.button !== 0 || gesture.current) return;
    const reference = roomLineFrame(room, line);
    const stage = event.target.getStage();
    if (!reference || !stage) return;
    event.evt.preventDefault();
    handledPress.current = true;
    gesture.current = { line, reference, stage, pointerId: event.evt.pointerId };
    cursor?.hold(roomLineCursor(reference.frame));
    onSelect?.(line.id);
  };

  const click = (lineId, event) => {
    event.cancelBubble = true;
    if (!handledPress.current) onSelect?.(lineId);
    handledPress.current = false;
  };

  return { previewLine, start, click };
}
