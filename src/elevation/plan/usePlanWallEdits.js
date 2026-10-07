/* eslint-disable react-hooks/exhaustive-deps -- Preserve the original dependency lists.
 * Passed setters, refs, and the snap radius retain their stable identities.
 */
import { useCallback, useEffect } from 'react';
import { snapToEndpoint } from '../../canvas/SnapEngine.js';
import { wallFrame } from '../model/geometry.js';
import {
  connectWalls,
  disconnectWallEndpoint,
  moveWallEndpoint,
  moveWallPerpendicular,
  setWallLength,
} from '../store/elevationSlice.js';
import { moveWallPerpendicular as previewWallPerpendicular } from './wallOps.js';

export default function usePlanWallEdits({
  walls,
  gridAndOrtho,
  adaptedWalls,
  ENDPOINT_SNAP_RADIUS,
  setAlignmentGuides,
  applyAlignment,
  dispatch,
  room,
  selectedWall,
  setWallMovePreview,
  entry,
  entryValue,
  stageRef,
  setEntryPointer,
  liveGestureRef,
  beginEntry,
  toWorld,
  settings,
}) {
  const handleWallEndpointDrag = useCallback((wallId, endpoint, event) => {
    const wall = walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    const fixed = endpoint === 'start'
      ? { x: wall.x2, y: wall.y2 }
      : { x: wall.x1, y: wall.y1 };
    const snapped = gridAndOrtho(
      { x: event.target.x(), y: event.target.y() },
      fixed,
    );
    const endpointSnap = snapToEndpoint(
      snapped,
      adaptedWalls,
      ENDPOINT_SNAP_RADIUS,
      wallId,
    );
    let point;
    if (endpointSnap) {
      setAlignmentGuides([]);
      point = { x: endpointSnap.x, y: endpointSnap.y };
    } else {
      point = applyAlignment(snapped, { fixed, excludeWallId: wallId });
    }
    event.target.position(point);
    dispatch(moveWallEndpoint({ wallId, endpoint, ...point }));

    if (event.type !== 'dragend') return;
    setAlignmentGuides([]);
    if (endpointSnap) {
      dispatch(connectWalls({
        wallId1: wallId,
        endpoint1: endpoint,
        wallId2: endpointSnap.wallId,
        endpoint2: endpointSnap.endpoint,
      }));
    } else if (wall.connections?.[endpoint]) {
      dispatch(disconnectWallEndpoint({ wallId, endpoint }));
    }
  }, [adaptedWalls, applyAlignment, dispatch, gridAndOrtho, walls]);

  const previewPerpendicularMove = useCallback((delta) => {
    if (!room || !selectedWall) return;
    const result = previewWallPerpendicular(room, selectedWall.id, delta);
    if (!result.ok) {
      setWallMovePreview({ delta, room: null, affectedWallIds: [] });
      return;
    }
    const affectedWallIds = [
      selectedWall.id,
      ...['start', 'end'].map((endpoint) => (
        selectedWall.connections?.[endpoint]?.wallId
      )).filter(Boolean),
    ];
    setWallMovePreview({
      delta,
      room: { ...room, walls: result.walls },
      affectedWallIds: [...new Set(affectedWallIds)],
    });
  }, [room, selectedWall]);

  useEffect(() => {
    if (entry?.kind === 'wall-perpendicular') {
      previewPerpendicularMove(entryValue);
    }
  }, [entry?.kind, entryValue, previewPerpendicularMove]);

  const beginWallMove = useCallback((event) => {
    event.cancelBubble = true;
    if (!selectedWall) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    setWallMovePreview(null);
    liveGestureRef.current = { kind: 'wall-perpendicular' };
    beginEntry({
      kind: 'wall-perpendicular',
      label: 'Wall offset',
      value: 0,
      min: -Infinity,
      max: Infinity,
      onCommit: (delta) => {
        liveGestureRef.current = null;
        setWallMovePreview(null);
        dispatch(moveWallPerpendicular({ wallId: selectedWall.id, delta }));
      },
      onCancel: () => {
        liveGestureRef.current = null;
        setWallMovePreview(null);
      },
    });
  }, [beginEntry, dispatch, selectedWall]);

  const beginWallLength = useCallback((wallId, growEnd, event) => {
    event.cancelBubble = true;
    if (!room) return;
    const targetWall = walls.find((wall) => wall.id === wallId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!targetWall || !pointer) return;
    const frame = wallFrame(room, targetWall);
    const aOut = growEnd === 'left'
      ? { x: -frame.r.x, y: -frame.r.y }
      : frame.r;
    setEntryPointer(pointer);
    liveGestureRef.current = {
      kind: 'wall-length',
      wallId,
      growEnd,
      initialLength: frame.length,
      pointerStart: toWorld(pointer),
      aOut,
    };
    beginEntry({
      kind: 'wall-length',
      label: 'Wall length',
      value: frame.length,
      min: settings.planGrid,
      max: Infinity,
      onCommit: (length) => {
        liveGestureRef.current = null;
        dispatch(setWallLength({ wallId, length, growEnd }));
      },
      onCancel: () => {
        liveGestureRef.current = null;
      },
    });
  }, [beginEntry, dispatch, room, settings.planGrid, toWorld, walls]);


  return {
    handleWallEndpointDrag,
    previewPerpendicularMove,
    beginWallMove,
    beginWallLength,
  };
}
