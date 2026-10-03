import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Stage } from 'react-konva';
import { snapToEndpoint, snapToGrid } from '../../canvas/SnapEngine.js';
import AxisGuides from '../../canvas/components/AxisGuides.jsx';
import {
  endpointAlignmentTargets,
  snapToAlignment,
} from '../canvas/alignment.js';
import {
  planBaseCursor,
  useCanvasCursor,
  useCursorKeys,
} from '../canvas/cursor.js';
import { panExceedsThreshold } from '../canvas/panGesture.js';
import useLiveEntry, {
  resolveLiveEntryValue,
} from '../canvas/useLiveEntry.js';
import LiveEntryInput from '../components/LiveEntryInput.jsx';
import { planClearances } from '../model/clearances.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { findCollisions, footprintsAtPoint } from '../model/footprints.js';
import {
  dot,
  planPointToWallX,
  subtract,
  wallFrame,
} from '../model/geometry.js';
import { snapToWallFace } from '../model/landings.js';
import {
  createOpening,
  openingsAtPoint,
  validateOpeningPlacement,
} from '../model/openings.js';
import { wallLabel } from '../model/topology.js';
import { formatInches, roundTo } from '../model/units.js';
import { wallSideFrame, wallSideOf, wallSideView } from '../model/wallSides.js';
import {
  addOpening,
  addWallSegment,
  clearSelection,
  deleteWall,
  moveOpening,
  setActiveWall,
  setMessage,
  setSelection,
  setTool,
  setView,
} from '../store/elevationSlice.js';
import { PLAN_BACKGROUND_COLOR } from './constants.js';
import PlanAlignmentGuides from './PlanAlignmentGuides.jsx';
import PlanOverlays from './PlanOverlays.jsx';
import PlanScene from './PlanScene.jsx';
import usePlanKeys from './usePlanKeys.js';
import usePlanWallEdits from './usePlanWallEdits.js';
import { snapPointOrtho } from './wallOps.js';

const PIXELS_PER_INCH = 4;
const ENDPOINT_SNAP_RADIUS = 6;
const ALIGNMENT_SNAP_PX = 6;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function signedInches(value) {
  if (Math.abs(value) < 1e-9) return formatInches(0);
  return `${value > 0 ? '+' : '−'}${formatInches(Math.abs(value))}`;
}

export default function PlanCanvas({ fitRequest = 0 }) {
  const dispatch = useDispatch();
  const {
    rooms,
    activeRoomId,
    settings,
    tool,
    selection,
  } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const walls = room?.walls ?? [];
  // The active wall is only selected in plan when nothing on it is (SPEC-37.4): a selected run,
  // opening, soffit or wall end panel isn't its wall.
  const wallItselfSelected = !selection.runId && !selection.openingId && !selection.soffitId
    && !selection.endPanel && !selection.recessId;
  const selectedWall = wallItselfSelected
    ? walls.find((wall) => wall.id === selection.wallId) ?? null
    : null;
  const adaptedWalls = useMemo(
    () => walls.map((wall) => ({ ...wall, wall_id: wall.id })),
    [walls],
  );
  const collisionMessages = useMemo(() => {
    const messages = new Map();
    if (!room) return messages;
    const runWalls = new Map(room.walls.flatMap((wall) => (
      wall.runs.map((run) => [run.id, wall])
    )));
    for (const collision of findCollisions(room, settings)) {
      const otherWall = runWalls.get(collision.otherRunId);
      if (otherWall && !messages.has(collision.runId)) {
        messages.set(
          collision.runId,
          `Overlaps ${wallLabel(room, otherWall)} run — anchor both runs to the corner`,
        );
      }
    }
    return messages;
  }, [room, settings]);
  const clearances = useMemo(
    () => (room ? planClearances(room, settings) : []),
    [room, settings],
  );
  const orderedFootprints = useMemo(() => {
    if (!room) return [];
    const entries = walls.flatMap((wall) => (
      wall.runs.map((run) => ({
        frame: wallSideFrame(room, wall, wallSideOf(run)),
        wall,
        run,
      }))
    ));
    return [
      ...entries.filter(({ run }) => run.cabinetTypeId !== CABINET_TYPE_IDS.UPPER),
      ...entries.filter(({ run }) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER),
    ];
  }, [room, walls]);
  const orderedOpenings = useMemo(() => {
    if (!room) return [];
    return walls.flatMap((wall) => {
      const frame = wallFrame(room, wall);
      return (wall.openings ?? []).map((opening) => ({ frame, wall, opening }));
    });
  }, [room, walls]);
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const drawStartRef = useRef(null);
  const liveGestureRef = useRef(null);
  const panRef = useRef(null);
  const spacePressedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const clickSuppressionTimeoutRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const fittedRoomRef = useRef(null);
  const handledFitRequestRef = useRef(fitRequest);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pointerMode, setPointerMode] = useState('idle');
  const [wallDrawStart, setWallDrawStart] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [mouseWorldPos, setMouseWorldPos] = useState(null);
  const [pendingDeleteWallId, setPendingDeleteWallId] = useState(null);
  const [wallMovePreview, setWallMovePreview] = useState(null);
  const [entryPointer, setEntryPointer] = useState(null);
  const { style: cursorStyle, controller: cursor } = useCanvasCursor(
    planBaseCursor(tool, pointerMode),
  );
  const moveHandleCursor = useCursorKeys(cursor);
  const {
    entry,
    begin: beginEntry,
    update: updateEntry,
    setTyped: setEntryTyped,
    commit: commitEntry,
    cancel: cancelEntry,
  } = useLiveEntry();
  const scale = zoom * PIXELS_PER_INCH;
  const entryValue = resolveLiveEntryValue(entry);
  const moveHandle = useMemo(() => {
    if (!room || !selectedWall) return null;
    const frame = wallFrame(room, selectedWall);
    const midpoint = {
      x: (selectedWall.x1 + selectedWall.x2) / 2,
      y: (selectedWall.y1 + selectedWall.y2) / 2,
    };
    return {
      frame,
      midpoint,
      point: {
        x: midpoint.x - frame.n.x * (selectedWall.thickness + 38 / scale),
        y: midpoint.y - frame.n.y * (selectedWall.thickness + 38 / scale),
      },
    };
  }, [room, scale, selectedWall]);

  drawStartRef.current = wallDrawStart;

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

    updateSize(container.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updateSize(entries[0].contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const zoomToFit = useCallback(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (walls.length === 0) {
      setZoom(1);
      setPan({ x: viewport.width / 2, y: viewport.height / 2 });
      return;
    }

    const xs = walls.flatMap((wall) => [wall.x1, wall.x2]);
    const ys = walls.flatMap((wall) => [wall.y1, wall.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 96;
    const availableWidth = Math.max(1, viewport.width - padding);
    const availableHeight = Math.max(1, viewport.height - padding);
    const fitScale = Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY),
    );
    const nextZoom = clampZoom(fitScale / PIXELS_PER_INCH);
    const nextScale = nextZoom * PIXELS_PER_INCH;
    setZoom(nextZoom);
    setPan({
      x: viewport.width / 2 - ((minX + maxX) / 2) * nextScale,
      y: viewport.height / 2 - ((minY + maxY) / 2) * nextScale,
    });
  }, [viewport, walls]);

  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (fittedRoomRef.current !== activeRoomId) {
      fittedRoomRef.current = activeRoomId;
      zoomToFit();
    }
  }, [activeRoomId, viewport, zoomToFit]);

  useEffect(() => {
    if (fitRequest === handledFitRequestRef.current) return;
    handledFitRequestRef.current = fitRequest;
    zoomToFit();
  }, [fitRequest, zoomToFit]);

  const cancelDrawing = useCallback(() => {
    setWallDrawStart(null);
    setMouseWorldPos(null);
    setAlignmentGuides([]);
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

  useEffect(() => {
    if (tool !== 'wall') cancelDrawing();
  }, [cancelDrawing, tool]);

  useEffect(() => {
    if (entry?.kind === 'wall-draw' && (tool !== 'wall' || !settings.orthoWalls)) {
      cancelEntry();
    } else if (
      (entry?.kind === 'wall-perpendicular' || entry?.kind === 'wall-length')
      && tool !== 'select'
    ) {
      cancelEntry();
    }
  }, [cancelEntry, entry?.kind, settings.orthoWalls, tool]);

  useEffect(() => {
    setWallMovePreview(null);
  }, [activeRoomId, selection.wallId, tool]);

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
      setPan((activePan) => ({ x: activePan.x + dx, y: activePan.y + dy }));
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

  usePlanKeys({
    entry,
    cancelEntry,
    drawStartRef,
    cancelDrawing,
    dispatch,
    setPendingDeleteWallId,
    selection,
    walls,
    selectedWall,
  });

  const toWorld = useCallback((point) => ({
    x: (point.x - pan.x) / scale,
    y: (point.y - pan.y) / scale,
  }), [pan, scale]);

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

  const handleStageClick = useCallback((event) => {
    if (suppressClickRef.current) return;
    if (event.target !== event.target.getStage()) return;
    if (entry) {
      commitEntry();
      return;
    }
    if (tool === 'select') {
      dispatch(clearSelection());
      return;
    }
    if (tool !== 'wall') return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const fixed = wallDrawStart ? { x: wallDrawStart.x, y: wallDrawStart.y } : null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed);
    const { point, connect, land, faceLabel } = snapDrawPoint(snapped, fixed);

    if (!wallDrawStart) {
      setEntryPointer(pointer);
      setWallDrawStart({
        ...point,
        _connectTo: connect,
        _landOn: land,
      });
      setMouseWorldPos({ ...point, _faceLabel: faceLabel });
      return;
    }

    if (point.x === wallDrawStart.x && point.y === wallDrawStart.y) return;
    const action = addWallSegment({
      x1: wallDrawStart.x,
      y1: wallDrawStart.y,
      x2: point.x,
      y2: point.y,
      connectStart: wallDrawStart._connectTo,
      connectEnd: connect,
      landStart: wallDrawStart._connectTo ? null : wallDrawStart._landOn,
      landEnd: land,
    });
    dispatch(action);
    setAlignmentGuides([]);
    setWallDrawStart({
      ...point,
      _connectTo: { wallId: action.payload.id, endpoint: 'end' },
      _landOn: null,
    });
    setMouseWorldPos(null);
  }, [
    commitEntry,
    dispatch,
    entry,
    gridAndOrtho,
    snapDrawPoint,
    toWorld,
    tool,
    wallDrawStart,
  ]);

  const handleMouseMove = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    if (entry) {
      setEntryPointer(pointer);
      if (entry.kind === 'wall-perpendicular' && moveHandle) {
        const delta = dot(
          subtract(toWorld(pointer), moveHandle.point),
          moveHandle.frame.n,
        );
        updateEntry(roundTo(delta, settings.planGrid));
      } else if (entry.kind === 'wall-draw' && wallDrawStart) {
        const snapped = gridAndOrtho(toWorld(pointer), wallDrawStart);
        const { point, connect, land, faceLabel } = snapDrawPoint(
          snapped,
          wallDrawStart,
        );
        const dx = point.x - wallDrawStart.x;
        const dy = point.y - wallDrawStart.y;
        const length = Math.hypot(dx, dy);
        liveGestureRef.current = {
          kind: 'wall-draw',
          direction: length > 0 ? { x: dx / length, y: dy / length } : null,
          connectEnd: connect,
          landEnd: land,
          pointerLength: length,
        };
        setMouseWorldPos({ ...point, _faceLabel: faceLabel });
        updateEntry(length);
      } else if (entry.kind === 'wall-length') {
        const gesture = liveGestureRef.current;
        if (gesture?.kind === 'wall-length') {
          const delta = dot(
            subtract(toWorld(pointer), gesture.pointerStart),
            gesture.aOut,
          );
          updateEntry(roundTo(
            gesture.initialLength + delta,
            settings.planGrid,
          ));
        }
      }
      return;
    }
    if (tool !== 'wall' || panRef.current) return;
    const fixed = wallDrawStart ?? null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed);
    const { point, faceLabel } = snapDrawPoint(snapped, fixed);
    setMouseWorldPos({ ...point, _faceLabel: faceLabel });
  }, [
    entry,
    gridAndOrtho,
    moveHandle,
    settings.planGrid,
    snapDrawPoint,
    toWorld,
    tool,
    updateEntry,
    wallDrawStart,
  ]);

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

  const {
    handleWallEndpointDrag,
    beginWallMove,
    beginWallLength,
  } = usePlanWallEdits({
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
  });

  const handleWheel = useCallback((event) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    let direction = event.evt.deltaY < 0 ? 1 : -1;
    if (event.evt.ctrlKey) direction = -direction;
    const nextZoom = clampZoom(direction > 0 ? zoom * 1.04 : zoom / 1.04);
    if (nextZoom === zoom) return;
    const worldUnderPointer = toWorld(pointer);
    const nextScale = nextZoom * PIXELS_PER_INCH;
    setZoom(nextZoom);
    setPan({
      x: pointer.x - worldUnderPointer.x * nextScale,
      y: pointer.y - worldUnderPointer.y * nextScale,
    });
  }, [toWorld, zoom]);

  const handlePanPointerDown = useCallback((event) => {
    const pointerEvent = event.evt;
    const emptyCanvas = event.target === stageRef.current;
    const middleDrag = pointerEvent.button === 1;
    const spaceDrag = pointerEvent.button === 0 && spacePressedRef.current;
    const selectDrag = pointerEvent.button === 0 && tool === 'select';
    if (entry || !emptyCanvas || (!middleDrag && !spaceDrag && !selectDrag)) return;
    pointerEvent.preventDefault();
    panRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originY: pointerEvent.clientY,
      moved: false,
    };
  }, [entry, tool]);

  const placeOpeningOnWall = useCallback((wallId, event) => {
    if ((tool !== 'door' && tool !== 'window') || !room) return false;
    const pointer = stageRef.current?.getPointerPosition();
    const targetWall = walls.find((wall) => wall.id === wallId);
    if (!pointer || !targetWall) return false;
    event.cancelBubble = true;
    const frame = wallFrame(room, targetWall);
    const x = planPointToWallX(frame, toWorld(pointer));
    const opening = createOpening(
      { kind: tool, x },
      { settings, room, wall: targetWall },
    );
    const validation = validateOpeningPlacement(
      { ...targetWall, length: frame.length },
      opening,
      settings,
    );
    if (!validation.ok) {
      showMessage(validation.reason);
      return true;
    }
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(setActiveWall(targetWall.id));
    dispatch(addOpening({ wallId: targetWall.id, opening }));
    dispatch(setTool('select'));
    dispatch(setSelection({ openingId: opening.id }));
    return true;
  }, [dispatch, room, settings, showMessage, toWorld, tool, walls]);

  const handleWallSelect = useCallback((wallId, event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (placeOpeningOnWall(wallId, event)) return;
    if (tool !== 'select') return;
    event.cancelBubble = true;
    dispatch(setActiveWall(wallId));
  }, [dispatch, entry, placeOpeningOnWall, tool]);

  const handleWallOpen = useCallback((wallId, event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select') return;
    event.cancelBubble = true;
    dispatch(setActiveWall(wallId));
    dispatch(setView('elevation'));
  }, [dispatch, entry, tool]);

  const handleRunSelect = useCallback((event) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select' || !room) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const runIds = footprintsAtPoint(room, toWorld(pointer), settings);
    if (runIds.length === 0) return;
    const runId = selection.runId === runIds[0]
      ? runIds[1] ?? runIds[0]
      : runIds[0];
    const wall = walls.find((candidate) => (
      candidate.runs.some((run) => run.id === runId)
    ));
    if (!wall) return;
    dispatch(setActiveWall(wall.id));
    dispatch(setSelection({ runId, pieceId: null }));
  }, [dispatch, entry, room, selection.runId, settings, toWorld, tool, walls]);

  const handleOpeningSelect = useCallback((event, targetOpeningId) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select' || !room) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const openingIds = openingsAtPoint(room, toWorld(pointer), settings);
    if (openingIds.length === 0) return;
    const openingId = openingIds.includes(targetOpeningId)
      ? targetOpeningId
      : openingIds[0];
    const openingWall = walls.find((wall) => (
      (wall.openings ?? []).some((opening) => opening.id === openingId)
    ));
    if (!openingWall) return;
    event.cancelBubble = true;
    dispatch(setActiveWall(openingWall.id));
    dispatch(setSelection({ openingId }));
  }, [dispatch, entry, room, settings, toWorld, tool, walls]);

  const handleOpeningMove = useCallback((wallId, openingId, x) => {
    dispatch(moveOpening({ wallId, openingId, x }));
  }, [dispatch]);

  const drawGesture = liveGestureRef.current;
  const showsMoveHandle = Boolean(
    tool === 'select' && selectedWall && moveHandle && !entry,
  );
  useEffect(() => {
    if (!showsMoveHandle) moveHandleCursor.release('move');
  }, [moveHandleCursor, showsMoveHandle]);
  const liveWallDrawEnd = entry?.kind === 'wall-draw'
    && wallDrawStart
    && drawGesture?.kind === 'wall-draw'
    && drawGesture.direction
    ? {
        x: wallDrawStart.x + drawGesture.direction.x * entryValue,
        y: wallDrawStart.y + drawGesture.direction.y * entryValue,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ backgroundColor: PLAN_BACKGROUND_COLOR, cursor: cursorStyle }}
    >
      {viewport.width > 0 && viewport.height > 0 && (
        <Stage
          ref={stageRef}
          width={viewport.width}
          height={viewport.height}
          onClick={handleStageClick}
          onDblClick={entry ? cancelEntry : cancelDrawing}
          onMouseMove={handleMouseMove}
          onPointerDown={handlePanPointerDown}
          onPointerCancel={stopPanning}
          onWheel={handleWheel}
        >
          <Layer
            offsetX={-pan.x / scale}
            offsetY={-pan.y / scale}
            scaleX={scale}
            scaleY={scale}
          >
            <AxisGuides scale={scale} />
            <PlanAlignmentGuides guides={alignmentGuides} scale={scale} />
            <PlanScene
              walls={walls}
              room={room}
              selectedWall={selectedWall}
              scale={scale}
              handleWallSelect={handleWallSelect}
              handleWallOpen={handleWallOpen}
              cursor={cursor}
              settings={settings}
              selection={selection}
              orderedOpenings={orderedOpenings}
              tool={tool}
              entry={entry}
              handleOpeningSelect={handleOpeningSelect}
              handleOpeningMove={handleOpeningMove}
              orderedFootprints={orderedFootprints}
              collisionMessages={collisionMessages}
              handleRunSelect={handleRunSelect}
              clearances={clearances}
            />
            <PlanOverlays
              room={room}
              settings={settings}
              scale={scale}
              wallMovePreview={wallMovePreview}
              selectedWall={selectedWall}
              signedInches={signedInches}
              tool={tool}
              entry={entry}
              handleWallEndpointDrag={handleWallEndpointDrag}
              beginWallLength={beginWallLength}
              cursor={cursor}
              showsMoveHandle={showsMoveHandle}
              moveHandle={moveHandle}
              moveHandleCursor={moveHandleCursor}
              beginWallMove={beginWallMove}
              wallDrawStart={wallDrawStart}
              liveWallDrawEnd={liveWallDrawEnd}
              mouseWorldPos={mouseWorldPos}
            />
          </Layer>
        </Stage>
      )}

      {entry && (
        <LiveEntryInput
          entry={entry}
          position={entryPointer}
          containerRef={containerRef}
          containerSize={viewport}
          onTyped={setEntryTyped}
          onCommit={commitEntry}
          onCancel={cancelEntry}
        />
      )}

      {pendingDeleteWallId && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-red-800 bg-red-950/95 p-3 text-sm shadow-xl">
          <p className="mb-2 text-red-100">Delete this wall and its runs?</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDeleteWallId(null)}
              className="rounded bg-gray-700 px-2.5 py-1 text-gray-100 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch(deleteWall(pendingDeleteWallId));
                setPendingDeleteWallId(null);
              }}
              className="rounded bg-red-700 px-2.5 py-1 text-white hover:bg-red-600"
            >
              Delete wall
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
