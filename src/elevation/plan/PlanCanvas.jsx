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
import WallDrawPreview from '../../canvas/components/WallDrawPreview.jsx';
import WallEndpoints from '../../canvas/components/WallEndpoints.jsx';
import { findCollisions } from '../model/footprints.js';
import { wallFrame } from '../model/geometry.js';
import { wallLabel } from '../model/topology.js';
import {
  addWallSegment,
  connectWalls,
  deleteWall,
  disconnectWallEndpoint,
  moveWallEndpoint,
  setActiveWall,
  setSelection,
  setTool,
  setView,
} from '../store/elevationSlice.js';
import PlanWallShape from './PlanWallShape.jsx';
import PlanRunFootprint from './PlanRunFootprint.jsx';
import { snapPointOrtho } from './wallOps.js';

const PIXELS_PER_INCH = 4;
const ENDPOINT_SNAP_RADIUS = 6;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export default function PlanCanvas({ fitRequest = 0 }) {
  const dispatch = useDispatch();
  const {
    rooms,
    activeRoomId,
    activeWallId,
    settings,
    tool,
    selection,
  } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const walls = room?.walls ?? [];
  const selectedWall = walls.find((wall) => wall.id === activeWallId) ?? null;
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
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const drawStartRef = useRef(null);
  const fittedRoomRef = useRef(null);
  const handledFitRequestRef = useRef(fitRequest);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wallDrawStart, setWallDrawStart] = useState(null);
  const [mouseWorldPos, setMouseWorldPos] = useState(null);
  const [pendingDeleteWallId, setPendingDeleteWallId] = useState(null);
  const scale = zoom * PIXELS_PER_INCH;

  drawStartRef.current = wallDrawStart;

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
  }, []);

  useEffect(() => {
    if (tool !== 'wall') cancelDrawing();
  }, [cancelDrawing, tool]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;

      if (event.key === 'Escape') {
        if (drawStartRef.current) cancelDrawing();
        dispatch(setTool('select'));
        setPendingDeleteWallId(null);
        return;
      }

      if ((event.key !== 'Delete' && event.key !== 'Backspace') || !selectedWall) return;
      event.preventDefault();
      if (selectedWall.runs.length > 0) {
        setPendingDeleteWallId(selectedWall.id);
      } else {
        dispatch(deleteWall(selectedWall.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDrawing, dispatch, selectedWall]);

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

  const handleStageClick = useCallback(() => {
    if (tool !== 'wall') return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const fixed = wallDrawStart ? { x: wallDrawStart.x, y: wallDrawStart.y } : null;
    const snapped = gridAndOrtho(toWorld(pointer), fixed);
    const endpointSnap = snapToEndpoint(snapped, adaptedWalls, ENDPOINT_SNAP_RADIUS);
    const point = endpointSnap
      ? { x: endpointSnap.x, y: endpointSnap.y }
      : snapped;

    if (!wallDrawStart) {
      setWallDrawStart({
        ...point,
        _connectTo: endpointSnap
          ? { wallId: endpointSnap.wallId, endpoint: endpointSnap.endpoint }
          : null,
      });
      return;
    }

    if (point.x === wallDrawStart.x && point.y === wallDrawStart.y) return;
    const action = addWallSegment({
      x1: wallDrawStart.x,
      y1: wallDrawStart.y,
      x2: point.x,
      y2: point.y,
      connectStart: wallDrawStart._connectTo,
      connectEnd: endpointSnap
        ? { wallId: endpointSnap.wallId, endpoint: endpointSnap.endpoint }
        : null,
    });
    dispatch(action);
    setWallDrawStart({
      ...point,
      _connectTo: { wallId: action.payload.id, endpoint: 'end' },
    });
    setMouseWorldPos(null);
  }, [adaptedWalls, dispatch, gridAndOrtho, toWorld, tool, wallDrawStart]);

  const handleMouseMove = useCallback(() => {
    if (tool !== 'wall' || !wallDrawStart) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const snapped = gridAndOrtho(toWorld(pointer), wallDrawStart);
    const endpointSnap = snapToEndpoint(snapped, adaptedWalls, ENDPOINT_SNAP_RADIUS);
    setMouseWorldPos(endpointSnap
      ? { x: endpointSnap.x, y: endpointSnap.y }
      : snapped);
  }, [adaptedWalls, gridAndOrtho, toWorld, tool, wallDrawStart]);

  const handleWallEndpointDrag = useCallback((wallId, endpoint, event) => {
    const wall = walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    const fixed = endpoint === 'start'
      ? { x: wall.x2, y: wall.y2 }
      : { x: wall.x1, y: wall.y1 };
    const snapped = gridAndOrtho(
      { x: event.target.x(), y: event.target.y() },
      fixed,
    );
    const endpointSnap = snapToEndpoint(
      snapped,
      adaptedWalls,
      ENDPOINT_SNAP_RADIUS,
      wallId,
    );
    const point = endpointSnap
      ? { x: endpointSnap.x, y: endpointSnap.y }
      : snapped;
    event.target.position(point);
    dispatch(moveWallEndpoint({ wallId, endpoint, ...point }));

    if (event.type !== 'dragend') return;
    if (endpointSnap) {
      dispatch(connectWalls({
        wallId1: wallId,
        endpoint1: endpoint,
        wallId2: endpointSnap.wallId,
        endpoint2: endpointSnap.endpoint,
      }));
    } else if (wall.connections?.[endpoint]) {
      dispatch(disconnectWallEndpoint({ wallId, endpoint }));
    }
  }, [adaptedWalls, dispatch, gridAndOrtho, walls]);

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

  const handleStageDragEnd = useCallback((event) => {
    if (event.target !== stageRef.current) return;
    const stage = event.target;
    setPan((current) => ({ x: current.x + stage.x(), y: current.y + stage.y() }));
    stage.position({ x: 0, y: 0 });
  }, []);

  const handleWallSelect = useCallback((wallId, event) => {
    if (tool !== 'select') return;
    event.cancelBubble = true;
    dispatch(setActiveWall(wallId));
  }, [dispatch, tool]);

  const handleWallOpen = useCallback((wallId, event) => {
    if (tool !== 'select') return;
    event.cancelBubble = true;
    dispatch(setActiveWall(wallId));
    dispatch(setView('elevation'));
  }, [dispatch, tool]);

  const handleRunSelect = useCallback((wallId, runId) => {
    if (tool !== 'select') return;
    dispatch(setActiveWall(wallId));
    dispatch(setSelection({ runId, pieceId: null }));
  }, [dispatch, tool]);

  return (
    <div ref={containerRef} className="relative h-full min-h-0 overflow-hidden bg-gray-950">
      {viewport.width > 0 && viewport.height > 0 && (
        <Stage
          ref={stageRef}
          width={viewport.width}
          height={viewport.height}
          onClick={handleStageClick}
          onDblClick={cancelDrawing}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          draggable={tool === 'select'}
          onDragEnd={handleStageDragEnd}
        >
          <Layer
            offsetX={-pan.x / scale}
            offsetY={-pan.y / scale}
            scaleX={scale}
            scaleY={scale}
          >
            <AxisGuides scale={scale} />
            {walls.map((wall) => (
              <PlanWallShape
                key={wall.id}
                room={room}
                wall={wall}
                isSelected={wall.id === activeWallId}
                scale={scale}
                onSelect={(event) => handleWallSelect(wall.id, event)}
                onOpen={(event) => handleWallOpen(wall.id, event)}
              />
            ))}
            {walls.flatMap((wall) => {
              const frame = wallFrame(room, wall);
              return wall.runs.map((run) => (
                <PlanRunFootprint
                  key={run.id}
                  frame={frame}
                  room={room}
                  wall={wall}
                  run={run}
                  settings={settings}
                  collision={collisionMessages.has(run.id)}
                  collisionMessage={collisionMessages.get(run.id)}
                  selected={selection.runId === run.id}
                  selectable={tool === 'select'}
                  scale={scale}
                  onSelect={() => handleRunSelect(wall.id, run.id)}
                />
              ));
            })}
            {tool === 'select' && selectedWall && (
              <WallEndpoints
                wall={{ ...selectedWall, wall_id: selectedWall.id }}
                scale={scale}
                onDrag={handleWallEndpointDrag}
              />
            )}
            <WallDrawPreview
              start={tool === 'wall' ? wallDrawStart : null}
              end={mouseWorldPos}
              scale={scale}
            />
          </Layer>
        </Stage>
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
