import { Group, Line, Text } from 'react-konva';
import { formatInches } from '../model/units.js';
import { wallToScreen } from '../canvas/transform.js';

export default function DimensionLine({
  run,
  transform,
  color = '#94a3b8',
  topOffset = 4,
  onSelect,
}) {
  const z = run.z + run.height + topOffset;
  const start = wallToScreen({ x: run.x, z }, transform);
  const end = wallToScreen({ x: run.x + run.width, z }, transform);
  const labelWidth = 90;
  const centerX = (start.x + end.x) / 2;

  return (
    <Group
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
    >
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={color}
        strokeWidth={1}
        hitStrokeWidth={12}
      />
      <Line points={[start.x, start.y - 4, start.x, start.y + 4]} stroke={color} strokeWidth={1} />
      <Line points={[end.x, end.y - 4, end.x, end.y + 4]} stroke={color} strokeWidth={1} />
      <Text
        x={centerX - labelWidth / 2}
        y={start.y - 17}
        width={labelWidth}
        align="center"
        text={formatInches(run.width)}
        fill={color}
        fontSize={11}
      />
    </Group>
  );
}
