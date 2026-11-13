import { useCallback, useMemo } from 'react';
import { panExceedsThreshold } from '../../canvas/panGesture.js';
import { screenToWall } from '../../canvas/transform.js';
import { dragPointsToRunInput, screenPointToWallSnapped } from '../../canvas/drag.js';
import { createRun } from '../../model/runDefaults.js';
import {
  createSoffit,
  resolveSoffitSpan,
  validateSoffitPlacement,
} from '../../model/soffits.js';
import {
  joinTouchingEdges,
  joinTouchingStack,
  tryPlaceRun,
} from '../../model/room.js';
import {
  addRun,
  addSoffit,
  replaceWallLayout,
  setMessage,
  setSelection,
} from '../../store/elevationSlice.js';
import { runDrawBounds, runWidthForEdgeX } from './runEdges.js';

export default function useDrawGestures({
  room,
  wall,
  settings,
  tool,
  transform,
  dispatch,
  stageRef,
  panRef,
  spacePressedRef,
  liveGestureRef,
  entry,
  entryRef,
  entryValue,
  beginEntry,
  updateEntry,
  commitEntry,
  updateDrag,
  cancelDrag,
  drag,
  setEntryPointer,
  setAlignmentGuides,
  applyRunAlignment,
  showMessage,
  messageTimeoutRef,
  suppressNextClick,
  measure,
}) {
  const dragBounds = useMemo(() => {
    if (!drag) return null;
    if (entry?.kind !== 'run-draw' && entry?.kind !== 'soffit-draw') {
      return dragPointsToRunInput(drag.start, drag.current);
    }
    return runDrawBounds(
      drag.start,
      drag.current,
      entryValue,
      liveGestureRef.current?.direction,
    );
  }, [drag, entry?.kind, entryValue]);
  const dragPreview = useMemo(() => {
    if (!dragBounds || !room || !wall || dragBounds.width <= 0) return null;
    const gesture = liveGestureRef.current;
    if (gesture?.kind === 'soffit-draw') return { soffit: dragBounds };
    const startSide = gesture?.direction < 0 ? 'right' : 'left';
    const currentSide = startSide === 'left' ? 'right' : 'left';
    const exactEdges = gesture?.kind === 'run-draw'
      ? {
          ...(Number.isFinite(gesture.snappedStartX)
            ? { [startSide]: gesture.snappedStartX }
            : {}),
          ...(Number.isFinite(gesture.snappedCurrentX)
            ? { [currentSide]: gesture.snappedCurrentX }
            : {}),
        }
      : {};
    const run = createRun(dragBounds, { settings, room, wall, exactEdges });
    const placement = tryPlaceRun(room, wall.id, run, settings);
    const resolvedWall = placement.room.walls.find(
      (candidate) => candidate.id === wall.id,
    );
    return {
      run: resolvedWall?.runs.find((candidate) => candidate.id === run.id) ?? run,
      valid: placement.ok,
    };
  }, [dragBounds, room, settings, wall]);

  const wallPointFromEvent = (event) => {
    if (!wall || !transform) return null;
    const pointer = event.target.getStage()?.getPointerPosition();
    const raw = pointer
      ? screenPointToWallSnapped(
        pointer,
        wall,
        transform,
        undefined,
        settings.maxRunOverhang,
      )
      : null;
    if (!raw) return null;
    const { point, guides } = applyRunAlignment(raw, null, ['x', 'z']);
    return {
      point,
      snappedX: guides.find((guide) => guide.axis === 'x')?.value ?? null,
    };
  };

  const commitRunDraw = useCallback((width) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-draw' || !room || !wall) return;
    const bounds = runDrawBounds(
      gesture.start,
      gesture.current,
      width,
      gesture.direction,
    );
    const startSide = gesture.direction < 0 ? 'right' : 'left';
    const currentSide = startSide === 'left' ? 'right' : 'left';
    const exactEdges = {
      ...(Number.isFinite(gesture.snappedStartX)
        ? { [startSide]: gesture.snappedStartX }
        : {}),
      ...(Number.isFinite(gesture.snappedCurrentX)
        ? { [currentSide]: gesture.snappedCurrentX }
        : {}),
    };
    liveGestureRef.current = null;
    cancelDrag();
    setAlignmentGuides([]);

    const run = createRun(bounds, { settings, room, wall, exactEdges });
    const placement = tryPlaceRun(room, wall.id, run, settings);
    if (!placement.ok) {
      showMessage(placement.reason);
      return;
    }

    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    const joinedPlacement = joinTouchingEdges(placement.room, wall.id, run.id, settings);
    const stackedPlacement = joinTouchingStack(joinedPlacement.room, wall.id, run.id, settings);
    if (joinedPlacement.joined.length > 0 || stackedPlacement.joined.length > 0) {
      const resolvedWall = stackedPlacement.room.walls.find(
        (candidate) => candidate.id === wall.id,
      );
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(addRun({ wallId: wall.id, run }));
    }
    dispatch(setSelection({ runId: run.id, pieceId: null }));
  }, [cancelDrag, dispatch, room, settings, showMessage, wall]);

  const commitSoffitDraw = useCallback((width) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'soffit-draw' || !room || !wall) return;
    const bounds = runDrawBounds(
      gesture.start,
      gesture.current,
      width,
      gesture.direction,
    );
    liveGestureRef.current = null;
    cancelDrag();
    setAlignmentGuides([]);

    const soffit = createSoffit(bounds, { settings, room, wall });
    const resolvedSoffit = {
      ...soffit,
      ...resolveSoffitSpan(room, wall, soffit),
    };
    const validation = validateSoffitPlacement(wall, resolvedSoffit);
    if (!validation.ok) {
      showMessage(validation.reason === 'soffit-overlap'
        ? "Soffits can't overlap"
        : 'A soffit needs room below the ceiling');
      return;
    }

    dispatch(addSoffit({ wallId: wall.id, soffit }));
  }, [cancelDrag, dispatch, room, settings, showMessage, wall]);

  const handleMouseDown = (event) => {
    if ((tool !== 'draw' && tool !== 'soffit') || event.evt.button !== 0
      || spacePressedRef.current || panRef.current) return;
    if (entry) return;
    const wallPoint = wallPointFromEvent(event);
    if (!wallPoint) return;
    const { point, snappedX } = wallPoint;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    dispatch(setSelection({}));
    updateDrag({ start: point, current: point });
    setEntryPointer(pointer);
    const kind = tool === 'soffit' ? 'soffit-draw' : 'run-draw';
    liveGestureRef.current = {
      kind,
      start: point,
      current: point,
      direction: 1,
      snappedStartX: snappedX,
      pressStart: pointer,
      awaitingClick: false,
    };
    beginEntry({
      kind,
      label: 'Width',
      value: 0,
      min: settings.minRunWidth,
      max: Infinity,
      onCommit: kind === 'soffit-draw' ? commitSoffitDraw : commitRunDraw,
      onCancel: () => {
        liveGestureRef.current = null;
        cancelDrag();
        setAlignmentGuides([]);
      },
    });
  };

  const handleMouseMove = (event) => {
    const gesture = liveGestureRef.current;
    const pointer = stageRef.current?.getPointerPosition();
    if (tool === 'measure' && pointer && transform && !panRef.current && !spacePressedRef.current) {
      const { x, z } = screenToWall(pointer, transform);
      measure.move({ x, y: z }, event.evt?.shiftKey);
      return;
    }
    if (!entry || !gesture || !pointer) return;
    setEntryPointer(pointer);
    if (
      (entry.kind === 'run-draw' || entry.kind === 'soffit-draw')
      && gesture.kind === entry.kind
    ) {
      const wallPoint = wallPointFromEvent(event);
      if (!wallPoint) return;
      const { point, snappedX } = wallPoint;
      const direction = point.x === gesture.start.x
        ? gesture.direction
        : Math.sign(point.x - gesture.start.x);
      liveGestureRef.current = {
        ...gesture,
        current: point,
        direction,
        snappedCurrentX: snappedX,
      };
      updateDrag({ start: gesture.start, current: point });
      updateEntry(Math.abs(point.x - gesture.start.x));
      return;
    }
    if (!transform) return;
    const pointerX = screenToWall(pointer, transform).x;
    if (entry.kind === 'run-edge' && gesture.kind === 'run-edge') {
      if (gesture.jointId) {
        liveGestureRef.current = { ...gesture, requestedJointX: pointerX };
      }
      const edgeX = gesture.jointId
        ? gesture.side === 'right'
          ? pointerX - gesture.offset
          : pointerX + gesture.offset
        : pointerX;
      updateEntry(runWidthForEdgeX(gesture.run, gesture.side, edgeX));
    } else if (entry.kind === 'run-move' && gesture.kind === 'run-move') {
      updateEntry(pointerX - gesture.pointerStartX);
    }
  };

  const handleMouseUp = (event) => {
    const gesture = liveGestureRef.current;
    if ((entry?.kind !== 'run-draw' && entry?.kind !== 'soffit-draw')
      || gesture?.kind !== entry.kind
      || gesture.awaitingClick) return;
    const { point, snappedX } = wallPointFromEvent(event) ?? {
      point: gesture.current,
      snappedX: gesture.snappedCurrentX ?? null,
    };
    const pointer = stageRef.current?.getPointerPosition();
    const direction = point.x === gesture.start.x
      ? gesture.direction
      : Math.sign(point.x - gesture.start.x);
    liveGestureRef.current = {
      ...gesture,
      current: point,
      direction,
      snappedCurrentX: snappedX,
    };
    updateDrag({ start: gesture.start, current: point });
    updateEntry(Math.abs(point.x - gesture.start.x));
    suppressNextClick();

    if (!panExceedsThreshold(gesture.pressStart, pointer)) {
      liveGestureRef.current = { ...liveGestureRef.current, awaitingClick: true };
      return;
    }
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
  };

  return { dragPreview, handleMouseDown, handleMouseMove, handleMouseUp };
}
