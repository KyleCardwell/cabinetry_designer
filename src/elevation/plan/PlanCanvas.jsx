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
import AxisGuides from '../../canvas/components/AxisGuides.jsx';
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
import { wallFrame } from '../model/geometry.js';
import { planMeasureGeometry } from '../model/measure.js';
import { formatInches } from '../model/units.js';
import {
  deleteWall,
  setMessage,
} from '../store/elevationSlice.js';
import { ENDPOINT_SNAP_RADIUS, PLAN_BACKGROUND_COLOR } from './constants.js';
import PlanAlignmentGuides from './PlanAlignmentGuides.jsx';
import PlanOverlays from './PlanOverlays.jsx';
import PlanScene from './PlanScene.jsx';
import usePlanContextMenu from './usePlanContextMenu.js';
import usePlanKeys from './usePlanKeys.js';
import usePlanPan from './usePlanPan.js';
import usePlanPicker from './usePlanPicker.js';
import usePlanRunMove from './usePlanRunMove.js';
import usePlanSceneData from './usePlanSceneData.js';
import usePlanSelectHandlers from './usePlanSelectHandlers.js';
import usePlanStageGestures from './usePlanStageGestures.js';
import usePlanWallDraw from './usePlanWallDraw.js';
import usePlanWallEdits from './usePlanWallEdits.js';
import usePlanView from './usePlanView.js';


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

  const { gridAndOrtho, applyAlignment, snapDrawPoint } = usePlanWallDraw({
    room, walls, adaptedWalls, settings, tool, entry, scale, dispatch, beginEntry,
    cancelDrawing, liveGestureRef, wallDrawStart, setWallDrawStart, setMouseWorldPos,
    setAlignmentGuides,
  });
  const { handleStageClick, handleMouseMove } = usePlanStageGestures({
    settings, tool, entry, dispatch, stageRef, panRef, spacePressedRef,
    suppressClickRef, liveGestureRef, toWorld, measure, closeContextMenu,
    commitEntry, updateEntry, updateMovePointer, pickAt, moveHandle, gridAndOrtho,
    snapDrawPoint, wallDrawStart, setWallDrawStart, setMouseWorldPos,
    setAlignmentGuides, setEntryPointer,
  });

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

  const {
    handleWallSelect,
    handleWallOpen,
    handleRunSelect,
    handleOpeningSelect,
    handleOpeningMove,
  } = usePlanSelectHandlers({
    room, walls, settings, tool, entry, dispatch, stageRef, toWorld, pickAt,
    closePicker, showMessage, messageTimeoutRef,
  });

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
