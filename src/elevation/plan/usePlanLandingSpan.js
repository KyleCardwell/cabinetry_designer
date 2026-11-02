import { useCallback, useEffect } from 'react';
import { wallLabel } from '../model/topology.js';
import { setWallLanding } from '../store/elevationSlice.js';

export default function usePlanLandingSpan({
  room, tool, entry, beginEntry, cancelEntry, dispatch, stageRef, setEntryPointer,
  handleContextMenu,
}) {
  useEffect(() => {
    if (entry?.kind === 'landing-span' && tool !== 'select') cancelEntry();
  }, [cancelEntry, entry?.kind, tool]);

  const beginLandingSpan = useCallback((span, event) => {
    event.cancelBubble = true;
    if (tool !== 'select' || entry || event.evt?.button > 0) return;
    const wall = room?.walls.find(({ id }) => id === span.wallId);
    const host = room?.walls.find(({ id }) => id === wall?.landings?.[span.endpoint]?.wallId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!wall || !host || !pointer) return;
    const value = span.end - span.start;
    setEntryPointer(pointer);
    beginEntry({
      kind: 'landing-span',
      min: 0,
      max: Infinity,
      // Live-entry modes each own their bounds.
      modes: [
        { key: 'landed', label: `Move ${wallLabel(room, wall)}`, value, min: 0, max: Infinity },
        { key: 'host', label: `Move ${wallLabel(room, host)}`, value, min: 0, max: Infinity },
      ],
      onCommit: (offset, move) => dispatch(setWallLanding({
        wallId: span.wallId, endpoint: span.endpoint, ref: span.ref, to: 'near', offset, move,
      })),
    });
  }, [beginEntry, dispatch, entry, room, setEntryPointer, stageRef, tool]);

  const handleLandingSpanContextMenu = useCallback((event) => {
    if (entry?.kind === 'landing-span') {
      event.evt.preventDefault();
      event.cancelBubble = true;
      cancelEntry();
      return;
    }
    handleContextMenu(event);
  }, [cancelEntry, entry?.kind, handleContextMenu]);

  return { beginLandingSpan, handleLandingSpanContextMenu };
}
