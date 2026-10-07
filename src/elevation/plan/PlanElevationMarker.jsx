import { Circle, Group, Line, Text } from 'react-konva';
import { MARKER_FLAG_LENGTH, MARKER_RADIUS } from './elevationMarkers.js';

/** A circled letter with a small triangular flag pointing back at the wall. */
export default function PlanElevationMarker({ point, direction, scale, letter }) {
  const radius = MARKER_RADIUS / scale;
  const flagLength = MARKER_FLAG_LENGTH / scale;
  const flagHalfWidth = radius * 0.6;
  const perp = { x: -direction.y, y: direction.x };
  const flagBase = {
    x: point.x - direction.x * radius,
    y: point.y - direction.y * radius,
  };
  const flagTip = {
    x: flagBase.x - direction.x * flagLength,
    y: flagBase.y - direction.y * flagLength,
  };

  return (
    <Group listening={false}>
      <Line
        points={[
          flagBase.x + perp.x * flagHalfWidth, flagBase.y + perp.y * flagHalfWidth,
          flagTip.x, flagTip.y,
          flagBase.x - perp.x * flagHalfWidth, flagBase.y - perp.y * flagHalfWidth,
        ]}
        closed
        fill="#f59e0b"
      />
      <Circle x={point.x} y={point.y} radius={radius} fill="#111827" stroke="#f59e0b" strokeWidth={1.5 / scale} />
      <Text
        x={point.x - radius}
        y={point.y - radius}
        width={radius * 2}
        height={radius * 2}
        text={letter}
        align="center"
        verticalAlign="middle"
        fontSize={15 / scale}
        fill="#fde68a"
      />
    </Group>
  );
}
