import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSettings } from '../store/selectors.js';
import { Layer, Rect, Stage } from 'react-konva';
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
import { textScales } from '../canvas/textScale.js';
import { useMeasure } from '../canvas/measureState.js';
import useLiveEntry, {
  resolveLiveEntryValue,
} from '../canvas/useLiveEntry.js';
import LiveEntryInput from '../components/LiveEntryInput.jsx';
import CanvasContextMenu from '../components/CanvasContextMenu.jsx';
import SelectionPicker, { PlanPickOutline } from '../components/SelectionPicker.jsx';
import MeasureOverlay from '../components/MeasureOverlay.jsx';
import MeasureReadout from '../components/MeasureReadout.jsx';
import {
  dot,
  planPointToWallX,
  subtract,
  wallFrame,
} from '../model/geometry.js';
import { snapToWallFace } from '../model/landings.js';
import { planMeasureGeometry } from '../model/measure.js';
import {
  createOpening,
  openingsAtPoint,
  validateOpeningPlacement,
} from '../model/openings.js';
import { formatInches, roundTo } from '../model/units.js';
import { wallSideView } from '../model/wallSides.js';
import {
  addOpening,
  addWallSegment,
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
import usePlanContextMenu from './usePlanContextMenu.js';
import usePlanKeys from './usePlanKeys.js';
import usePlanPan from './usePlanPan.js';
import usePlanPicker from './usePlanPicker.js';
import usePlanRunMove from './usePlanRunMove.js';
import usePlanSceneData from './usePlanSceneData.js';
import usePlanWallEdits from './usePlanWallEdits.js';
import usePlanView from './usePlanView.js';
import { snapPointOrtho } from './wallOps.js';

const ENDPOINT_SNAP_RADIUS = 6;
const ALIGNMENT_SNAP_PX = 6;

function signedInches(value) {
  if (Math.abs(value) < 1e-9) return formatInches(0);
  return `${value > 0 ? '+' : '−'}${formatInches(Math.abs(value))}`;
}

export default function PlanCanvas({ fitRequest = 0 }) {
  const dispatch = useDispatch();
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    view,
    tool,
    selection,
  } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const walls = room?.walls ?? [];
  // The active wall is only selected in plan when nothing on it is (SPEC-37.4): a selected run,
  // opening, soffit or wall end panel isn't its wall.
  const wallItselfSelected = !selection.runId && !selection.openingId && !selection.soffitId
    && !selection.endPanel && !selection.recessId;
  const selectedWall = wallItselfSelected
    ? walls.find((wall) => wall.id === selection.wallId) ?? null
    : null;
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const drawStartRef = useRef(null);
  const liveGestureRef = useRef(null);
  const panRef = useRef(null);
  const spacePressedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const clickSuppressionTimeoutRef = useRef(null);
  const messageTimeoutRef = useRef(null);
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
  const { viewport, zoom, fitZoom, pan, setPan, scale, toWorld, handleWheel } = usePlanView({
    containerRef, stageRef, walls, activeRoomId, fitRequest,
  });
  const text = textScales(zoom / fitZoom);
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

  const { stopPanning, handlePanPointerDown } = usePlanPan({
    setPan, setPointerMode, panRef, spacePressedRef, suppressClickRef,
    clickSuppressionTimeoutRef, stageRef, tool, entry,
  });

  const measureGeometry = useMemo(
    () => (tool === 'measure' && room ? planMeasureGeometry(room, settings) : null),
    [tool, room, settings],
  );
  const measure = useMeasure({
    active: tool === 'measure',
    geometry: measureGeometry,
    tolerance: 10 / scale,
    resetKey: room?.id,
  });
  const measureToScreen = ({ x, y }) => ({ x: x * scale + pan.x, y: y * scale + pan.y });

  const { picker, hovered, pick, choosePick, hoverPick, closePicker } = usePlanPicker({
    room, settings, scale, tool, entry, dispatch,
  });
  const pickAt = useCallback((event) => {
    event.cancelBubble = true;
    if (suppressClickRef.current) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (pointer) pick(pointer, toWorld(pointer));
  }, [pick, toWorld]);

  const { previewRoom, moving, startMoveMode, cancelMove, updateMovePointer } = usePlanRunMove({
    room, settings, tool, view, activeWallId, activeWallSide,
    entry, beginEntry, cancelEntry, updateEntry, cursor, dispatch,
    stageRef, toWorld, setEntryPointer, showMessage,
  });
  const sceneRoom = previewRoom ?? room;
  const { adaptedWalls, orderedOpenings, collisionMessages, clearances, orderedFootprints } = usePlanSceneData({
    room, walls, sceneRoom, settings,
  });
  const { contextMenu, closeContextMenu, handleContextMenu } = usePlanContextMenu({
    room, walls, settings, tool, view, activeRoomId, activeWallId, activeWallSide,
    dispatch, stageRef, toWorld, measure, moving, cancelMove, closePicker, cancelEntry,
  });

  usePlanKeys({
    entry, cancelEntry, commitEntry, startMoveMode, tool,
    onMeasureEscape: measure.escape,
    drawStartRef, cancelDrawing, dispatch, setPendingDeleteWallId,
    selection, walls, selectedWall,
  });

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
    if (tool === 'measure') {
      const pointer = stageRef.current?.getPointerPosition();
      if (event.evt?.button === 0 && pointer && !panRef.current && !spacePressedRef.current) {
        measure.click(toWorld(pointer), event.evt.shiftKey);
      }
      return;
    }
    if (event.evt?.button && event.evt.button !== 0) return;
    closeContextMenu();
    if (entry?.kind === 'run-move') {
      commitEntry();
      return;
    }
    if (event.target !== event.target.getStage()) return;
    if (entry) {
      commitEntry();
      return;
    }
    if (tool === 'select') {
      pickAt(event);
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
    closeContextMenu,
    commitEntry,
    dispatch,
    entry,
    gridAndOrtho,
    measure.click,
    pickAt,
    snapDrawPoint,
    toWorld,
    tool,
    wallDrawStart,
  ]);

  const handleMouseMove = useCallback((event) => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    if (tool === 'measure') {
      if (!panRef.current && !spacePressedRef.current) {
        measure.move(toWorld(pointer), event.evt?.shiftKey);
      }
      return;
    }
    if (entry) {
      setEntryPointer(pointer);
      if (entry.kind === 'run-move') {
        updateMovePointer(pointer);
      } else if (entry.kind === 'wall-perpendicular' && moveHandle) {
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
    measure.move,
    moveHandle,
    settings.planGrid,
    snapDrawPoint,
    toWorld,
    tool,
    updateEntry,
    updateMovePointer,
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
    pickAt(event);
  }, [entry, pickAt, placeOpeningOnWall, tool]);

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
    if (tool !== 'select') return;
    pickAt(event);
  }, [entry, pickAt, tool]);

  const handleOpeningSelect = useCallback((event, targetOpeningId) => {
    if (entry) {
      event.cancelBubble = true;
      return;
    }
    if (tool !== 'select' || !room) return;
    if (event.type !== 'dragstart') {
      pickAt(event);
      return;
    }
    closePicker();
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
  }, [closePicker, dispatch, entry, pickAt, room, settings, toWorld, tool, walls]);

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
          onMouseLeave={measure.leave}
          onPointerDown={handlePanPointerDown}
          onPointerCancel={stopPanning}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
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
              room={sceneRoom}
              selectedWall={selectedWall}
              scale={scale}
              text={text}
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
              handleRunContextMenu={handleContextMenu}
              clearances={clearances}
            />
            <PlanOverlays
              room={room}
              settings={settings}
              scale={scale}
              text={text}
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
            <PlanPickOutline candidate={hovered} scale={scale} />
          </Layer>
          {moving && (
            <Layer>
              <Rect width={viewport.width} height={viewport.height} fill="transparent" />
            </Layer>
          )}
          {tool === 'measure' && (
            <Layer>
              <Rect width={viewport.width} height={viewport.height} fill="transparent" />
            </Layer>
          )}
          {tool === 'measure' && (
            <Layer listening={false}>
              <MeasureOverlay first={measure.first} hover={measure.hover} measures={measure.measures}
                preview={measure.preview} toScreen={measureToScreen} />
            </Layer>
          )}
        </Stage>
      )}

      {tool === 'measure' && (
        <MeasureReadout result={measure.preview ?? measure.measures.at(-1)?.result}
          axisLabels={{ x: 'X', y: 'Y' }} />
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

      <SelectionPicker
        picker={picker}
        onChoose={choosePick}
        onHover={hoverPick}
        onClose={closePicker}
      />

      <CanvasContextMenu
        position={contextMenu}
        onClose={closeContextMenu}
        items={[{ label: 'Move run', onSelect: () => startMoveMode(contextMenu?.runId) }]}
      />

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
