import { Group, Rect, Line } from 'react-konva';
import PlacedObject from './PlacedObject';

/**
 * Renders a wall as a Konva Group positioned at (x1,y1) and rotated to
 * the wall angle.  All child objects inherit this transform, so their
 * local x = distance along the wall from the start point.
 *
 * Endpoint handles are rendered separately (at world coordinates) to keep
 * drag math simple — see WallEndpoints.
 */
export default function WallGroup({
  wall,
  wallObjects,
  isSelected,
  scale,
  tool,
  onWallSelect,
  onObjectDragEnd,
  onObjectSelect,
}) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const wallAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const thickness = wall.thickness;

  return (
    <Group
      x={wall.x1}
      y={wall.y1}
      rotation={wallAngleDeg}
    >
      {/* Wall body — drawn upward from the wall line (negative y in local space) */}
      <Rect
        x={0}
        y={-thickness}
        width={len}
        height={thickness}
        fill={isSelected ? '#60a5fa' : '#6b7280'}
        opacity={0.85}
        hitStrokeWidth={8 / scale}
        onClick={(e) => {
          if (tool !== 'select') return;
          e.cancelBubble = true;
          onWallSelect(e);
        }}
      />
      {/* Center line along the wall */}
      <Line
        points={[0, 0, len, 0]}
        stroke={isSelected ? '#bfdbfe' : '#d1d5db'}
        strokeWidth={1 / scale}
        listening={false}
      />

      {/* Objects placed on this wall */}
      {wallObjects.map((obj) => (
        <PlacedObject
          key={obj.object_id}
          obj={obj}
          draggable={tool === 'select'}
          wallLength={len}
          onDragEnd={(e) => onObjectDragEnd(obj.object_id, wall.wall_id, len, e)}
          onSelect={(e) => {
            if (tool !== 'select') return;
            e.cancelBubble = true;
            onObjectSelect(obj.object_id, e);
          }}
        />
      ))}
    </Group>
  );
}
