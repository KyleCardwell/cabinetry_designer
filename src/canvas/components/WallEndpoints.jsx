import { Circle } from 'react-konva';

/**
 * Draggable endpoint handles rendered at world coordinates.
 * Yellow fill indicates a connected endpoint.
 */
export default function WallEndpoints({ wall, scale, onDrag }) {
  const isConnectedStart = !!wall.connections?.start;
  const isConnectedEnd = !!wall.connections?.end;

  return (
    <>
      <Circle
        x={wall.x1}
        y={wall.y1}
        radius={3 / scale}
        fill={isConnectedStart ? '#facc15' : '#26ff00'}
        stroke="#ffffff"
        strokeWidth={0.5 / scale}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragMove={(e) => onDrag(wall.wall_id, 'start', e)}
        onDragEnd={(e) => onDrag(wall.wall_id, 'start', e)}
      />
      <Circle
        x={wall.x2}
        y={wall.y2}
        radius={3 / scale}
        fill={isConnectedEnd ? '#facc15' : '#ff0000'}
        stroke="#ffffff"
        strokeWidth={0.5 / scale}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onClick={(e) => {
          e.cancelBubble = true;
        }}
        onDragMove={(e) => onDrag(wall.wall_id, 'end', e)}
        onDragEnd={(e) => onDrag(wall.wall_id, 'end', e)}
      />
    </>
  );
}
