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
import {
  CURSORS,
  elevationBaseCursor,
  useCanvasCursor,
} from '../canvas/cursor.js';
import { panExceedsThreshold } from '../canvas/panGesture.js';
import {
  DEFAULT_VIEW,
  fitWallToViewport,
  panView,
  screenToWall,
  wallRectToScreen,
  wallToScreen,
  withView,
  zoomViewAt,
} from '../canvas/transform.js';
import {
  dragPointsToRunInput,
  screenPointToWallSnapped,
} from '../canvas/drag.js';
import { snapToAlignment, runAlignmentTargets } from '../canvas/alignment.js';
import useLiveEntry, { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../model/constants.js';
import { createRun } from '../model/runDefaults.js';
import {
  createSoffit,
  resolveSoffitSpan,
  validateSoffitPlacement,
} from '../model/soffits.js';
import {
  createOpening,
  openingGeometry,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  horizontalChains,
  nearerEdge,
  openingChain,
  openingClearances,
  pickColumnRuns,
  verticalChains,
  verticalOpeningChain,
} from '../model/dimensions.js';
import { resolveProfile } from '../model/profile.js';
import { partNumbers } from '../model/partNumbers.js';
import { elevationLabel, nextWallId } from '../model/topology.js';
import {
  joinTouchingEdges,
  endMinWidthsForRun,
  moveJoint,
  moveRun,
  roomDiagnostics,
  stretchRun,
  tryPlaceRun,
} from '../model/room.js';
import { wallSideView } from '../model/wallSides.js';
import { wallExtent } from '../model/wallExtent.js';
import { isJointAnchor, jointMembers } from '../model/joints.js';
import { runWidthRange } from '../model/splitRun.js';
import { formatInches } from '../model/units.js';
import {
  addOpening,
  addRun,
  addSoffit,
  deleteOpening,
  deleteRun,
  deleteSoffit,
  dissolveJoint,
  moveOpening,
  removeItem,
  replaceRun,
  replaceWallLayout,
  setRunAnchor,
  setMessage,
  setSelection,
  setFacePath,
  setActiveWall,
  setTool,
} from '../store/elevationSlice.js';
import DragPreview from './DragPreview.jsx';
import DimensionRow from './DimensionRow.jsx';
import ElevationAlignmentGuides from './ElevationAlignmentGuides.jsx';
import JointMarkers from './JointMarkers.jsx';
import LiveEntryInput from './LiveEntryInput.jsx';
import MoldingBadges from './MoldingBadges.jsx';
import NeighborProfiles from './NeighborProfiles.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import OpeningShape from './OpeningShape.jsx';
import RunGroup from './RunGroup.jsx';
import SoffitShapes from './SoffitShapes.jsx';
import WallEndPanelShapes from './WallEndPanelShapes.jsx';
import WallFrame from './WallFrame.jsx';

const ALIGNMENT_SNAP_PX = 6;
const RUN_TYPE_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base',
  [CABINET_TYPE_IDS.UPPER]: 'Upper',
  [CABINET_TYPE_IDS.TALL]: 'Tall',
};

function runDrawBounds(start, current, width, fallbackDirection = 1) {
  const direction = current.x === start.x
    ? fallbackDirection
    : Math.sign(current.x - start.x);
  return dragPointsToRunInput(start, {
    ...current,
    x: start.x + direction * width,
  });
}

function runEdgeXForWidth(run, side, width) {
  return side === 'left' ? run.x + run.width - width : run.x + width;
}

function runWidthForEdgeX(run, side, edgeX) {
  return side === 'left' ? run.x + run.width - edgeX : edgeX - run.x;
}

function ElevationCanvas({
  room,
  wall,
  settings,
  fitRequest = 0,
  onZoomChange,
}, ref) {
  const dispatch = useDispatch();
  const { tool, selection, facePath } = useSelector((state) => state.elevation);
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(DEFAULT_VIEW);
  const [drag, setDrag] = useState(null);
  const [stretchPreview, setStretchPreview] = useState(null);
  const [pointerMode, setPointerMode] = useState('idle');
  const [hoveredGlyphId, setHoveredGlyphId] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [entryPointer, setEntryPointer] = useState(null);
  const { style: cursorStyle, controller: cursor } = useCanvasCursor(
    elevationBaseCursor(tool, pointerMode),
  );
  const liveGestureRef = useRef(null);
  const moveOriginRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const spacePressedRef = useRef(false);
  const selectionRef = useRef(selection);
  const wallRef = useRef(wall);
  const messageTimeoutRef = useRef(null);
  const clickSuppressionTimeoutRef = useRef(null);
  const suppressClickRef = useRef(false);
  const {
    entry,
    begin: beginEntry,
    update: updateEntry,
    setTyped: setEntryTyped,
    cycle: cycleEntry,
    commit: commitEntry,
    cancel: cancelEntry,
  } = useLiveEntry();
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const entryValue = resolveLiveEntryValue(entry);
  const wallId = wall?.id ?? null;
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const partNumbering = useMemo(
    () => (room && settings.showPartNumbers ? partNumbers(room, settings) : null),
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
    const selectedOpening = (wall.openings ?? []).find(
      (opening) => opening.id === selection.openingId,
    );
    const openingCenter = selectedOpening
      ? (() => {
        const jamb = openingGeometry(selectedOpening, wall.length, settings).jamb;
        return jamb.x + jamb.width / 2;
      })()
      : null;
    const verticalFor = (edge) => (selectedOpening
      && nearerEdge(openingCenter, wall.length) === edge
      ? verticalOpeningChain(wall, selectedOpening, wall.length, settings)
      : verticalChains(room, wall, pickColumnRuns(wall, selection.runId, edge), settings));
    return {
      lower,
      upper,
      openings: openingChain(room, wall, settings),
      clearances: openingClearances(room, wall, settings),
      vertical: {
        left: verticalFor('left'),
        right: verticalFor('right'),
      },
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
    setPointerMode(spacePressedRef.current ? 'pan-ready' : 'idle');
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
    cancelEntry();
    cancelDrag();
    setStretchPreview(null);
    dispatch(setSelection({}));
  }, [cancelDrag, cancelEntry, dispatch, wallId]);

  useEffect(() => {
    resetView();
  }, [fitRequest, resetView, wallId]);

  useEffect(() => {
    if (tool !== 'draw' && tool !== 'soffit') cancelDrag();
    if (tool !== 'select') setStretchPreview(null);
  }, [cancelDrag, tool]);

  useEffect(() => {
    if (
      (entry?.kind === 'run-draw' || entry?.kind === 'soffit-draw')
      && tool !== 'draw'
      && tool !== 'soffit'
    ) cancelEntry();
    else if (
      (entry?.kind === 'run-edge' || entry?.kind === 'run-move')
      && tool !== 'select'
    ) cancelEntry();
  }, [cancelEntry, entry?.kind, tool]);

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
      setPointerMode('pan-ready');
    };
    const handleSpaceUp = (event) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
        setPointerMode('idle');
      }
    };
    const handleBlur = () => {
      spacePressedRef.current = false;
      setPointerMode('idle');
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
      if (moved && !current.moved) setPointerMode('panning');
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
      const current = panRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      stopPanning();
      // preventDefault on pointerdown suppresses Konva's mouse click, so a plain
      // left click on empty canvas deselects here instead of in handleStageClick.
      if (event.type === 'pointerup' && current.clearsSelection && !current.moved) {
        dispatch(setSelection({}));
      }
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
  }, [dispatch, stopPanning]);

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
    const verticalLevels = {
      left: layoutDimensionRow(dimensionChains.vertical.left.inner, {
        scale: transform.scale,
      }).levels,
      right: layoutDimensionRow(dimensionChains.vertical.right.inner, {
        scale: transform.scale,
      }).levels,
    };
    const extent = wallExtent(room, wall, settings);
    const clear = {
      below: Math.max(0, -extent.bottom) * transform.scale,
      above: Math.max(0, extent.top - wall.height) * transform.scale,
      left: Math.max(0, -extent.left) * transform.scale,
      right: Math.max(0, extent.right - wall.length) * transform.scale,
    };
    const below = belowRowOffsets({
      clearances: clearanceLevels,
      pieces: lowerLevels,
      overall: lowerOuterLevels,
      openings: openingLevels,
    });
    const upper = dimensionRowOffsets('horizontal', upperLevels);
    const vertical = {
      left: dimensionRowOffsets('vertical', verticalLevels.left),
      right: dimensionRowOffsets('vertical', verticalLevels.right),
    };
    return {
      lower: {
        inner: below.pieces + clear.below,
        outer: below.overall + clear.below,
      },
      upper: {
        inner: upper.inner + clear.above,
        outer: upper.outer + clear.above,
      },
      vertical: {
        left: {
          inner: vertical.left.inner + clear.left,
          outer: vertical.left.outer + clear.left,
        },
        right: {
          inner: vertical.right.inner + clear.right,
          outer: vertical.right.outer + clear.right,
        },
      },
      openings: below.openings + clear.below,
      clearances: below.clearances + clear.below,
      label: below.label + clear.below,
    };
  }, [dimensionChains, room, settings, transform, wall]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;

      if (event.key === 'Escape') {
        cursor.releaseHold();
        if (entry) {
          event.preventDefault();
          cancelEntry();
          return;
        }
        if (tool !== 'select') {
          if (dragRef.current) cancelDrag();
          setAlignmentGuides([]);
          dispatch(setTool('select'));
          dispatch(setSelection({}));
          return;
        }
        setAlignmentGuides([]);
        if (dragRef.current) cancelDrag();
        else if (stretchPreview) setStretchPreview(null);
        else if (facePath) dispatch(setFacePath(null));
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
      if (currentSelection.soffitId) {
        const selectedSoffit = (currentWall.soffits ?? []).find(
          (soffit) => soffit.id === currentSelection.soffitId,
        );
        if (!selectedSoffit) return;
        event.preventDefault();
        dispatch(deleteSoffit({
          wallId: currentWall.id,
          soffitId: selectedSoffit.id,
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
  }, [
    cancelDrag,
    cancelEntry,
    cursor,
    dispatch,
    entry,
    facePath,
    resetView,
    room,
    stretchPreview,
    tool,
    zoomIn,
    zoomOut,
  ]);

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
    if (!emptyCanvas || entry || dragRef.current || stretchPreview
      || (!middleDrag && !spaceDrag && !selectDrag)) return;
    pointerEvent.preventDefault();
    panRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originY: pointerEvent.clientY,
      moved: false,
      clearsSelection: selectDrag && !spaceDrag,
    };
  }, [entry, stretchPreview, tool]);

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

  const applyRunAlignment = useCallback((point, excludeRunId = null, axes = ['x']) => {
    if (!wall || !transform) return { point, guides: [] };
    const result = snapToAlignment(
      point,
      runAlignmentTargets(wall, excludeRunId),
      ALIGNMENT_SNAP_PX / transform.scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result;
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
    const { point, guides } = applyRunAlignment(raw, null, ['x', 'z']);
    return {
      point,
      snappedX: guides.find((guide) => guide.axis === 'x')?.value ?? null,
    };
  };

  const suppressNextClick = useCallback(() => {
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    suppressClickRef.current = true;
    clickSuppressionTimeoutRef.current = globalThis.setTimeout(() => {
      suppressClickRef.current = false;
      clickSuppressionTimeoutRef.current = null;
    }, 0);
  }, []);

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
    if (joinedPlacement.joined.length > 0) {
      const resolvedWall = joinedPlacement.room.walls.find(
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

  const selectRun = useCallback((runId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId: null }));
  }, [dispatch, tool]);

  const selectSoffit = useCallback((soffitId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ soffitId }));
  }, [dispatch, tool]);

  const selectPiece = useCallback((runId, pieceId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId }));
  }, [dispatch, tool]);

  const selectFace = useCallback((path) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setFacePath(path));
  }, [dispatch, tool]);

  const selectOpening = useCallback((openingId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ openingId }));
  }, [dispatch, tool]);

  const moveSelectedOpening = useCallback((openingId, x) => {
    if (!wall) return;
    dispatch(moveOpening({ wallId: wall.id, openingId, x }));
  }, [dispatch, wall]);

  const handleStageClick = useCallback((event) => {
    if (suppressClickRef.current) return;
    if (event.target !== event.target.getStage()) return;
    if (entry) {
      commitEntry();
      return;
    }
    if (tool === 'select') {
      dispatch(setSelection({}));
      return;
    }
    if ((tool !== 'door' && tool !== 'window') || !room || !wall || !transform) return;
    if (wall.side === 'back') {
      showMessage('Add doors and windows from the front');
      return;
    }
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
    dispatch(setSelection({ openingId: opening.id }));
  }, [commitEntry, dispatch, entry, room, settings, showMessage, tool, transform, wall]);

  const previewStretch = useCallback((runId, side, newEdgeX) => {
    if (!room || !wall) return;
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).point.x;
    const result = stretchRun(room, wall.id, runId, side, alignedEdgeX, settings);
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!previewWall?.runs.some((candidate) => candidate.id === runId)) return;
    setStretchPreview({
      room: result.room,
      wall: wallSideView(previewWall, wall.side),
      runIds: [runId],
    });
  }, [applyRunAlignment, room, settings, wall]);

  const commitStretch = useCallback((runId, side, newEdgeX) => {
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).point.x;
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
    if (result.joined) {
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
    }
  }, [applyRunAlignment, dispatch, room, settings, showMessage, wall]);

  const startStretch = useCallback((runId, side) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer) return;
    cancelEntry();
    cursor.hold(CURSORS.resizeX);
    const widthRange = runWidthRange(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    });
    const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
    const wallMaximum = side === 'left'
      ? run.x + run.width + maxRunOverhang
      : wall.length + maxRunOverhang - run.x;
    const maximum = Math.max(widthRange.min, Math.min(widthRange.max, wallMaximum));
    const widthModeKey = `run:${run.id}:${side}`;
    const edgeX = runEdgeXForWidth(run, side, run.width);
    const edgeLimits = [
      runEdgeXForWidth(run, side, widthRange.min),
      runEdgeXForWidth(run, side, maximum),
    ];
    const edgeMin = Math.min(...edgeLimits);
    const edgeMax = Math.max(...edgeLimits);
    const modes = [
      {
        key: widthModeKey,
        label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
        value: run.width,
        min: widthRange.min,
        max: maximum,
      },
      {
        key: 'from-left',
        label: 'From left',
        value: edgeX,
        min: edgeMin,
        max: edgeMax,
      },
      {
        key: 'from-right',
        label: 'From right',
        value: wall.length - edgeX,
        min: wall.length - edgeMax,
        max: wall.length - edgeMin,
      },
    ];
    setEntryPointer(pointer);
    setStretchPreview({ room, wall, runIds: [run.id] });
    liveGestureRef.current = { kind: 'run-edge', run, side, jointId: null, offset: 0 };
    beginEntry({
      kind: 'run-edge',
      label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
      value: run.width,
      min: widthRange.min,
      max: maximum,
      modes,
      onCommit: (value, modeKey) => {
        liveGestureRef.current = null;
        const committedEdgeX = modeKey === 'from-left'
          ? value
          : modeKey === 'from-right'
            ? wall.length - value
            : runEdgeXForWidth(run, side, value);
        commitStretch(run.id, side, committedEdgeX);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [beginEntry, cancelEntry, commitStretch, cursor, room, settings, wall]);

  const updateStretch = useCallback((runId, side, newEdgeX) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-edge' || gesture.run.id !== runId || gesture.side !== side) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    updateEntry(runWidthForEdgeX(gesture.run, side, newEdgeX));
  }, [updateEntry]);

  const finishStretch = useCallback((runId, side, newEdgeX) => {
    updateStretch(runId, side, newEdgeX);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateStretch]);

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
      const runIds = new Set([resolvedRun.id]);
      ['left', 'right'].forEach((side) => {
        const anchor = resolvedRun.anchors?.[side];
        if (isJointAnchor(anchor)) {
          jointMembers(resolvedWall, anchor.jointId).forEach((member) => runIds.add(member.runId));
        }
      });
      setStretchPreview({
        room: result.room,
        wall: wallSideView(resolvedWall, wall.side),
        runIds: [...runIds],
      });
      return;
    }
    moveOriginRef.current = null;
    setStretchPreview(null);
    setAlignmentGuides([]);
    dispatch(setMessage(null));
    if (result.joints) {
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
    }
    if (result.limit?.reason === 'min-width') {
      showMessage(`${result.limit.type} can't go below ${formatInches(result.limit.min)}`);
    } else if (result.limit?.reason === 'fixed-width') {
      showMessage(`${result.limit.type} is fixed at ${formatInches(result.limit.width)} (all cabinets fixed)`);
    }
  }, [dispatch, room, settings, showMessage, wall]);

  const startRunMove = useCallback((segment) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === segment.runId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!run || !pointer || !transform) return;
    const result = moveRun(room, wall.id, run.id, run.x, settings);
    cancelEntry();
    cursor.hold(CURSORS.move);
    dispatch(setSelection({ runId: run.id, pieceId: null }));
    setEntryPointer(pointer);
    moveOriginRef.current = { runId: run.id, x: run.x };
    setStretchPreview({ room, wall, runIds: [run.id] });
    liveGestureRef.current = {
      kind: 'run-move',
      segment,
      pointerStartX: screenToWall(pointer, transform).x,
    };
    beginEntry({
      kind: 'run-move',
      label: 'Move',
      value: 0,
      min: result.joints ? result.range.min : -Infinity,
      max: result.joints ? result.range.max : Infinity,
      onCommit: (delta) => {
        liveGestureRef.current = null;
        applyRunMove(segment, delta, true);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        moveOriginRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [applyRunMove, beginEntry, cancelEntry, cursor, dispatch, room, settings, transform, wall]);

  const handleRunSegmentClick = useCallback((segment) => {
    if (tool !== 'select') return;
    if (selectionRef.current?.runId !== segment.runId) {
      dispatch(setSelection({ runId: segment.runId, pieceId: null }));
      return;
    }
    startRunMove(segment);
  }, [dispatch, startRunMove, tool]);

  const updateRunMove = useCallback((segment, delta) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-move' || gesture.segment.runId !== segment.runId) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    updateEntry(delta);
  }, [updateEntry]);

  const finishRunMove = useCallback((segment, delta) => {
    updateRunMove(segment, delta);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateRunMove]);

  const previewJointDrag = useCallback((jointId, x) => {
    if (!room || !wall) return;
    const result = moveJoint(room, wall.id, jointId, x, settings);
    if (!result.ok) return;
    const previewWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!previewWall) return;
    setStretchPreview({
      room: result.room,
      wall: wallSideView(previewWall, wall.side),
      runIds: jointMembers(previewWall, jointId).map((member) => member.runId),
    });
  }, [room, settings, wall]);

  const commitJointDrag = useCallback((jointId, x) => {
    setStretchPreview(null);
    if (!room || !wall) return;
    const result = moveJoint(room, wall.id, jointId, x, settings);
    if (!result.ok) {
      showMessage(result.reason);
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    if (!resolvedWall) return;
    dispatch(replaceWallLayout({
      wallId: wall.id,
      runs: resolvedWall.runs,
      joints: resolvedWall.joints,
    }));

    const limitingRun = result.limit
      ? resolvedWall.runs.find((run) => run.id === result.limit.runId)
      : null;
    const type = RUN_TYPE_LABELS[limitingRun?.cabinetTypeId] ?? 'Run';
    if (result.limit?.reason === 'min-width') {
      showMessage(`${type} can't go below ${formatInches(limitingRun.width)}`);
    } else if (result.limit?.reason === 'fixed-width') {
      showMessage(`${type} is fixed at ${formatInches(limitingRun.width)} (all cabinets fixed)`);
    } else {
      dispatch(setMessage(null));
    }
  }, [dispatch, room, settings, showMessage, wall]);

  const startJointDrag = useCallback((jointId) => {
    if (!room || !wall) return;
    const member = jointMembers(wall, jointId).find(
      (candidate) => candidate.runId === selectionRef.current.runId,
    );
    const run = wall.runs.find((candidate) => candidate.id === member?.runId);
    const joint = (wall.joints ?? []).find((candidate) => candidate.id === jointId);
    const pointer = stageRef.current?.getPointerPosition();
    if (!member || !run || !joint || !pointer) return;
    cancelEntry();
    const rangeResult = moveJoint(room, wall.id, jointId, joint.x, settings);
    if (!rangeResult.range || rangeResult.range.min > rangeResult.range.max) return;
    cursor.hold(CURSORS.resizeX);
    const offset = member.offset ?? 0;
    const grabbedEdgeAtJoint = (jointX) => (
      member.side === 'right' ? jointX - offset : jointX + offset
    );
    const edgeMin = grabbedEdgeAtJoint(rangeResult.range.min);
    const edgeMax = grabbedEdgeAtJoint(rangeResult.range.max);
    const members = jointMembers(wall, jointId);
    const orderedMembers = [member, ...members.filter((candidate) => (
      candidate.runId !== member.runId || candidate.side !== member.side
    ))];
    const memberModes = orderedMembers.flatMap((candidate) => {
      const memberRun = wall.runs.find((wallRun) => wallRun.id === candidate.runId);
      if (!memberRun) return [];
      const memberOffset = candidate.offset ?? 0;
      const memberWidthAtJoint = (jointX) => runWidthForEdgeX(
        memberRun,
        candidate.side,
        candidate.side === 'right'
          ? jointX - memberOffset
          : jointX + memberOffset,
      );
      const widthLimits = [
        memberWidthAtJoint(rangeResult.range.min),
        memberWidthAtJoint(rangeResult.range.max),
      ];
      return [{
        key: `run:${candidate.runId}:${candidate.side}`,
        label: `${RUN_TYPE_LABELS[memberRun.cabinetTypeId] ?? 'Run'} width`,
        value: memberRun.width,
        min: Math.min(...widthLimits),
        max: Math.max(...widthLimits),
      }];
    });
    const modes = [
      ...memberModes,
      {
        key: 'from-left',
        label: 'From left',
        value: grabbedEdgeAtJoint(joint.x),
        min: edgeMin,
        max: edgeMax,
      },
      {
        key: 'from-right',
        label: 'From right',
        value: wall.length - grabbedEdgeAtJoint(joint.x),
        min: wall.length - edgeMax,
        max: wall.length - edgeMin,
      },
    ];
    const runIds = members.map((candidate) => candidate.runId);
    setEntryPointer(pointer);
    setStretchPreview({ room, wall, runIds });
    liveGestureRef.current = {
      kind: 'run-edge',
      run,
      side: member.side,
      jointId,
      offset,
    };
    beginEntry({
      kind: 'run-edge',
      label: `${RUN_TYPE_LABELS[run.cabinetTypeId] ?? 'Run'} width`,
      value: run.width,
      min: memberModes[0].min,
      max: memberModes[0].max,
      modes,
      onCommit: (value, modeKey) => {
        const activeGesture = liveGestureRef.current;
        liveGestureRef.current = null;
        const typed = entryRef.current?.typed;
        const modeMember = orderedMembers.find(
          (candidate) => `run:${candidate.runId}:${candidate.side}` === modeKey,
        );
        const modeRun = wall.runs.find((candidate) => candidate.id === modeMember?.runId);
        const modeOffset = modeMember?.offset ?? 0;
        const modeEdgeX = modeRun && modeMember
          ? runEdgeXForWidth(modeRun, modeMember.side, value)
          : null;
        const enteredEdgeX = modeKey === 'from-left'
          ? value
          : wall.length - value;
        const enteredJointX = modeKey === 'from-left' || modeKey === 'from-right'
          ? member.side === 'right'
            ? enteredEdgeX + offset
            : enteredEdgeX - offset
            : modeMember?.side === 'right'
              ? modeEdgeX + modeOffset
              : modeEdgeX - modeOffset;
        const jointX = typed === null && Number.isFinite(activeGesture?.requestedJointX)
          ? activeGesture.requestedJointX
          : enteredJointX;
        commitJointDrag(jointId, jointX);
      },
      onCancel: () => {
        liveGestureRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        cursor.releaseHold();
      },
    });
  }, [beginEntry, cancelEntry, commitJointDrag, cursor, room, settings, wall]);

  const updateJointDrag = useCallback((jointId, x) => {
    const gesture = liveGestureRef.current;
    if (gesture?.kind !== 'run-edge' || gesture.jointId !== jointId) return;
    liveGestureRef.current = { ...gesture, requestedJointX: x };
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) setEntryPointer(pointer);
    const edgeX = gesture.side === 'right' ? x - gesture.offset : x + gesture.offset;
    updateEntry(runWidthForEdgeX(gesture.run, gesture.side, edgeX));
  }, [updateEntry]);

  const finishJointDrag = useCallback((jointId, x) => {
    updateJointDrag(jointId, x);
    if (!entryRef.current || entryRef.current.typed === null) commitEntry();
    cursor.releaseHold();
  }, [commitEntry, cursor, updateJointDrag]);

  useEffect(() => {
    const gesture = liveGestureRef.current;
    if (!entry || entryValue === null || !gesture) return;
    if (entry.kind === 'run-edge' && gesture.kind === 'run-edge') {
      const edgeX = runEdgeXForWidth(gesture.run, gesture.side, entryValue);
      if (gesture.jointId) {
        const jointX = gesture.side === 'right'
          ? edgeX + gesture.offset
          : edgeX - gesture.offset;
        previewJointDrag(gesture.jointId, jointX);
      } else {
        previewStretch(gesture.run.id, gesture.side, edgeX);
      }
    } else if (entry.kind === 'run-move' && gesture.kind === 'run-move') {
      applyRunMove(gesture.segment, entryValue, false);
    }
  }, [applyRunMove, entry, entryValue, previewJointDrag, previewStretch]);

  const unjoinRunSide = useCallback((runId, side) => {
    if (!wall) return;
    setHoveredGlyphId(null);
    dispatch(setRunAnchor({ wallId: wall.id, runId, side, anchor: false }));
  }, [dispatch, wall]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-gray-900"
      style={{ cursor: cursorStyle }}
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
                selectable={tool === 'select' && wall.side !== 'back'}
                onSelect={selectOpening}
                onMove={(x) => moveSelectedOpening(opening.id, x)}
                cursor={cursor}
              />
            ))}
            <SoffitShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selectedSoffitId={selection.soffitId}
              onSelect={tool === 'select' ? selectSoffit : undefined}
            />
            {wall.runs.map((run) => (
              <RunGroup
                key={run.id}
                run={run}
                room={room}
                wall={wall}
                settings={settings}
                diagnostic={diagnostics[run.id]}
                partNumbers={partNumbering}
                transform={transform}
                selectedRun={selection.runId === run.id}
                selectedPieceId={
                  selection.runId === run.id ? selection.pieceId : null
                }
                onSelectRun={selectRun}
                onSelectPiece={selectPiece}
                selectedFacePath={selection.runId === run.id ? facePath : null}
                onSelectFace={selectFace}
                stretchable={tool === 'select'}
                onStretchStart={startStretch}
                onStretchMove={updateStretch}
                onStretchEnd={finishStretch}
                cursor={cursor}
              />
            ))}
            {tool === 'select' && (
              <JointMarkers
                wall={wall}
                transform={transform}
                selectedRunId={selection.runId}
                onJointDragStart={startJointDrag}
                onJointDragMove={previewJointDrag}
                onJointDragEnd={finishJointDrag}
                onUnjoin={unjoinRunSide}
                hoveredGlyphId={hoveredGlyphId}
                setHoveredGlyphId={setHoveredGlyphId}
                cursor={cursor}
              />
            )}
          </Layer>
          <Layer listening={false}>
            <NeighborReturns
              room={room}
              wall={wall}
              settings={settings}
              partNumbers={partNumbering}
              transform={transform}
            />
            <NeighborProfiles
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
            />
            <WallEndPanelShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
            />
            <MoldingBadges
              room={room}
              wall={wall}
              settings={settings}
              partNumbers={partNumbering}
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
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.lower.inner}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.lower.inner}
                transform={transform}
                wallEndMarks={[0, wall.length]}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.lower.outer}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.lower.outer}
                transform={transform}
                onSegmentClick={handleRunSegmentClick}
                draggableRuns={tool === 'select'}
                onSegmentDragStart={startRunMove}
                onSegmentDragMove={updateRunMove}
                onSegmentDragEnd={finishRunMove}
                highlightRunId={selection.runId}
                activeRunId={selection.runId}
                wallEndMarks={[0, wall.length]}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.openings}
                orientation="horizontal"
                side="below"
                offsetPx={dimensionOffsets.openings}
                transform={transform}
                wallEndMarks={[0, wall.length]}
                cursor={cursor}
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
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.upper.outer}
                orientation="horizontal"
                side="above"
                offsetPx={dimensionOffsets.upper.outer}
                transform={transform}
                onSegmentClick={handleRunSegmentClick}
                draggableRuns={tool === 'select'}
                onSegmentDragStart={startRunMove}
                onSegmentDragMove={updateRunMove}
                onSegmentDragEnd={finishRunMove}
                highlightRunId={selection.runId}
                activeRunId={selection.runId}
                wallEndMarks={[0, wall.length]}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.vertical.left.inner}
                orientation="vertical"
                side="left"
                offsetPx={dimensionOffsets.vertical.left.inner}
                transform={transform}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.vertical.left.outer}
                orientation="vertical"
                side="left"
                offsetPx={dimensionOffsets.vertical.left.outer}
                transform={transform}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.vertical.right.inner}
                orientation="vertical"
                side="right"
                offsetPx={dimensionOffsets.vertical.right.inner}
                transform={transform}
                wallLength={wall.length}
                cursor={cursor}
              />
              <DimensionRow
                segments={dimensionChains.vertical.right.outer}
                orientation="vertical"
                side="right"
                offsetPx={dimensionOffsets.vertical.right.outer}
                transform={transform}
                wallLength={wall.length}
                cursor={cursor}
              />
            </Layer>
          )}
          {stretchPreview && (
            <Layer listening={false}>
              {stretchPreview.runIds.map((runId) => {
                const previewRun = stretchPreview.wall.runs.find((run) => run.id === runId);
                return previewRun ? (
                  <RunGroup
                    key={runId}
                    run={previewRun}
                    room={stretchPreview.room}
                    wall={stretchPreview.wall}
                    settings={settings}
                    diagnostic={null}
                    transform={transform}
                    selectedRun={false}
                    selectedPieceId={null}
                    preview
                  />
                ) : null;
              })}
            </Layer>
          )}
          {dragPreview && (
            <Layer listening={false}>
              {dragPreview.soffit ? (
                <Rect
                  {...wallRectToScreen({
                    x: dragPreview.soffit.x,
                    z: dragPreview.soffit.bottomZ,
                    width: dragPreview.soffit.width,
                    height: wall.height - dragPreview.soffit.bottomZ,
                  }, transform)}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dash={[8, 6]}
                />
              ) : (
                <DragPreview
                  run={dragPreview.run}
                  valid={dragPreview.valid}
                  transform={transform}
                />
              )}
            </Layer>
          )}
        </Stage>
      )}
      {entry && (
        <LiveEntryInput
          entry={entry}
          position={entryPointer}
          containerRef={containerRef}
          containerSize={viewport}
          onTyped={setEntryTyped}
          onCycle={cycleEntry}
          onCommit={commitEntry}
          onCancel={cancelEntry}
        />
      )}
    </div>
  );
}

export default forwardRef(ElevationCanvas);
