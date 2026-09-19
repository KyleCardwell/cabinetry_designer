import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Layer,
  Rect,
  Stage,
  Text,
} from 'react-konva';
import {
  belowRowOffsets,
  dimensionRowOffsets,
  layoutDimensionRow,
} from '../canvas/dimensionLayout.js';
import { panExceedsThreshold } from '../canvas/panGesture.js';
import {
  DEFAULT_VIEW,
  fitWallToViewport,
  panView,
  screenToWall,
  wallToScreen,
  withView,
  zoomViewAt,
} from '../canvas/transform.js';
import {
  dragPointsToRunInput,
  screenPointToWallSnapped,
} from '../canvas/drag.js';
import { snapToAlignment, runAlignmentTargets } from '../canvas/alignment.js';
import { createRun } from '../model/runDefaults.js';
import {
  createOpening,
  openingGeometry,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  horizontalChains,
  openingChain,
  openingClearances,
  pickColumnRuns,
  verticalChains,
  verticalOpeningChain,
} from '../model/dimensions.js';
import { resolveProfile } from '../model/profile.js';
import { elevationLabel, nextWallId } from '../model/topology.js';
import {
  moveRun,
  roomDiagnostics,
  stretchRun,
  tryPlaceRun,
} from '../model/room.js';
import {
  addOpening,
  addRun,
  deleteOpening,
  deleteRun,
  moveOpening,
  removeItem,
  replaceRun,
  setMessage,
  setSelection,
  setActiveWall,
  setTool,
} from '../store/elevationSlice.js';
import DragPreview from './DragPreview.jsx';
import DimensionRow from './DimensionRow.jsx';
import ElevationAlignmentGuides from './ElevationAlignmentGuides.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import OpeningShape from './OpeningShape.jsx';
import RunGroup from './RunGroup.jsx';
import WallFrame from './WallFrame.jsx';

const ALIGNMENT_SNAP_PX = 6;

function ElevationCanvas({
  room,
  wall,
  settings,
  fitRequest = 0,
  onZoomChange,
}, ref) {
  const dispatch = useDispatch();
  const { tool, selection } = useSelector((state) => state.elevation);
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(DEFAULT_VIEW);
  const [drag, setDrag] = useState(null);
  const [stretchPreview, setStretchPreview] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const moveOriginRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const spacePressedRef = useRef(false);
  const selectionRef = useRef(selection);
  const wallRef = useRef(wall);
  const messageTimeoutRef = useRef(null);
  const clickSuppressionTimeoutRef = useRef(null);
  const suppressClickRef = useRef(false);
  const wallId = wall?.id ?? null;
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const profile = useMemo(
    () => (room && wall ? resolveProfile(settings, room, wall) : null),
    [room, settings, wall],
  );
  const dimensionChains = useMemo(() => {
    if (!room || !wall) return null;
    const lower = horizontalChains(room, wall, 'lower', settings);
    const upper = horizontalChains(room, wall, 'upper', settings);
    const columnRuns = pickColumnRuns(wall, selection.runId);
    const selectedOpening = (wall.openings ?? []).find(
      (opening) => opening.id === selection.openingId,
    );
    return {
      lower,
      upper,
      openings: openingChain(room, wall, settings),
      clearances: openingClearances(room, wall, settings),
      vertical: selectedOpening
        ? verticalOpeningChain(wall, selectedOpening, wall.length, settings)
        : verticalChains(room, wall, columnRuns, settings),
    };
  }, [room, selection.openingId, selection.runId, settings, wall]);

  selectionRef.current = selection;
  wallRef.current = wall;

  const updateDrag = useCallback((nextDrag) => {
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  }, []);

  const cancelDrag = useCallback(() => updateDrag(null), [updateDrag]);

  const resetView = useCallback(() => {
    setView(DEFAULT_VIEW);
  }, []);

  const stopPanning = useCallback(() => {
    const current = panRef.current;
    panRef.current = null;
    if (!current?.moved) return;
    suppressClickRef.current = true;
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    clickSuppressionTimeoutRef.current = globalThis.setTimeout(() => {
      suppressClickRef.current = false;
      clickSuppressionTimeoutRef.current = null;
    }, 0);
  }, []);

  const showMessage = useCallback((message) => {
    dispatch(setMessage(message));
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = globalThis.setTimeout(() => {
      dispatch(setMessage(null));
      messageTimeoutRef.current = null;
    }, 3000);
  }, [dispatch]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = ({ width, height }) => {
      const next = {
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      };
      setViewport((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };

    const initial = container.getBoundingClientRect();
    updateSize(initial);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updateSize(entries[0].contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cancelDrag();
    setStretchPreview(null);
    dispatch(setSelection({}));
  }, [cancelDrag, dispatch, wallId]);

  useEffect(() => {
    resetView();
  }, [fitRequest, resetView, wallId]);

  useEffect(() => {
    if (tool !== 'draw') cancelDrag();
    if (tool !== 'select') setStretchPreview(null);
  }, [cancelDrag, tool]);

  useEffect(() => {
    setStretchPreview(null);
  }, [selection.runId]);

  useEffect(() => () => {
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
    }
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    dispatch(setMessage(null));
  }, [dispatch]);

  useEffect(() => {
    const handleSpaceDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;
      if (event.code !== 'Space') return;
      event.preventDefault();
      spacePressedRef.current = true;
    };
    const handleSpaceUp = (event) => {
      if (event.code === 'Space') spacePressedRef.current = false;
    };
    const handleBlur = () => {
      spacePressedRef.current = false;
      stopPanning();
    };
    const handlePointerMove = (event) => {
      const current = panRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (dx === 0 && dy === 0) return;
      const moved = current.moved || panExceedsThreshold(
        { x: current.originX, y: current.originY },
        { x: event.clientX, y: event.clientY },
      );
      panRef.current = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved,
      };
      if (!moved) return;
      setView((activeView) => panView(activeView, dx, dy));
    };
    const handlePointerEnd = (event) => {
      if (panRef.current && event.pointerId === panRef.current.pointerId) stopPanning();
    };
    const handlePointerOut = (event) => {
      if (!event.relatedTarget) stopPanning();
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('pointerout', handlePointerOut);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('pointerout', handlePointerOut);
    };
  }, [stopPanning]);

  const baseTransform = useMemo(() => (
    wall && viewport.width > 0 && viewport.height > 0
      ? fitWallToViewport(wall, viewport, {
        top: dimensionChains?.upper.inner.length > 0 ? 96 : 64,
        right: 48,
        bottom: dimensionChains?.openings.length > 0 ? 152 : 96,
        left: 110,
      })
      : null
  ), [
    dimensionChains?.openings.length,
    dimensionChains?.upper.inner.length,
    viewport,
    wall,
  ]);
  const transform = useMemo(
    () => (baseTransform ? withView(baseTransform, view) : null),
    [baseTransform, view],
  );

  const zoomAt = useCallback((pointer, factor) => {
    if (!baseTransform) return;
    setView((current) => zoomViewAt(baseTransform, current, pointer, factor));
  }, [baseTransform]);

  const zoomIn = useCallback(() => {
    zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1.08);
  }, [viewport.height, viewport.width, zoomAt]);

  const zoomOut = useCallback(() => {
    zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1 / 1.08);
  }, [viewport.height, viewport.width, zoomAt]);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut }), [zoomIn, zoomOut]);

  useEffect(() => {
    onZoomChange?.(view.zoom);
  }, [onZoomChange, view.zoom]);

  const dimensionOffsets = useMemo(() => {
    if (!dimensionChains || !transform) return null;
    const lowerLevels = layoutDimensionRow(dimensionChains.lower.inner, {
      scale: transform.scale,
    }).levels;
    const upperLevels = layoutDimensionRow(dimensionChains.upper.inner, {
      scale: transform.scale,
    }).levels;
    const lowerOuterLevels = layoutDimensionRow(dimensionChains.lower.outer, {
      scale: transform.scale,
    }).levels;
    const openingLevels = layoutDimensionRow(dimensionChains.openings, {
      scale: transform.scale,
    }).levels;
    const clearanceLevels = layoutDimensionRow(dimensionChains.clearances, {
      scale: transform.scale,
    }).levels;
    const verticalLevels = layoutDimensionRow(dimensionChains.vertical.inner, {
      scale: transform.scale,
    }).levels;
    const below = belowRowOffsets({
      clearances: clearanceLevels,
      pieces: lowerLevels,
      overall: lowerOuterLevels,
      openings: openingLevels,
    });
    return {
      lower: { inner: below.pieces, outer: below.overall },
      upper: dimensionRowOffsets('horizontal', upperLevels),
      vertical: dimensionRowOffsets('vertical', verticalLevels),
      openings: below.openings,
      clearances: below.clearances,
      label: below.label,
    };
  }, [dimensionChains, transform]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;

      if (event.key === 'Escape') {
        setAlignmentGuides([]);
        if (dragRef.current) cancelDrag();
        else if (stretchPreview) setStretchPreview(null);
        else dispatch(setSelection({}));
        return;
      }

      if (event.key === '[' || event.key === ']') {
        const currentWall = wallRef.current;
        const targetWallId = nextWallId(room, currentWall?.id, event.key === '[' ? -1 : 1);
        if (targetWallId && targetWallId !== currentWall?.id) {
          event.preventDefault();
          dispatch(setActiveWall(targetWallId));
        }
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        resetView();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      const currentSelection = selectionRef.current;
      const currentWall = wallRef.current;
      if (!currentWall) return;
      if (currentSelection.openingId) {
        const selectedOpening = (currentWall.openings ?? []).find(
          (opening) => opening.id === currentSelection.openingId,
        );
        if (!selectedOpening) return;
        event.preventDefault();
        dispatch(deleteOpening({
          wallId: currentWall.id,
          openingId: selectedOpening.id,
        }));
        return;
      }
      if (!currentSelection.runId) return;
      const selectedRun = currentWall.runs.find(
        (run) => run.id === currentSelection.runId,
      );
      if (!selectedRun) return;

      if (currentSelection.pieceId) {
        const selectedItem = selectedRun.items.find(
          (item) => item.id === currentSelection.pieceId,
        );
        if (!selectedItem) return;
        event.preventDefault();
        dispatch(removeItem({
          wallId: currentWall.id,
          runId: selectedRun.id,
          itemId: selectedItem.id,
        }));
        return;
      }

      event.preventDefault();
      dispatch(deleteRun({ wallId: currentWall.id, runId: selectedRun.id }));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDrag, dispatch, resetView, room, stretchPreview, zoomIn, zoomOut]);

  const handleWheel = useCallback((event) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    let factor = event.evt.deltaY < 0 ? 1.08 : 1 / 1.08;
    if (event.evt.ctrlKey || event.evt.metaKey) factor = 1 / factor;
    zoomAt(pointer, factor);
  }, [zoomAt]);

  const handlePanPointerDown = useCallback((event) => {
    const pointerEvent = event.evt;
    const emptyCanvas = event.target === stageRef.current;
    const middleDrag = pointerEvent.button === 1;
    const spaceDrag = pointerEvent.button === 0 && spacePressedRef.current;
    const selectDrag = pointerEvent.button === 0 && tool === 'select';
    if (!emptyCanvas || dragRef.current || stretchPreview
      || (!middleDrag && !spaceDrag && !selectDrag)) return;
    pointerEvent.preventDefault();
    panRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originY: pointerEvent.clientY,
      moved: false,
    };
  }, [stretchPreview, tool]);

  const dragBounds = useMemo(() => (
    drag ? dragPointsToRunInput(drag.start, drag.current) : null
  ), [drag]);
  const dragPreview = useMemo(() => {
    if (!dragBounds || !room || !wall || dragBounds.width <= 0) return null;
    const run = createRun(dragBounds, { settings, room, wall });
    const placement = tryPlaceRun(room, wall.id, run, settings);
    const resolvedWall = placement.room.walls.find(
      (candidate) => candidate.id === wall.id,
    );
    return {
      run: resolvedWall?.runs.find((candidate) => candidate.id === run.id) ?? run,
      valid: placement.ok,
    };
  }, [dragBounds, room, settings, wall]);

  const applyRunAlignment = useCallback((point, excludeRunId = null, axes = ['x']) => {
    if (!wall || !transform) return point;
    const result = snapToAlignment(
      point,
      runAlignmentTargets(wall, excludeRunId),
      ALIGNMENT_SNAP_PX / transform.scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result.point;
  }, [transform, wall]);

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
    const point = applyRunAlignment(raw, null, ['x', 'z']);
    return point;
  };

  const handleMouseDown = (event) => {
    if (tool !== 'draw' || event.evt.button !== 0
      || spacePressedRef.current || panRef.current) return;
    const point = wallPointFromEvent(event);
    if (!point) return;
    dispatch(setSelection({}));
    updateDrag({ start: point, current: point });
  };

  const handleMouseMove = (event) => {
    if (!dragRef.current) return;
    const point = wallPointFromEvent(event);
    if (!point) return;
    updateDrag({ ...dragRef.current, current: point });
  };

  const handleMouseUp = (event) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || !wall) return;
    const end = wallPointFromEvent(event) ?? currentDrag.current;
    const bounds = dragPointsToRunInput(currentDrag.start, end);
    cancelDrag();
    setAlignmentGuides([]);
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    suppressClickRef.current = true;
    clickSuppressionTimeoutRef.current = globalThis.setTimeout(() => {
      suppressClickRef.current = false;
      clickSuppressionTimeoutRef.current = null;
    }, 0);

    if (bounds.width < settings.minRunWidth) return;

    const run = createRun(bounds, { settings, room, wall });
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
    dispatch(addRun({ wallId: wall.id, run }));
    dispatch(setTool('select'));
    dispatch(setSelection({ runId: run.id, pieceId: null }));
  };

  const selectRun = useCallback((runId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId: null }));
  }, [dispatch, tool]);

  const selectPiece = useCallback((runId, pieceId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId }));
  }, [dispatch, tool]);

  const selectOpening = useCallback((openingId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ openingId }));
  }, [dispatch, tool]);

  const moveSelectedOpening = useCallback((openingId, x) => {
    if (!wall) return;
    dispatch(moveOpening({ wallId: wall.id, openingId, x }));
  }, [dispatch, wall]);

  const handleStageClick = useCallback(() => {
    if (suppressClickRef.current) return;
    if (tool === 'select') {
      dispatch(setSelection({}));
      return;
    }
    if ((tool !== 'door' && tool !== 'window') || !room || !wall || !transform) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const rawPoint = screenToWall(pointer, transform);
    if (rawPoint.x < 0 || rawPoint.x > wall.length
      || rawPoint.z < 0 || rawPoint.z > wall.height) return;
    const point = screenPointToWallSnapped(
      pointer,
      wall,
      transform,
      settings.openingSnap,
      0,
    );
    const opening = createOpening({ kind: tool, x: point.x }, { settings, room, wall });
    const validation = validateOpeningPlacement(wall, opening, settings);
    if (!validation.ok) {
      showMessage(validation.reason);
      return;
    }
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(addOpening({ wallId: wall.id, opening }));
    dispatch(setTool('select'));
    dispatch(setSelection({ openingId: opening.id }));
  }, [dispatch, room, settings, showMessage, tool, transform, wall]);

  const previewStretch = useCallback((runId, side, newEdgeX) => {
    if (!room || !wall) return;
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).x;
    const result = stretchRun(room, wall.id, runId, side, alignedEdgeX, settings);
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const previewRun = previewWall?.runs.find((candidate) => candidate.id === runId);
    if (!previewWall || !previewRun) return;
    setStretchPreview({
      room: result.room,
      wall: previewWall,
      run: previewRun,
    });
  }, [applyRunAlignment, room, settings, wall]);

  const startStretch = useCallback((runId) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === runId);
    if (run) setStretchPreview({ room, wall, run });
  }, [room, wall]);

  const finishStretch = useCallback((runId, side, newEdgeX) => {
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).x;
    setStretchPreview(null);
    setAlignmentGuides([]);
    if (!room || !wall) return;
    const result = stretchRun(room, wall.id, runId, side, alignedEdgeX, settings);
    if (!result.ok) {
      showMessage(result.reason);
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const resolvedRun = resolvedWall?.runs.find((candidate) => candidate.id === runId);
    if (!resolvedRun) return;
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
  }, [applyRunAlignment, dispatch, room, settings, showMessage, wall]);

  const startRunMove = useCallback((segment) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === segment.runId);
    if (!run) return;
    moveOriginRef.current = { runId: run.id, x: run.x };
    setStretchPreview({ room, wall, run });
  }, [room, wall]);

  const applyRunMove = useCallback((segment, delta, commit) => {
    const origin = moveOriginRef.current;
    if (!origin || !room || !wall || origin.runId !== segment.runId) return;
    const result = moveRun(room, wall.id, segment.runId, origin.x + delta, settings);
    if (!result.ok) {
      if (commit) {
        moveOriginRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        showMessage(result.reason === 'anchored'
          ? 'Anchored — set Anchor to Free to move'
          : result.reason);
      }
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const resolvedRun = resolvedWall?.runs.find((candidate) => candidate.id === segment.runId);
    if (!resolvedRun) return;
    setAlignmentGuides(result.snap ? [{ axis: 'x', value: result.snap.value }] : []);
    if (!commit) {
      setStretchPreview({ room: result.room, wall: resolvedWall, run: resolvedRun });
      return;
    }
    moveOriginRef.current = null;
    setStretchPreview(null);
    setAlignmentGuides([]);
    dispatch(setMessage(null));
    dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
  }, [dispatch, room, settings, showMessage, wall]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-gray-900"
      style={{ cursor: ['draw', 'door', 'window'].includes(tool) ? 'crosshair' : 'default' }}
    >
      {!wall && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Add a wall to begin.
        </div>
      )}
      {wall && transform && (
        <Stage
          ref={stageRef}
          width={viewport.width}
          height={viewport.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onPointerDown={handlePanPointerDown}
          onPointerCancel={stopPanning}
          onWheel={handleWheel}
          onClick={handleStageClick}
        >
          <Layer listening={false}>
            <Rect width={viewport.width} height={viewport.height} fill="#111827" />
            <WallFrame
              wall={wall}
              transform={transform}
              crownTop={profile?.crownTop}
            />
          </Layer>
          <Layer>
            {(wall.openings ?? []).map((opening) => (
              <OpeningShape
                key={opening.id}
                opening={opening}
                geometry={openingGeometry(opening, wall.length, settings)}
                transform={transform}
                selected={selection.openingId === opening.id}
                selectable={tool === 'select'}
                onSelect={selectOpening}
                onMove={(x) => moveSelectedOpening(opening.id, x)}
              />
            ))}
            {wall.runs.map((run) => (
              <RunGroup
                key={run.id}
                run={run}
                room={room}
                wall={wall}
                settings={settings}
                diagnostic={diagnostics[run.id]}
                transform={transform}
                selectedRun={selection.runId === run.id}
                selectedPieceId={
                  selection.runId === run.id ? selection.pieceId : null
                }
                onSelectRun={selectRun}
                onSelectPiece={selectPiece}
                stretchable={tool === 'select'}
                onStretchStart={startStretch}
                onStretchMove={previewStretch}
                onStretchEnd={finishStretch}
              />
            ))}
          </Layer>
          <Layer listening={false}>
            <NeighborReturns
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
            />
            <ElevationAlignmentGuides
              guides={alignmentGuides}
              transform={transform}
              width={viewport.width}
              height={viewport.height}
            />
          </Layer>
          {dimensionChains && dimensionOffsets && (
            <Layer listening={tool === 'select'}>
              <DimensionRow
                segments={dimensionChains.clearances}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.clearances}
                transform={transform}
                wallEndMarks={[0, wall.length]}
              />
              <DimensionRow
                segments={dimensionChains.lower.inner}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.lower.inner}
                transform={transform}
                wallEndMarks={[0, wall.length]}
              />
              <DimensionRow
                segments={dimensionChains.lower.outer}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.lower.outer}
                transform={transform}
                onSegmentClick={(segment) => selectRun(segment.runId)}
                draggableRuns={tool === 'select'}
                onSegmentDragStart={startRunMove}
                onSegmentDragMove={(segment, delta) => applyRunMove(segment, delta, false)}
                onSegmentDragEnd={(segment, delta) => applyRunMove(segment, delta, true)}
                highlightRunId={selection.runId}
                wallEndMarks={[0, wall.length]}
              />
              <DimensionRow
                segments={dimensionChains.openings}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.openings}
                transform={transform}
                wallEndMarks={[0, wall.length]}
              />
              {elevationLabel(room, wall) && (
                <Text
                  x={wallToScreen({ x: wall.length / 2, z: 0 }, transform).x}
                  y={wallToScreen({ x: wall.length / 2, z: 0 }, transform).y + dimensionOffsets.label}
                  text={elevationLabel(room, wall)}
                  fontSize={20}
                  fill="#e2e8f0"
                  align="center"
                  offsetX={70}
                  width={140}
                  listening={false}
                />
              )}
              <DimensionRow
                segments={dimensionChains.upper.inner}
                orientation="horizontal"
                side="above"
                offsetPx={dimensionOffsets.upper.inner}
                transform={transform}
                wallEndMarks={[0, wall.length]}
              />
              <DimensionRow
                segments={dimensionChains.upper.outer}
                orientation="horizontal"
                side="above"
                offsetPx={dimensionOffsets.upper.outer}
                transform={transform}
                onSegmentClick={(segment) => selectRun(segment.runId)}
                draggableRuns={tool === 'select'}
                onSegmentDragStart={startRunMove}
                onSegmentDragMove={(segment, delta) => applyRunMove(segment, delta, false)}
                onSegmentDragEnd={(segment, delta) => applyRunMove(segment, delta, true)}
                highlightRunId={selection.runId}
                wallEndMarks={[0, wall.length]}
              />
              <DimensionRow
                segments={dimensionChains.vertical.inner}
                orientation="vertical"
                side="left"
                offsetPx={dimensionOffsets.vertical.inner}
                transform={transform}
              />
              <DimensionRow
                segments={dimensionChains.vertical.outer}
                orientation="vertical"
                side="left"
                offsetPx={dimensionOffsets.vertical.outer}
                transform={transform}
              />
            </Layer>
          )}
          {stretchPreview && (
            <Layer listening={false}>
              <RunGroup
                run={stretchPreview.run}
                room={stretchPreview.room}
                wall={stretchPreview.wall}
                settings={settings}
                diagnostic={null}
                transform={transform}
                selectedRun={false}
                selectedPieceId={null}
                preview
              />
            </Layer>
          )}
          {dragPreview && (
            <Layer listening={false}>
              <DragPreview
                run={dragPreview.run}
                valid={dragPreview.valid}
                transform={transform}
              />
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
}

export default forwardRef(ElevationCanvas);
