import { Circle, Group, Line, Text } from 'react-konva';
import { wallFrame } from '../model/geometry.js';
import { wallNumbers } from '../model/topology.js';
import { formatInches } from '../model/units.js';
import { wallOutline } from '../model/wallOutline.js';

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

  const outline = wallOutline(room, wall);
  const exterior = { x: -frame.n.x, y: -frame.n.y };
  const midpoint = {
    x: (wall.x1 + wall.x2) / 2,
    y: (wall.y1 + wall.y2) / 2,
  };
  const tickLength = 8 / scale;
  const labelOffset = 14 / scale;
  const fontSize = 11 / scale;
  const number = wallNumbers(room).get(wall.id);
  const numberRadius = 9 / scale;
  const numberOffset = wall.thickness + 12 / scale;
  const numberPoint = {
    x: midpoint.x + exterior.x * numberOffset,
    y: midpoint.y + exterior.y * numberOffset,
  };
  let labelRotation = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI;
  if (labelRotation > 90 || labelRotation < -90) labelRotation += 180;

  return (
    <Group onClick={onSelect} onDblClick={onOpen}>
      <Line
        points={outline.flatMap((point) => [point.x, point.y])}
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
      <Circle
        x={numberPoint.x}
        y={numberPoint.y}
        radius={numberRadius}
        fill="#111827"
        stroke={isSelected ? '#93c5fd' : '#cbd5e1'}
        strokeWidth={1 / scale}
        listening={false}
      />
      <Text
        x={numberPoint.x - numberRadius}
        y={numberPoint.y - numberRadius}
        width={numberRadius * 2}
        height={numberRadius * 2}
        text={String(number ?? '')}
        align="center"
        verticalAlign="middle"
        fontSize={10 / scale}
        fill="#f8fafc"
        listening={false}
      />
    </Group>
  );
}
