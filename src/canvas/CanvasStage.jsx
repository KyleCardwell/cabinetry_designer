import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer } from 'react-konva';
import { useSelector, useDispatch } from 'react-redux';
import { addWall, moveWallEndpoint, connectWalls, disconnectWallEndpoint, removeWall } from '../store/slices/wallSlice';
import { setWallDrawStart, clearSelection, select, setViewport } from '../store/slices/canvasSlice';
import { updateObject, removeObject, removeObjectsByWall } from '../store/slices/objectSlice';
import { snapToGrid, snapToEndpoint } from './SnapEngine';
import AxisGuides from './components/AxisGuides';
import WallGroup from './components/WallGroup';
import WallEndpoints from './components/WallEndpoints';
import WallDrawPreview from './components/WallDrawPreview';

const PIXELS_PER_INCH = 4; // 1 inch = 4px at zoom 1

export default function CanvasStage() {
  const dispatch = useDispatch();
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const hasCenteredViewportRef = useRef(false);

  const {
    tool,
    zoom,
    panX,
    panY,
    wallDrawStart,
    snapEnabled,
    gridSize,
    selectedIds,
    selectionType,
  } = useSelector((state) => state.canvas);
  const walls = useSelector((state) => state.walls);
  const objects = useSelector((state) => state.objects);
  const room = useSelector((state) => state.room.current);

  const [mouseWorldPos, setMouseWorldPos] = useState(null);
  const stageWidth = window.innerWidth - 520;
  const stageHeight = window.innerHeight - 48;

  const scale = zoom * PIXELS_PER_INCH;

  const toWorld = useCallback((pos) => ({
    x: (pos.x - panX) / (zoom * PIXELS_PER_INCH),
    y: (pos.y - panY) / (zoom * PIXELS_PER_INCH),
  }), [zoom, panX, panY]);

  // Group objects by their wall_id for efficient lookup
  const objectsByWall = useMemo(() => {
    const map = {};
    for (const id of objects.allIds) {
      const obj = objects.byId[id];
      if (!obj.wall_id) continue;
      if (!map[obj.wall_id]) map[obj.wall_id] = [];
      map[obj.wall_id].push(obj);
    }
    // Sort each wall's objects by x position for consistent rendering
    for (const wallId of Object.keys(map)) {
      map[wallId].sort((a, b) => a.x - b.x);
    }
    return map;
  }, [objects]);

  // Keyboard shortcuts: Escape cancels wall drawing, Delete/Backspace deletes selection
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ignore if user is typing in an input/textarea
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'Escape' && wallDrawStart) {
        dispatch(setWallDrawStart(null));
        setMouseWorldPos(null);
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        if (selectionType === 'wall') {
          for (const id of selectedIds) {
            dispatch(removeObjectsByWall(id));
            dispatch(removeWall(id));
          }
        } else if (selectionType === 'object') {
          for (const id of selectedIds) {
            dispatch(removeObject(id));
          }
        }
        dispatch(clearSelection());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, wallDrawStart, selectedIds, selectionType]);

  // Center viewport on first load
  useEffect(() => {
    if (hasCenteredViewportRef.current) return;

    if (panX !== 0 || panY !== 0) {
      hasCenteredViewportRef.current = true;
      return;
    }

    dispatch(setViewport({
      panX: stageWidth / 2,
      panY: stageHeight / 2,
    }));
    hasCenteredViewportRef.current = true;
  }, [dispatch, panX, panY, stageWidth, stageHeight]);

  // Helper: get all walls as an array
  const wallList = useMemo(
    () => walls.allIds.map((id) => walls.byId[id]),
    [walls],
  );

  const handleStageClick = useCallback((e) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    let world = toWorld(pointerPos);

    if (snapEnabled) {
      world = snapToGrid(world, gridSize);
    }

    if (tool === 'wall') {
      if (!wallDrawStart) {
        // Snap start point to existing endpoint if close
        const epSnap = snapToEndpoint(world, wallList, 6);
        if (epSnap) {
          dispatch(setWallDrawStart({ x: epSnap.x, y: epSnap.y, _connectTo: { wallId: epSnap.wallId, endpoint: epSnap.endpoint } }));
        } else {
          dispatch(setWallDrawStart(world));
        }
      } else {
        // Snap end point to existing endpoint if close
        const epSnap = snapToEndpoint(world, wallList, 6);
        const endPt = epSnap ? { x: epSnap.x, y: epSnap.y } : world;

        const connectStart = wallDrawStart._connectTo || null;
        const connectEnd = epSnap ? { wallId: epSnap.wallId, endpoint: epSnap.endpoint } : null;

        dispatch(addWall({
          roomId: room?.room_id,
          x1: wallDrawStart.x,
          y1: wallDrawStart.y,
          x2: endPt.x,
          y2: endPt.y,
          connectStart,
          connectEnd,
        }));
        dispatch(setWallDrawStart(null));
        setMouseWorldPos(null);
      }
    } else if (tool === 'select') {
      // Clicking empty space clears selection
      if (e.target === stage) {
        dispatch(clearSelection());
      }
    }
  }, [dispatch, tool, wallDrawStart, room, toWorld, snapEnabled, gridSize, wallList]);

  const handleMouseMove = useCallback(() => {
    if (tool !== 'wall' || !wallDrawStart) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    let world = toWorld(pointerPos);
    if (snapEnabled) {
      world = snapToGrid(world, gridSize);
    }
    // Snap preview to endpoints
    const epSnap = snapToEndpoint(world, wallList, 6);
    setMouseWorldPos(epSnap ? { x: epSnap.x, y: epSnap.y } : world);
  }, [tool, wallDrawStart, toWorld, snapEnabled, gridSize, wallList]);

  // Endpoint drag: use moveWallEndpoint (propagates to connected walls).
  // Respects wall locks: locked length preserves distance, locked angle preserves direction.
  // Also auto-connect/disconnect on dragEnd based on proximity.
  const handleWallEndpointDrag = useCallback((wallId, endpoint, e) => {
    let world = { x: e.target.x(), y: e.target.y() };

    if (snapEnabled) {
      world = snapToGrid(world, gridSize);
    }

    // On drag move, snap preview to nearby endpoints
    const epSnap = snapToEndpoint(world, wallList, 6, wallId);
    let pos = epSnap ? { x: epSnap.x, y: epSnap.y } : world;

    // Apply lock constraints
    const wall = walls.byId[wallId];
    if (wall) {
      const locks = wall.locks ?? {};
      // Anchor is the opposite endpoint
      const ax = endpoint === 'start' ? wall.x2 : wall.x1;
      const ay = endpoint === 'start' ? wall.y2 : wall.y1;
      const dxNew = pos.x - ax;
      const dyNew = pos.y - ay;
      const origDx = wall.x2 - wall.x1;
      const origDy = wall.y2 - wall.y1;
      const origLen = Math.hypot(origDx, origDy);
      const origAngle = Math.atan2(origDy, origDx);

      if (locks.length && locks.angle) {
        // Both locked — don't move at all
        pos = { x: endpoint === 'start' ? wall.x1 : wall.x2, y: endpoint === 'start' ? wall.y1 : wall.y2 };
      } else if (locks.angle && origLen > 0) {
        // Keep angle, project new position onto the original direction
        const dir = endpoint === 'start' ? -1 : 1;
        const projLen = (dxNew * Math.cos(origAngle) + dyNew * Math.sin(origAngle)) * dir;
        pos = {
          x: ax + Math.cos(origAngle) * projLen * dir,
          y: ay + Math.sin(origAngle) * projLen * dir,
        };
      } else if (locks.length && origLen > 0) {
        // Keep length, allow free angle change
        const newLen = Math.hypot(dxNew, dyNew);
        if (newLen > 0) {
          const scale = origLen / newLen;
          pos = { x: ax + dxNew * scale, y: ay + dyNew * scale };
        }
      }
    }

    dispatch(moveWallEndpoint({ wall_id: wallId, endpoint, x: pos.x, y: pos.y }));

    // On drag end, auto-connect or disconnect
    if (e.type === 'dragend') {
      const currentConn = wall?.connections?.[endpoint];

      if (epSnap) {
        // Connect to nearby endpoint
        dispatch(connectWalls({
          wallId1: wallId,
          endpoint1: endpoint,
          wallId2: epSnap.wallId,
          endpoint2: epSnap.endpoint,
        }));
      } else if (currentConn) {
        // Dragged away from connected endpoint — disconnect
        dispatch(disconnectWallEndpoint({ wall_id: wallId, endpoint }));
      }
    }
  }, [dispatch, snapEnabled, gridSize, wallList, walls]);

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    let direction = e.evt.deltaY < 0 ? 1 : -1;
    if (e.evt.ctrlKey) {
      direction = -direction;
    }

    const scaleBy = 1.04;
    const proposedZoom = direction > 0 ? zoom * scaleBy : zoom / scaleBy;
    const nextZoom = Math.max(0.1, Math.min(10, proposedZoom));
    if (nextZoom === zoom) return;

    const oldScale = zoom * PIXELS_PER_INCH;
    const nextScale = nextZoom * PIXELS_PER_INCH;
    const worldUnderPointer = {
      x: (pointer.x - panX) / oldScale,
      y: (pointer.y - panY) / oldScale,
    };

    dispatch(setViewport({
      zoom: nextZoom,
      panX: pointer.x - worldUnderPointer.x * nextScale,
      panY: pointer.y - worldUnderPointer.y * nextScale,
    }));
  }, [dispatch, zoom, panX, panY]);

  // Accumulate Stage drag delta into Redux pan, then reset Stage position.
  const handleStageDragEnd = useCallback((e) => {
    if (e.target !== stageRef.current) return;
    const stage = e.target;
    const dx = stage.x();
    const dy = stage.y();
    stage.position({ x: 0, y: 0 });
    dispatch(setViewport({
      panX: panX + dx,
      panY: panY + dy,
    }));
  }, [dispatch, panX, panY]);

  // Object drag within a WallGroup.
  // e.target.x() is the new local x position along the wall.
  // Clamp to [0, wallLength - objWidth] so objects stay on the wall.
  const handleObjectDragEnd = useCallback((objectId, wallId, wallLen, e) => {
    const localX = e.target.x();
    const obj = objects.byId[objectId];
    const objWidth = obj?.width ?? 24;

    // Clamp to wall bounds
    const clampedX = Math.max(0, Math.min(wallLen - objWidth, localX));

    dispatch(updateObject({
      object_id: objectId,
      x: clampedX,
    }));

    // Reset Konva node position to clamped value (in case it overshot)
    e.target.x(clampedX);
    e.target.y(-(obj?.y ?? 0));
  }, [dispatch, objects]);

  const handleWallSelect = useCallback((wallId, e) => {
    if (tool !== 'select') return;
    e.cancelBubble = true;
    dispatch(select({ ids: [wallId], type: 'wall' }));
  }, [dispatch, tool]);

  const handleObjectSelect = useCallback((objectId, e) => {
    if (tool !== 'select') return;
    e.cancelBubble = true;
    dispatch(select({ ids: [objectId], type: 'object' }));
  }, [dispatch, tool]);

  const selectedWallId = selectionType === 'wall' && selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedWall = selectedWallId ? walls.byId[selectedWallId] : null;

  return (
    <div ref={containerRef} className="flex-1 bg-gray-950">
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        draggable={tool === 'select'}
        onDragEnd={handleStageDragEnd}
      >
        <Layer offsetX={-panX / scale} offsetY={-panY / scale} scaleX={scale} scaleY={scale}>
          <AxisGuides scale={scale} />

          {/* Wall groups (each wall + its assigned objects) */}
          {walls.allIds.map((id) => (
            <WallGroup
              key={id}
              wall={walls.byId[id]}
              wallObjects={objectsByWall[id] || []}
              isSelected={selectionType === 'wall' && selectedIds.includes(id)}
              scale={scale}
              tool={tool}
              onWallSelect={(e) => handleWallSelect(id, e)}
              onObjectDragEnd={handleObjectDragEnd}
              onObjectSelect={handleObjectSelect}
            />
          ))}

          {/* Endpoint handles (world coords) for selected wall */}
          {tool === 'select' && selectedWall && (
            <WallEndpoints
              wall={selectedWall}
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
    </div>
  );
}
