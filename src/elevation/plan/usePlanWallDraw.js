import { useCallback, useEffect } from 'react';
import { snapToEndpoint, snapToGrid } from '../../canvas/SnapEngine.js';
import {
  endpointAlignmentTargets,
  snapToAlignment,
} from '../canvas/alignment.js';
import { wallFrame } from '../model/geometry.js';
import { snapToWallFace } from '../model/landings.js';
import { formatInches } from '../model/units.js';
import { wallSideView } from '../model/wallSides.js';
import { addWallSegment } from '../store/elevationSlice.js';
import { ENDPOINT_SNAP_RADIUS } from './constants.js';
import { snapPointOrtho } from './wallOps.js';

const ALIGNMENT_SNAP_PX = 6;

export default function usePlanWallDraw({
  room, walls, adaptedWalls, settings, tool, entry, scale, dispatch, beginEntry,
  cancelDrawing, liveGestureRef, wallDrawStart, setWallDrawStart, setMouseWorldPos,
  setAlignmentGuides,
}) {
  const gridAndOrtho = useCallback((point, fixed = null) => {
    const gridPoint = snapToGrid(point, settings.planGrid);
    return fixed
      ? snapPointOrtho(fixed, gridPoint, settings.orthoWalls)
      : gridPoint;
  }, [settings.orthoWalls, settings.planGrid]);

  const applyAlignment = useCallback((point, { fixed = null, excludeWallId = null } = {}) => {
    const axes = !fixed || !settings.orthoWalls
      ? ['x', 'y']
      : (Math.abs(point.y - fixed.y) <= 1e-6 ? ['x'] : ['y']);
    const result = snapToAlignment(
      point,
      endpointAlignmentTargets(walls, excludeWallId),
      ALIGNMENT_SNAP_PX / scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result.point;
  }, [scale, settings.orthoWalls, walls]);

  const snapDrawPoint = useCallback((snapped, fixed) => {
    const endpointSnap = snapToEndpoint(
      snapped,
      adaptedWalls,
      ENDPOINT_SNAP_RADIUS,
    );
    if (endpointSnap) {
      setAlignmentGuides([]);
      return {
        point: { x: endpointSnap.x, y: endpointSnap.y },
        connect: { wallId: endpointSnap.wallId, endpoint: endpointSnap.endpoint },
        land: null,
        faceLabel: null,
      };
    }

    const faceSnap = snapToWallFace(room, snapped, ENDPOINT_SNAP_RADIUS);
    if (faceSnap) {
      setAlignmentGuides([]);
      const host = room.walls.find((wall) => wall.id === faceSnap.wallId);
      const length = host
        ? wallFrame(room, wallSideView(host, faceSnap.side)).length
        : 0;
      const fromLeft = faceSnap.x <= length - faceSnap.x;
      return {
        point: faceSnap.point,
        connect: null,
        land: {
          wallId: faceSnap.wallId,
          side: faceSnap.side,
          x: faceSnap.x,
        },
        faceLabel: `${formatInches(fromLeft ? faceSnap.x : length - faceSnap.x)} from ${fromLeft ? 'left' : 'right'}`,
      };
    }

    return {
      point: applyAlignment(snapped, { fixed }),
      connect: null,
      land: null,
      faceLabel: null,
    };
  }, [adaptedWalls, applyAlignment, room]);

  useEffect(() => {
    if (!settings.orthoWalls || tool !== 'wall' || !wallDrawStart || entry) return;
    const start = wallDrawStart;
    liveGestureRef.current = {
      kind: 'wall-draw',
      direction: null,
      connectEnd: null,
      landEnd: null,
      pointerLength: 0,
    };
    beginEntry({
      kind: 'wall-draw',
      label: 'Wall length',
      value: 0,
      min: 0,
      max: Infinity,
      onCommit: (length) => {
        const gesture = liveGestureRef.current;
        if (gesture?.kind !== 'wall-draw' || !gesture.direction || length <= 0) return;
        const point = {
          x: start.x + gesture.direction.x * length,
          y: start.y + gesture.direction.y * length,
        };
        const connectEnd = gesture.connectEnd
          && Math.abs(length - gesture.pointerLength) < 1e-6
          ? gesture.connectEnd
          : null;
        const landEnd = gesture.landEnd
          && Math.abs(length - gesture.pointerLength) < 1e-6
          ? gesture.landEnd
          : null;
        const action = addWallSegment({
          x1: start.x,
          y1: start.y,
          x2: point.x,
          y2: point.y,
          connectStart: start._connectTo,
          connectEnd,
          landStart: start._connectTo ? null : start._landOn,
          landEnd,
        });
        dispatch(action);
        liveGestureRef.current = null;
        setWallDrawStart({
          ...point,
          _connectTo: { wallId: action.payload.id, endpoint: 'end' },
          _landOn: null,
        });
        setMouseWorldPos(null);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        cancelDrawing();
      },
    });
  }, [
    beginEntry,
    cancelDrawing,
    dispatch,
    entry,
    settings.orthoWalls,
    tool,
    wallDrawStart,
  ]);

  return { gridAndOrtho, applyAlignment, snapDrawPoint };
}
