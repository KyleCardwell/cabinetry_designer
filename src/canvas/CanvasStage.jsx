import { useRef, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Group, Text } from 'react-konva';
import { useSelector, useDispatch } from 'react-redux';
import { addWall } from '../store/slices/wallSlice';
import { setWallDrawStart, clearSelection, select, setViewport } from '../store/slices/canvasSlice';
import { updateObject, snapObjectToWall } from '../store/slices/objectSlice';
import { snapToGrid, snapToWall, projectPointOntoWall } from './SnapEngine';

const PIXELS_PER_INCH = 4; // 1 inch = 4px at zoom 1

export default function CanvasStage() {
  const dispatch = useDispatch();
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  const { tool, zoom, panX, panY, wallDrawStart, snapEnabled, gridSize } = useSelector((state) => state.canvas);
  const walls = useSelector((state) => state.walls);
  const objects = useSelector((state) => state.objects);
  const room = useSelector((state) => state.room.current);

  const toWorld = useCallback((pos) => ({
    x: (pos.x - panX) / (zoom * PIXELS_PER_INCH),
    y: (pos.y - panY) / (zoom * PIXELS_PER_INCH),
  }), [zoom, panX, panY]);

  const toScreen = useCallback((pos) => ({
    x: pos.x * zoom * PIXELS_PER_INCH + panX,
    y: pos.y * zoom * PIXELS_PER_INCH + panY,
  }), [zoom, panX, panY]);

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
        dispatch(setWallDrawStart(world));
      } else {
        dispatch(addWall({
          roomId: room?.room_id,
          x1: wallDrawStart.x,
          y1: wallDrawStart.y,
          x2: world.x,
          y2: world.y,
        }));
        dispatch(setWallDrawStart(null));
      }
    } else if (tool === 'select') {
      // Clicking empty space clears selection
      if (e.target === stage) {
        dispatch(clearSelection());
      }
    }
  }, [dispatch, tool, wallDrawStart, room, toWorld, snapEnabled, gridSize]);

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const scaleBy = 1.08;
    const newZoom = e.evt.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
    dispatch(setViewport({ zoom: Math.max(0.1, Math.min(10, newZoom)) }));
  }, [dispatch, zoom]);

  const handleObjectDragEnd = useCallback((objectId, e) => {
    const world = toWorld({ x: e.target.x(), y: e.target.y() });

    // Try snap to nearest wall
    const wallList = walls.allIds.map((id) => walls.byId[id]);
    const snapResult = snapToWall(world, wallList, 12); // 12-inch snap radius

    if (snapResult) {
      dispatch(snapObjectToWall({
        object_id: objectId,
        wall_id: snapResult.wall_id,
        x: snapResult.x,
        y: snapResult.y,
        rotation: snapResult.rotation,
      }));
    } else {
      dispatch(updateObject({ object_id: objectId, x: world.x, y: world.y, wall_id: null }));
    }
  }, [dispatch, walls, toWorld]);

  const scale = zoom * PIXELS_PER_INCH;

  return (
    <div ref={containerRef} className="flex-1 bg-gray-950 cursor-crosshair">
      <Stage
        ref={stageRef}
        width={window.innerWidth - 520}
        height={window.innerHeight - 48}
        onClick={handleStageClick}
        onWheel={handleWheel}
        draggable={tool === 'select'}
        onDragEnd={(e) => {
          dispatch(setViewport({ panX: e.target.x(), panY: e.target.y() }));
        }}
      >
        <Layer offsetX={-panX / scale} offsetY={-panY / scale} scaleX={scale} scaleY={scale}>
          {/* Grid (simplified) */}
          {/* Walls */}
          {walls.allIds.map((id) => {
            const w = walls.byId[id];
            return (
              <Line
                key={id}
                points={[w.x1, w.y1, w.x2, w.y2]}
                stroke="#6b7280"
                strokeWidth={w.thickness / PIXELS_PER_INCH}
                hitStrokeWidth={8 / scale}
                onClick={(e) => {
                  e.cancelBubble = true;
                  dispatch(select({ ids: [id], type: 'wall' }));
                }}
              />
            );
          })}

          {/* Wall draw preview */}
          {tool === 'wall' && wallDrawStart && (
            <Line
              points={[wallDrawStart.x, wallDrawStart.y, wallDrawStart.x, wallDrawStart.y]}
              stroke="#3b82f6"
              strokeWidth={1 / scale}
              dash={[4 / scale, 4 / scale]}
              listening={false}
            />
          )}

          {/* Placed objects */}
          {objects.allIds.map((id) => {
            const obj = objects.byId[id];
            const w = obj.width ?? 24;
            const d = obj.depth ?? 24;
            return (
              <Group
                key={id}
                x={obj.x}
                y={obj.y}
                rotation={obj.rotation}
                draggable={tool === 'select'}
                onDragEnd={(e) => handleObjectDragEnd(id, e)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  dispatch(select({ ids: [id], type: 'object' }));
                }}
              >
                <Rect
                  width={w}
                  height={d}
                  offsetX={w / 2}
                  offsetY={d}
                  fill="#1e3a5f"
                  stroke="#60a5fa"
                  strokeWidth={0.5}
                />
                <Text
                  text={obj.object_type?.replace('_', '\n') ?? ''}
                  x={-w / 2}
                  y={-d}
                  width={w}
                  height={d}
                  align="center"
                  verticalAlign="middle"
                  fontSize={3}
                  fill="#94a3b8"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
