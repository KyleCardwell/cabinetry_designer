import { useCallback, useEffect } from 'react';
import { snapToEndpoint, snapToGrid } from '../../canvas/SnapEngine.js';
import {
  endpointAlignmentTargets,
  snapToAlignment,
} from '../canvas/alignment.js';
import { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { cross, dot, normalize, subtract, wallFrame } from '../model/geometry.js';
import { landingEndLabel, snapToWallFace } from '../model/landings.js';
import { formatInches } from '../model/units.js';
import { wallSideView } from '../model/wallSides.js';
import { addWallSegment } from '../store/elevationSlice.js';
import { ENDPOINT_SNAP_RADIUS } from './constants.js';
import { drawDirection, snapPointOrtho } from './wallOps.js';

const ALIGNMENT_SNAP_PX = 6;

export default function usePlanWallDraw({
  room, walls, adaptedWalls, settings, tool, entry, scale, dispatch, beginEntry, updateEntry,
  cancelDrawing, liveGestureRef, wallDrawStart, setWallDrawStart, setMouseWorldPos,
  setAlignmentGuides,
}) {
  const connection = wallDrawStart?._connectTo;
  const landing = wallDrawStart?._landOn;
  const previous = walls.find((wall) => wall.id === (connection?.wallId ?? landing?.wallId));
  let previousDir = null;
  if (previous && connection) {
    const away = connection.endpoint === 'start'
      ? { x: previous.x2 - previous.x1, y: previous.y2 - previous.y1 }
      : { x: previous.x1 - previous.x2, y: previous.y1 - previous.y2 };
    previousDir = normalize({ x: -away.x, y: -away.y });
  } else if (previous && landing) {
    // A face start uses the host face's direction as the incoming wall.
    previousDir = wallFrame(room, wallSideView(previous, landing.side)).r;
  }
  const faceStart = Boolean(landing && !connection);
  const previousX = previousDir?.x;
  const previousY = previousDir?.y;

  const gridAndOrtho = useCallback((point, fixed = null, step = 90) => {
    const gridPoint = snapToGrid(point, settings.planGrid);
    return fixed
      ? snapPointOrtho(fixed, gridPoint, settings.orthoWalls, step)
      : gridPoint;
  }, [settings.orthoWalls, settings.planGrid]);

  const applyAlignment = useCallback((point, { fixed = null, excludeWallId = null } = {}) => {
    const axes = !fixed || !settings.orthoWalls
      ? ['x', 'y']
      : (Math.abs(point.y - fixed.y) <= 1e-6 ? ['x']
        : Math.abs(point.x - fixed.x) <= 1e-6 ? ['y'] : []);
    const result = snapToAlignment(
      point,
      endpointAlignmentTargets(walls, excludeWallId),
      ALIGNMENT_SNAP_PX / scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result.point;
  }, [scale, setAlignmentGuides, settings.orthoWalls, walls]);

  const snapDrawPoint = useCallback((snapped, fixed, lockedDirection = null) => {
    const onLine = (point) => !lockedDirection || (
      Math.abs(cross(lockedDirection, subtract(point, fixed))) <= 1e-3
      && dot(lockedDirection, subtract(point, fixed)) >= 0
    );
    const endpointSnap = snapToEndpoint(
      snapped,
      adaptedWalls,
      ENDPOINT_SNAP_RADIUS,
    );
    if (endpointSnap && onLine(endpointSnap)) {
      return {
        point: { x: endpointSnap.x, y: endpointSnap.y },
        connect: { wallId: endpointSnap.wallId, endpoint: endpointSnap.endpoint },
        land: null,
        faceLabel: null,
        guides: [],
      };
    }

    const faceSnap = snapToWallFace(room, snapped, ENDPOINT_SNAP_RADIUS, { from: lockedDirection ? fixed : null });
    if (faceSnap && onLine(faceSnap.point)) {
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
        guides: [],
        faceLabel: `${formatInches(fromLeft ? faceSnap.x : length - faceSnap.x)} from ${landingEndLabel(room, host, faceSnap.side, fromLeft ? 'left' : 'right')}`,
      };
    }

    const axes = !fixed || !settings.orthoWalls ? ['x', 'y']
      : Math.abs(snapped.y - fixed.y) <= 1e-6 ? ['x']
        : Math.abs(snapped.x - fixed.x) <= 1e-6 ? ['y'] : [];
    const alignment = lockedDirection ? { point: snapped, guides: [] } : snapToAlignment(
      snapped, endpointAlignmentTargets(walls), ALIGNMENT_SNAP_PX / scale, axes,
    );
    return {
      ...alignment,
      connect: null,
      land: null,
      faceLabel: null,
    };
  }, [adaptedWalls, room, scale, settings.orthoWalls, walls]);

  const drawState = useCallback((pointer, angle = null) => {
    const start = wallDrawStart;
    if (!start) return null;
    let incoming = previousX === undefined ? null : { x: previousX, y: previousY };
    const delta = subtract(pointer ?? start, start);
    if (faceStart && cross(incoming, delta) < 0) {
      // Match landingCorner's choice of host arm on either side of the face.
      incoming = { x: -incoming.x, y: -incoming.y };
    }
    const side = incoming && cross(incoming, delta) < 0 ? -1 : 1;
    const lockedDirection = angle === null ? null : drawDirection({ previousDir: incoming, angle, side });
    const projectedLength = lockedDirection ? Math.max(0, dot(delta, lockedDirection)) : null;
    const snapped = lockedDirection ? {
      x: start.x + lockedDirection.x * projectedLength,
      y: start.y + lockedDirection.y * projectedLength,
    } : gridAndOrtho(pointer ?? start, start, 45);
    const result = snapDrawPoint(snapped, start, lockedDirection);
    const offset = subtract(result.point, start);
    const length = Math.hypot(offset.x, offset.y);
    const direction = lockedDirection ?? (length > 0 ? normalize(offset) : null);
    const liveAngle = !direction ? 0 : incoming
      ? Math.acos(Math.max(-1, Math.min(1, -dot(incoming, direction)))) * 180 / Math.PI
      : (Math.atan2(-direction.y, direction.x) * 180 / Math.PI + 360) % 360;
    return { ...result, direction, pointerLength: length, angle: liveAngle };
  }, [faceStart, gridAndOrtho, previousX, previousY, snapDrawPoint, wallDrawStart]);

  const activeAngle = entry?.kind === 'wall-draw'
    ? (entry.modeKey === 'angle' && entry.typed?.trim()
      ? resolveLiveEntryValue(entry) : entry.locked.angle ?? null)
    : null;
  const updateDrawPointer = useCallback((pointer) => {
    liveGestureRef.current = { kind: 'wall-draw', pointer, resolve: drawState };
    return drawState(pointer, activeAngle);
  }, [activeAngle, drawState, liveGestureRef]);
  const drawPointer = liveGestureRef?.current?.kind === 'wall-draw'
    ? liveGestureRef.current.pointer : null;
  const preview = entry?.kind === 'wall-draw' ? drawState(drawPointer, activeAngle) : null;
  const pointerLength = preview?.pointerLength;
  const pointerAngle = preview?.angle;
  useEffect(() => {
    if (liveGestureRef?.current?.kind === 'wall-draw') {
      liveGestureRef.current.resolve = drawState;
    }
    if (pointerLength === undefined) return;
    updateEntry(pointerLength, 'length');
    updateEntry(pointerAngle, 'angle');
  }, [drawState, liveGestureRef, pointerAngle, pointerLength, updateEntry]);
  const previewLength = entry?.kind === 'wall-draw'
    ? (entry.modeKey === 'length' && entry.typed?.trim()
      ? resolveLiveEntryValue(entry) : entry.locked.length ?? preview?.pointerLength)
    : null;
  const drawPreview = preview?.direction ? {
    x: wallDrawStart.x + preview.direction.x * previewLength,
    y: wallDrawStart.y + preview.direction.y * previewLength,
    _faceLabel: Math.abs(previewLength - preview.pointerLength) <= 1e-3 ? preview.faceLabel : null,
  } : null;

  useEffect(() => {
    if (tool !== 'wall' || !wallDrawStart || entry) return;
    const start = wallDrawStart;
    liveGestureRef.current = { kind: 'wall-draw', pointer: null, resolve: drawState };
    beginEntry({
      kind: 'wall-draw',
      modes: [
        { key: 'length', label: 'Length', value: 0, min: 0, max: Infinity },
        { key: 'angle', label: previous ? 'Angle' : 'Direction', unit: '°', value: 0, min: previous ? 15 : 0, max: previous ? 345 : 360 },
      ],
      onCommit: (value, modeKey, locked) => {
        const angle = locked.angle ?? (modeKey === 'angle' ? value : null);
        const current = liveGestureRef.current;
        const gesture = (current?.resolve ?? drawState)(current?.pointer, angle);
        const length = locked.length ?? (modeKey === 'length' ? value : gesture?.pointerLength);
        if (!gesture?.direction || length <= 0) return;
        const point = {
          x: start.x + gesture.direction.x * length,
          y: start.y + gesture.direction.y * length,
        };
        const atSnap = Math.abs(length - gesture.pointerLength) <= 1e-3;
        const connectEnd = atSnap ? gesture.connect : null;
        const landEnd = atSnap ? gesture.land : null;
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
        setAlignmentGuides([]);
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
    drawState,
    previous,
    liveGestureRef,
    setAlignmentGuides,
    setMouseWorldPos,
    setWallDrawStart,
    tool,
    wallDrawStart,
  ]);

  return { gridAndOrtho, applyAlignment, snapDrawPoint, updateDrawPointer, drawPreview, drawGuides: preview?.guides };
}
