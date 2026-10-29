import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Layer,
  Rect,
  Stage,
} from 'react-konva';
import {
  CURSORS,
  elevationBaseCursor,
  useCanvasCursor,
} from '../canvas/cursor.js';
import {
  screenToWall,
  wallToScreen,
} from '../canvas/transform.js';
import { snapToAlignment, runAlignmentTargets } from '../canvas/alignment.js';
import useLiveEntry, { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { useMeasure } from '../canvas/measureState.js';
import { elevationMeasureGeometry } from '../model/measure.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { elevationKey } from '../model/topology.js';
import { runItems } from '../model/grid.js';
import { defaultPick, pickStack } from '../model/pick.js';
import { setDividerPosition } from '../model/interiorTree.js';
import { openingGeometry } from '../model/openings.js';
import {
  moveOpening,
  setItemWidth,
  setItemInterior,
  setTrackSize,
  setMessage,
  setSelection,
  setTool,
  setActiveWall,
  setActiveWallSide,
} from '../store/elevationSlice.js';
import CombinedFaces from './CombinedFaces.jsx';
import CanvasContextMenu from './CanvasContextMenu.jsx';
import ElevationAlignmentGuides from './ElevationAlignmentGuides.jsx';
import ElevationDimensions from './ElevationDimensions.jsx';
import ElevationPreviews from './ElevationPreviews.jsx';
import JointMarkers from './JointMarkers.jsx';
import LiveEntryInput from './LiveEntryInput.jsx';
import MeasureOverlay from './MeasureOverlay.jsx';
import MeasureReadout from './MeasureReadout.jsx';
import TrackSizeInput from './TrackSizeInput.jsx';
import NeighborProfiles from './NeighborProfiles.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import OpeningShape from './OpeningShape.jsx';
import SelectionPicker, { PickOutline } from './SelectionPicker.jsx';
import PartNumberLayer from './PartNumberLayer.jsx';
import RunGroup from './RunGroup.jsx';
import SoffitShapes from './SoffitShapes.jsx';
import RecessShapes, { RecessOutline } from './RecessShapes.jsx';
import WallEndPanelShapes from './WallEndPanelShapes.jsx';
import WallFrame from './WallFrame.jsx';
import useElevationKeys from './canvas/useElevationKeys.js';
import useRunStretch from './canvas/useRunStretch.js';
import useRunMove from './canvas/useRunMove.js';
import useCenterPick, { requestCenterPick } from './canvas/useCenterPick.js';
import CenterPickOverlay from './CenterPickOverlay.jsx';
import useJointDrag from './canvas/useJointDrag.js';
import usePicker from './canvas/usePicker.js';
import useWallOverlays from './canvas/useWallOverlays.js';
import { useDimensionChains, useDimensionOffsets } from './canvas/useDimensionLayout.js';
import useCanvasView from './canvas/useCanvasView.js';
import useCanvasPan from './canvas/useCanvasPan.js';
import { runEdgeXForWidth, runWidthForEdgeX } from './canvas/runEdges.js';
import useDrawGestures from './canvas/useDrawGestures.js';
import useStageClick from './canvas/useStageClick.js';

const ALIGNMENT_SNAP_PX = 6;
const RUN_TYPE_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base',
  [CABINET_TYPE_IDS.UPPER]: 'Upper',
  [CABINET_TYPE_IDS.TALL]: 'Tall',
};

function ElevationCanvas({
  room,
  wall,
  settings,
  fitRequest = 0,
  onZoomChange,
}, ref) {
  const dispatch = useDispatch();
  const {
    tool, selection, facePath, doorsOff, interiorPath, interiorDivider,
  } = useSelector((state) => state.elevation);
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [stretchPreview, setStretchPreview] = useState(null);
  const [pointerMode, setPointerMode] = useState('idle');
  const [hoveredGlyphId, setHoveredGlyphId] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [entryPointer, setEntryPointer] = useState(null);
  const [trackEdit, setTrackEdit] = useState(null);
  const [dividerEdit, setDividerEdit] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
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
  const activeKey = elevationKey(wallId, wall?.side);
  const {
    combined,
    combinedFaces,
    soffitJoins,
    hiddenEdges,
    diagnostics,
    partNumbering,
    interiors,
    showThrough,
    previewShowThrough,
    drawerBoxes,
    adjustableShelves,
    rollouts,
    accessories,
    profile,
  } = useWallOverlays({ room, wall, settings, doorsOff, stretchPreview });
  const viewKey = combined?.id ?? activeKey;
  const menuContext = `${room?.id}:${viewKey}:${activeKey}:${tool}:${doorsOff}`;
  const { dimensionChains } = useDimensionChains({ room, wall, settings, selection });
  const {
    viewport, view, setView, resetView, transform, zoomIn, zoomOut, handleWheel,
  } = useCanvasView({ containerRef, stageRef, wall, combined, activeKey, dimensionChains });
  const { stopPanning, handlePanPointerDown } = useCanvasPan({
    dispatch,
    setView,
    setPointerMode,
    panRef,
    spacePressedRef,
    suppressClickRef,
    clickSuppressionTimeoutRef,
    stageRef,
    tool,
    entry,
    dragRef,
    stretchPreview,
  });

  selectionRef.current = selection;
  wallRef.current = wall;

  const updateDrag = useCallback((nextDrag) => {
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  }, []);

  const cancelDrag = useCallback(() => updateDrag(null), [updateDrag]);

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
    cancelEntry();
    cancelDrag();
    setStretchPreview(null);
    dispatch(setSelection({}));
  }, [activeKey, cancelDrag, cancelEntry, dispatch]);

  useEffect(() => {
    resetView();
  }, [fitRequest, resetView, viewKey]);

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

  const measureGeometry = useMemo(
    () => (tool === 'measure' && room && wall
      ? elevationMeasureGeometry(room, wall.sideSource ?? wall, wall.side ?? 'front', settings) : null),
    [tool, room, wall, settings],
  );
  const measure = useMeasure({
    active: tool === 'measure',
    geometry: measureGeometry,
    tolerance: transform ? 10 / transform.scale : 0,
    resetKey: `${room?.id}:${activeKey}`,
  });
  const measureToScreen = ({ x, y }) => wallToScreen({ x, z: y }, transform);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut }), [zoomIn, zoomOut]);

  useEffect(() => {
    onZoomChange?.(view.zoom);
  }, [onZoomChange, view.zoom]);

  const { dimensionOffsets } = useDimensionOffsets({ dimensionChains, room, settings, transform, wall });

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

  const { dragPreview, handleMouseDown, handleMouseMove, handleMouseUp } = useDrawGestures({
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
  });

  const {
    picker, hovered, pick, pickFace, pickInterior, choosePick, hoverPick, closePicker,
  } = usePicker({ room, wall, settings, transform, stageRef, tool, suppressClickRef, dispatch, doorsOff });

  // The wall row selects what's in it (SPEC-38.1): a recess full of cabinets can't be clicked otherwise.
  const selectFeature = useCallback((segment) => {
    if (tool !== 'select') return;
    if (segment.kind === 'recess') {
      dispatch(setSelection({ recessId: segment.recessId }));
    } else if (segment.kind === 'opening' && wallRef.current?.side !== 'back') {
      dispatch(setSelection({ openingId: segment.openingId }));
    }
  }, [dispatch, tool]);

  const editTrack = useCallback((runId, edit) => setTrackEdit({ ...edit, runId }), []);
  const editPieceSegment = useCallback((segment, point) => {
    // A cell of a column holding a void (FX3) edits its nested column track.
    if (segment.runId && segment.trackId) {
      setTrackEdit({
        runId: segment.runId, trackId: segment.trackId, label: 'Width', value: segment.end - segment.start, x: point.x, y: point.y,
      });
      return;
    }
    if (!segment.runId || !segment.pieceId
      || segment.pieceId.startsWith(`${segment.runId}:`)) return;
    setTrackEdit({
      runId: segment.runId,
      itemId: segment.pieceId,
      label: 'Width',
      value: segment.end - segment.start,
      x: point.x,
      y: point.y,
    });
  }, []);
  const commitTrackEdit = useCallback((size) => {
    if (trackEdit && wall) {
      dispatch(trackEdit.trackId
        ? setTrackSize({
          wallId: wall.id,
          runId: trackEdit.runId,
          trackId: trackEdit.trackId,
          size,
        })
        : setItemWidth({
          wallId: wall.id,
          runId: trackEdit.runId,
          itemId: trackEdit.itemId,
          width: size,
        }));
    }
    setTrackEdit(null);
  }, [dispatch, trackEdit, wall]);

  const commitDividerEdit = useCallback((edit, value) => {
    if (!wall || !room || tool !== 'select' || !doorsOff) return;
    const run = wall.runs.find((candidate) => candidate.id === edit.runId);
    const item = run && runItems(run).find((candidate) => candidate.id === edit.itemId);
    const entry = interiors.find((candidate) => candidate.runId === edit.runId && candidate.itemId === edit.itemId);
    if (!item || !entry) return;
    dispatch(setItemInterior({
      roomId: room.id,
      wallId: wall.id,
      runId: run.id,
      itemIds: [item.id],
      interior: setDividerPosition(entry.tree, edit.path, edit.index, value,
        edit.side === 'bottom' ? undefined : edit.side),
    }));
    setDividerEdit(null);
  }, [dispatch, doorsOff, interiors, room, tool, wall]);

  const moveDivider = useCallback((edit, value) => {
    suppressNextClick();
    closePicker();
    commitDividerEdit(edit, value);
  }, [closePicker, commitDividerEdit, suppressNextClick]);

  useEffect(() => {
    setDividerEdit(null);
  }, [doorsOff, room?.id, wallId, wall?.side, selection.runId, selection.pieceId, tool]);

  const selectOpening = useCallback((openingId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ openingId }));
  }, [dispatch, tool]);

  const moveSelectedOpening = useCallback((openingId, x) => {
    if (!wall) return;
    dispatch(moveOpening({ wallId: wall.id, openingId, x }));
  }, [dispatch, wall]);

  const { handleStageClick } = useStageClick({
    room,
    wall,
    settings,
    tool,
    transform,
    dispatch,
    stageRef,
    panRef,
    spacePressedRef,
    suppressClickRef,
    liveGestureRef,
    entry,
    updateEntry,
    commitEntry,
    measure,
    showMessage,
    messageTimeoutRef,
  });

  const {
    previewStretch,
    startStretch,
    updateStretch,
    finishStretch,
  } = useRunStretch({
    applyRunAlignment,
    beginEntry,
    cancelEntry,
    commitEntry,
    cursor,
    dispatch,
    entryRef,
    liveGestureRef,
    messageTimeoutRef,
    room,
    RUN_TYPE_LABELS,
    runEdgeXForWidth,
    runWidthForEdgeX,
    setAlignmentGuides,
    setEntryPointer,
    setStretchPreview,
    settings,
    showMessage,
    stageRef,
    updateEntry,
    wall,
  });

  const {
    applyRunMove,
    startMoveMode,
    moving,
    cancelMove,
  } = useRunMove({
    beginEntry,
    cancelEntry,
    cursor,
    dispatch,
    entryRef,
    liveGestureRef,
    moveOriginRef,
    room,
    setAlignmentGuides,
    setEntryPointer,
    setStretchPreview,
    settings,
    showMessage,
    stageRef,
    tool,
    transform,
    wall,
  });

  const centerPick = useCenterPick({
    room, wall, settings, transform, stageRef, tool, dispatch, showMessage, setStretchPreview,
  });
  const centerPickActive = centerPick.active;
  useEffect(() => {
    if (!centerPickActive) return undefined;
    cancelEntry();
    closePicker();
    cursor.hold(CURSORS.draw);
    return () => cursor.releaseHold();
  }, [cancelEntry, centerPickActive, closePicker, cursor]);

  useEffect(() => {
    if (moving || (contextMenu && contextMenu.context !== menuContext)) closeContextMenu();
  }, [closeContextMenu, contextMenu, menuContext, moving]);

  const handleContextMenu = useCallback((event) => {
    event.evt.preventDefault();
    closeContextMenu();
    closePicker();
    if (tool === 'measure') {
      measure.cancelFirst();
      return;
    }
    if (moving) {
      cancelMove();
      return;
    }
    if (centerPick.active) {
      centerPick.cancel();
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || !room || !wall || !transform) return;
    const candidates = pickStack(room, wall, settings, screenToWall(pointer, transform), { doorsOff });
    const runId = defaultPick(candidates)?.selection?.runId;
    if (!runId) return;
    cancelEntry();
    dispatch(setTool('select'));
    dispatch(setSelection({ runId }));
    setContextMenu({
      ...pointer,
      runId,
      context: `${room.id}:${viewKey}:${activeKey}:select:${doorsOff}`,
    });
  }, [activeKey, cancelEntry, cancelMove, centerPick, closeContextMenu, closePicker, dispatch, doorsOff,
    measure.cancelFirst, moving, room, settings, tool, transform, viewKey, wall]);

  const handleRunSegmentClick = useCallback((segment) => {
    if (tool === 'select' && segment.kind === 'run') {
      dispatch(setSelection({ runId: segment.runId, pieceId: null }));
    }
  }, [dispatch, tool]);

  useElevationKeys({
    onMeasureEscape: measure.escape,
    cancelDrag,
    cancelEntry,
    commitEntry,
    cursor,
    dispatch,
    dragRef,
    entry,
    facePath,
    resetView,
    room,
    selectionRef,
    setAlignmentGuides,
    setStretchPreview,
    startMoveMode,
    stretchPreview,
    tool,
    wallRef,
    zoomIn,
    zoomOut,
  });

  const {
    previewJointDrag,
    startJointDrag,
    finishJointDrag,
    unjoinRunSide,
  } = useJointDrag({
    applyRunMove,
    beginEntry,
    cancelEntry,
    commitEntry,
    cursor,
    dispatch,
    entry,
    entryRef,
    entryValue,
    liveGestureRef,
    previewStretch,
    room,
    RUN_TYPE_LABELS,
    runEdgeXForWidth,
    runWidthForEdgeX,
    selectionRef,
    setAlignmentGuides,
    setEntryPointer,
    setHoveredGlyphId,
    setStretchPreview,
    settings,
    showMessage,
    stageRef,
    updateEntry,
    wall,
  });

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
          onMouseLeave={measure.leave}
          onMouseUp={handleMouseUp}
          onPointerDown={handlePanPointerDown}
          onPointerCancel={stopPanning}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onContextMenu={handleContextMenu}
        >
          <Layer listening={false}>
            <Rect width={viewport.width} height={viewport.height} fill="#111827" />
            <WallFrame
              wall={wall}
              transform={transform}
              crownTop={profile?.crownTop}
              hiddenEdges={hiddenEdges.get(activeKey)}
            />
          </Layer>
          {combined && (
            <CombinedFaces
              room={room}
              combined={combined}
              faces={combinedFaces}
              activeKey={activeKey}
              doorsOff={doorsOff}
              settings={settings}
              diagnostics={diagnostics}
              transform={transform}
              soffitJoins={soffitJoins}
              hiddenEdges={hiddenEdges}
              onActivate={(face) => {
                if (suppressClickRef.current) return;
                dispatch(setActiveWall(face.wallId));
                dispatch(setActiveWallSide(face.side));
              }}
            />
          )}
          <Layer>
            <RecessShapes
              wall={wall}
              transform={transform}
              selectedRecessId={selection.recessId}
              onSelect={tool === 'select' ? pick : undefined}
            />
            {(wall.openings ?? []).map((opening) => (
              <OpeningShape
                key={opening.id}
                opening={opening}
                geometry={openingGeometry(opening, wall.length, settings)}
                settings={settings}
                transform={transform}
                selected={selection.openingId === opening.id}
                selectable={tool === 'select' && wall.side !== 'back'}
                onSelect={selectOpening}
                onPick={pick}
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
              onSelect={tool === 'select' ? pick : undefined}
              combinedJoins={soffitJoins.filter((join) => join.key === activeKey)}
            />
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
                onSelectRun={pick}
                onSelectPiece={pick}
                selectedFacePath={selection.runId === run.id ? facePath : null}
                onSelectFace={pickFace}
                doorsOff={doorsOff}
                showThrough={showThrough.filter((entry) => entry.runId === run.id)}
                interiors={interiors.filter((entry) => entry.runId === run.id)}
                drawerBoxes={drawerBoxes.filter((entry) => entry.runId === run.id)}
                adjustableShelves={adjustableShelves}
                rollouts={rollouts}
                accessories={accessories}
                interiorPath={interiorPath}
                interiorDivider={interiorDivider}
                onSelectInterior={pickInterior}
                onEditDivider={setDividerEdit}
                onMoveDivider={moveDivider}
                onEditTrack={editTrack}
                stretchable={tool === 'select'}
                onStretchStart={startStretch}
                onStretchMove={updateStretch}
                onStretchEnd={finishStretch}
                cursor={cursor}
              />
            ))}
            <WallEndPanelShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selectedEndpoint={selection.endPanel ?? null}
              onSelect={tool === 'select' ? pick : undefined}
              cursor={cursor}
            />
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
              doorsOff={doorsOff}
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              shapes={combinedFaces?.get(activeKey).shapes}
            />
            <NeighborProfiles
              doorsOff={doorsOff}
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              shapes={combinedFaces?.get(activeKey).shapes}
            />
            {selection.recessId && (
              <RecessOutline wall={wall} transform={transform} recessId={selection.recessId} />
            )}
            <PickOutline candidate={hovered} transform={transform} />
            <ElevationAlignmentGuides
              guides={alignmentGuides}
              transform={transform}
              width={viewport.width}
              height={viewport.height}
            />
          </Layer>
          <ElevationDimensions
            dimensionChains={dimensionChains}
            dimensionOffsets={dimensionOffsets}
            tool={tool}
            transform={transform}
            wall={wall}
            editPieceSegment={editPieceSegment}
            cursor={cursor}
            handleRunSegmentClick={handleRunSegmentClick}
            selection={selection}
            selectFeature={selectFeature}
            room={room}
          />
          <ElevationPreviews
            stretchPreview={stretchPreview}
            showThrough={previewShowThrough}
            settings={settings}
            transform={transform}
            dragPreview={dragPreview}
            wall={wall}
          />
          {partNumbering && (
            <Layer listening={false}>
              <PartNumberLayer
                room={room}
                wall={wall}
                settings={settings}
                partNumbers={partNumbering}
                transform={transform}
              />
            </Layer>
          )}
          <CenterPickOverlay
            width={viewport.width}
            height={viewport.height}
            transform={transform}
            run={centerPick.run}
            hovered={centerPick.hovered}
            onMove={centerPick.move}
            onLeave={centerPick.leave}
            onClick={centerPick.click}
          />
          {moving && (
            <Layer>
              <Rect width={viewport.width} height={viewport.height} fill="transparent" />
            </Layer>
          )}
          {tool === 'measure' && (
            <Layer>
              {/* Keep cabinet/combined-face handlers from swallowing measure and pan events. */}
              <Rect width={viewport.width} height={viewport.height} fill="transparent" />
            </Layer>
          )}
          {tool === 'measure' && (
            <Layer listening={false}>
              <MeasureOverlay first={measure.first} hover={measure.hover} measures={measure.measures}
                preview={measure.preview} toScreen={measureToScreen} transform={transform} />
            </Layer>
          )}
        </Stage>
      )}
      {tool === 'measure' && (
        <MeasureReadout result={measure.preview ?? measure.measures.at(-1)?.result}
          axisLabels={{ x: 'Across', y: 'Up' }} />
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
      {trackEdit && (
        <TrackSizeInput
          edit={trackEdit}
          onCommit={commitTrackEdit}
          onCancel={() => setTrackEdit(null)}
        />
      )}
      {dividerEdit && (
        <TrackSizeInput
          key={`${dividerEdit.runId}:${dividerEdit.itemId}:${dividerEdit.path}:${dividerEdit.index}`}
          edit={dividerEdit}
          onCommit={(value) => commitDividerEdit(dividerEdit, value)}
          onCancel={() => setDividerEdit(null)}
        />
      )}
      <SelectionPicker picker={picker} onChoose={choosePick} onHover={hoverPick} onClose={closePicker} />
      <SelectionPicker
        picker={centerPick.chooser}
        onChoose={centerPick.choose}
        onHover={centerPick.hoverChoice}
        onClose={centerPick.closeChooser}
      />
      <CanvasContextMenu
        position={contextMenu?.context === menuContext ? contextMenu : null}
        onClose={closeContextMenu}
        items={[
          { label: 'Move run', onSelect: () => startMoveMode(contextMenu.runId) },
          {
            label: 'Center over…',
            onSelect: () => requestCenterPick({
              room,
              wallId: wall.id,
              run: (wall.sideSource ?? wall).runs.find(({ id }) => id === contextMenu.runId),
              settings,
              dispatch,
              showMessage,
            }),
          },
        ]}
      />
    </div>
  );
}

export default forwardRef(ElevationCanvas);
