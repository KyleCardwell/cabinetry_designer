import { Group, Line, Text } from 'react-konva';
import { wallFrame } from '../model/geometry.js';
import { formatInches } from '../model/units.js';

export default function PlanWallShape({
  room,
  wall,
  isSelected,
  scale,
  onSelect,
  onOpen,
}) {
  const frame = wallFrame(room, wall);
  if (frame.length === 0) return null;

  const exterior = { x: -frame.n.x, y: -frame.n.y };
  const exteriorStart = {
    x: wall.x1 + exterior.x * wall.thickness,
    y: wall.y1 + exterior.y * wall.thickness,
  };
  const exteriorEnd = {
    x: wall.x2 + exterior.x * wall.thickness,
    y: wall.y2 + exterior.y * wall.thickness,
  };
  const midpoint = {
    x: (wall.x1 + wall.x2) / 2,
    y: (wall.y1 + wall.y2) / 2,
  };
  const tickLength = 8 / scale;
  const labelOffset = 14 / scale;
  const fontSize = 11 / scale;
  let labelRotation = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI;
  if (labelRotation > 90 || labelRotation < -90) labelRotation += 180;

  return (
    <Group onClick={onSelect} onDblClick={onOpen}>
      <Line
        points={[
          wall.x1,
          wall.y1,
          wall.x2,
          wall.y2,
          exteriorEnd.x,
          exteriorEnd.y,
          exteriorStart.x,
          exteriorStart.y,
        ]}
        closed
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
      <Line
        points={[
          midpoint.x,
          midpoint.y,
          midpoint.x + frame.n.x * tickLength,
          midpoint.y + frame.n.y * tickLength,
        ]}
        stroke="#22d3ee"
        strokeWidth={1.5 / scale}
        listening={false}
      />
      <Text
        x={midpoint.x + frame.n.x * labelOffset}
        y={midpoint.y + frame.n.y * labelOffset}
        width={100 / scale}
        offsetX={50 / scale}
        offsetY={fontSize / 2}
        rotation={labelRotation}
        align="center"
        text={formatInches(frame.length)}
        fontSize={fontSize}
        fill="#e2e8f0"
        listening={false}
      />
    </Group>
  );
}
