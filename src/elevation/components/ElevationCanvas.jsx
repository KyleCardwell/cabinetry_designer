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
import { wallToScreen } from '../canvas/transform.js';
import { snapToAlignment, runAlignmentTargets } from '../canvas/alignment.js';
import useLiveEntry, { resolveLiveEntryValue } from '../canvas/useLiveEntry.js';
import { useMeasure } from '../canvas/measureState.js';
import { elevationMeasureGeometry } from '../model/measure.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { elevationKey } from '../model/topology.js';
import {
  moveOpening,
  setMessage,
  setSelection,
  setActiveWall,
  setActiveWallSide,
} from '../store/elevationSlice.js';
import CombinedFaces from './CombinedFaces.jsx';
import CanvasContextMenu from './CanvasContextMenu.jsx';
import ElevationDimensions from './ElevationDimensions.jsx';
import ElevationPreviews from './ElevationPreviews.jsx';
import LiveEntryInput from './LiveEntryInput.jsx';
import MeasureOverlay from './MeasureOverlay.jsx';
import MeasureReadout from './MeasureReadout.jsx';
import TrackSizeInput from './TrackSizeInput.jsx';
import SelectionPicker from './SelectionPicker.jsx';
import PartNumberLayer from './PartNumberLayer.jsx';
import WallFrame from './WallFrame.jsx';
import WallContentLayer from './WallContentLayer.jsx';
import WallOverlayLayer from './WallOverlayLayer.jsx';
import useElevationKeys from './canvas/useElevationKeys.js';
import useRunStretch from './canvas/useRunStretch.js';
import useRunMove from './canvas/useRunMove.js';
import useCenterPick, { requestCenterPick } from './canvas/useCenterPick.js';
import CenterPickOverlay from './CenterPickOverlay.jsx';
import useJointDrag from './canvas/useJointDrag.js';
import useLineDrag from './canvas/useLineDrag.js';
import usePicker from './canvas/usePicker.js';
import useWallOverlays from './canvas/useWallOverlays.js';
import { useDimensionChains, useDimensionOffsets } from './canvas/useDimensionLayout.js';
import useCanvasView from './canvas/useCanvasView.js';
import useCanvasPan from './canvas/useCanvasPan.js';
import { runEdgeXForWidth, runWidthForEdgeX } from './canvas/runEdges.js';
import useDrawGestures from './canvas/useDrawGestures.js';
import useStageClick from './canvas/useStageClick.js';
import useInlineEdits from './canvas/useInlineEdits.js';
import useRunContextMenu from './canvas/useRunContextMenu.js';

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
      (entry?.kind === 'run-edge' || entry?.kind === 'run-move' || entry?.kind === 'line-move')
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

  const {
    trackEdit, setTrackEdit, dividerEdit, setDividerEdit, editTrack, editPieceSegment,
    commitTrackEdit, commitDividerEdit, moveDivider,
  } = useInlineEdits({
    room, wall, wallId, tool, doorsOff, selection, interiors, dispatch, closePicker, suppressNextClick,
  });

  // The wall row selects what's in it (SPEC-38.1): a recess full of cabinets can't be clicked otherwise.
  const selectFeature = useCallback((segment) => {
    if (tool !== 'select') return;
    if (segment.kind === 'recess') {
      dispatch(setSelection({ recessId: segment.recessId }));
    } else if (segment.kind === 'opening' && wallRef.current?.side !== 'back') {
      dispatch(setSelection({ openingId: segment.openingId }));
    }
  }, [dispatch, tool]);

  const selectOpening = useCallback((openingId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ openingId }));
  }, [dispatch, tool]);

  const selectLine = useCallback((lineId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ lineId }));
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

  const { contextMenu, closeContextMenu, handleContextMenu } = useRunContextMenu({
    room, wall, settings, tool, transform, dispatch, stageRef, doorsOff, measure, moving,
    cancelMove, centerPick, closePicker, cancelEntry, viewKey, activeKey, menuContext,
  });

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

  const { startLineDrag, updateLineDrag, finishLineDrag } = useLineDrag({
    beginEntry, cancelEntry, commitEntry, cursor, dispatch, entry, entryRef, entryValue,
    liveGestureRef, room, setEntryPointer, setStretchPreview, settings, stageRef, updateEntry, wall,
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
          <WallContentLayer
            wall={wall} transform={transform} selection={selection} tool={tool}
            pick={pick} settings={settings} selectOpening={selectOpening} selectLine={selectLine}
            moveSelectedOpening={moveSelectedOpening} cursor={cursor} room={room}
            soffitJoins={soffitJoins} activeKey={activeKey} diagnostics={diagnostics}
            facePath={facePath} pickFace={pickFace} doorsOff={doorsOff}
            showThrough={showThrough} interiors={interiors} drawerBoxes={drawerBoxes}
            adjustableShelves={adjustableShelves} rollouts={rollouts}
            accessories={accessories} interiorPath={interiorPath}
            interiorDivider={interiorDivider} pickInterior={pickInterior}
            setDividerEdit={setDividerEdit} moveDivider={moveDivider}
            editTrack={editTrack} startStretch={startStretch}
            updateStretch={updateStretch} finishStretch={finishStretch}
            startLineDrag={combined ? undefined : startLineDrag}
            updateLineDrag={combined ? undefined : updateLineDrag}
            finishLineDrag={combined ? undefined : finishLineDrag}
            startJointDrag={startJointDrag} previewJointDrag={previewJointDrag}
            finishJointDrag={finishJointDrag} unjoinRunSide={unjoinRunSide}
            hoveredGlyphId={hoveredGlyphId} setHoveredGlyphId={setHoveredGlyphId}
          />
          <WallOverlayLayer
            doorsOff={doorsOff} room={room} wall={wall} settings={settings}
            transform={transform} combinedFaces={combinedFaces} activeKey={activeKey}
            selection={selection} hovered={hovered} alignmentGuides={alignmentGuides}
            viewport={viewport}
          />
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
