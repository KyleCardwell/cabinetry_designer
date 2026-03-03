import { Group, Rect, Line } from 'react-konva';

export default function WallShape({ wall, isSelected, scale, onSelect }) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const wallLength = Math.hypot(dx, dy);
  if (wallLength === 0) return null;

  const wallAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const wallThickness = wall.thickness;

  return (
    <Group onClick={onSelect}>
      <Rect
        x={wall.x1}
        y={wall.y1}
        width={wallLength}
        height={wallThickness}
        offsetY={wallThickness}
        rotation={wallAngleDeg}
        fill={isSelected ? '#60a5fa' : '#6b7280'}
        opacity={0.85}
        hitStrokeWidth={8 / scale}
      />
      <Line
        points={[wall.x1, wall.y1, wall.x2, wall.y2]}
        stroke={isSelected ? '#bfdbfe' : '#d1d5db'}
        strokeWidth={1 / scale}
        listening={false}
      />
    </Group>
  );
}
