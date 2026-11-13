import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CURSORS } from '../canvas/cursor.js';
import { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { dot, subtract, wallFrame } from '../model/geometry.js';
import { syncRoom } from '../model/roomSync.js';
import { wallLabel } from '../model/topology.js';
import { roundTo } from '../model/units.js';
import { canMoveWallGroup, heldBy, moveWallGroup, wallGroup } from '../model/wallGroups.js';
import { moveWallGroup as commitWallGroup } from '../store/elevationSlice.js';

export default function usePlanGroupMove({
  room, selectedWall, activeWallId, activeWallSide, settings, tool, view,
  entry, beginEntry, cancelEntry, updateEntry, cursor, dispatch,
  stageRef, toWorld, setEntryPointer, showMessage,
}) {
  const originRef = useRef(null);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [preview, setPreview] = useState(null);
  const canMoveGroup = useMemo(() => Boolean(room && selectedWall
    && canMoveWallGroup(room, selectedWall.id).ok), [room, selectedWall]);

  const clearMove = useCallback(() => {
    originRef.current = null;
    setPreview(null);
    cursor.releaseHold();
  }, [cursor]);
  const cancelGroupMove = useCallback(() => {
    if (originRef.current) cancelEntry();
  }, [cancelEntry]);
  useEffect(() => cancelGroupMove,
    [cancelGroupMove, room, selectedWall?.id, activeWallId, activeWallSide, tool, view]);

  const applyMove = useCallback((value, modeKey, commit = false) => {
    const origin = originRef.current;
    if (!origin) return;
    const axis = modeKey === 'across' ? origin.frame.n : origin.frame.r;
    const result = moveWallGroup(origin.room, origin.wallId, {
      x: axis.x * value, y: axis.y * value,
    });
    if (commit) {
      clearMove();
      if (result.ok) dispatch(commitWallGroup({ wallId: origin.wallId, [modeKey]: value }));
      else showMessage(result.message);
    } else if (result.ok) {
      setPreview({
        room: syncRoom(result.room, settings), delta: value, affectedWallIds: origin.group,
      });
    } else showMessage(result.message);
  }, [clearMove, dispatch, settings, showMessage]);

  const value = resolveLiveEntryValue(entry);
  useEffect(() => {
    if (entry?.kind === 'wall-group-move') applyMove(value, entry.modeKey);
  }, [applyMove, entry?.kind, entry?.modeKey, value]);

  const beginGroupMove = useCallback((event) => {
    if (event) event.cancelBubble = true;
    if (tool !== 'select' || !canMoveGroup || entryRef.current || originRef.current) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const label = wallLabel(room, selectedWall);
    originRef.current = {
      room, wallId: selectedWall.id, frame: wallFrame(room, selectedWall),
      pointer: toWorld(pointer), group: wallGroup(room, selectedWall.id),
    };
    setPreview({ room, delta: 0, affectedWallIds: originRef.current.group });
    cursor.hold(CURSORS.move);
    setEntryPointer(pointer);
    beginEntry({
      kind: 'wall-group-move',
      modes: [
        ...(!heldBy(room, selectedWall.id) ? [{ key: 'along', label: `Along ${label}`, value: 0 }] : []),
        { key: 'across', label: `Across ${label}`, value: 0 },
      ],
      onCommit: (nextValue, modeKey) => applyMove(nextValue, modeKey, true),
      onCancel: clearMove,
    });
  }, [applyMove, beginEntry, canMoveGroup, clearMove, cursor, room, selectedWall,
    setEntryPointer, stageRef, toWorld, tool]);

  const updateGroupPointer = useCallback((pointer) => {
    const origin = originRef.current;
    if (!origin) return;
    const axis = entryRef.current?.modeKey === 'across' ? origin.frame.n : origin.frame.r;
    updateEntry(roundTo(dot(subtract(toWorld(pointer), origin.pointer), axis), settings.planGrid));
  }, [settings.planGrid, toWorld, updateEntry]);

  return { preview, canMoveGroup, beginGroupMove, cancelGroupMove, updateGroupPointer };
}
