import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { uncoveredSpans } from '../model/recesses.js';
import { formatInches } from '../model/units.js';

/** `hiddenEdges` ({ left, right } lists of { bottom, top }) leaves those side spans undrawn (Kyle 2026-10-23). */
export default function WallFrame({
  wall, transform, crownTop, hiddenEdges,
}) {
  const wallRect = wallRectToScreen({
    x: 0,
    z: 0,
    width: wall.length,
    height: wall.height,
  }, transform);
  const floorStart = wallToScreen({ x: 0, z: 0 }, transform);
  const floorEnd = wallToScreen({ x: wall.length, z: 0 }, transform);
  const crownStart = Number.isFinite(crownTop)
    ? wallToScreen({ x: 0, z: crownTop }, transform)
    : null;
  const crownEnd = Number.isFinite(crownTop)
    ? wallToScreen({ x: wall.length, z: crownTop }, transform)
    : null;
  const open = Boolean(hiddenEdges?.left.length || hiddenEdges?.right.length);
  const sides = open ? [
    [0, 0, wall.length, 0], [0, wall.height, wall.length, wall.height],
    ...['left', 'right'].flatMap((side) => {
      const x = side === 'left' ? 0 : wall.length;
      return uncoveredSpans(0, wall.height, hiddenEdges[side].map(({ bottom, top }) => ({ start: bottom, end: top })))
        .map(({ start, end }) => [x, start, x, end]);
    }),
  ].map(([x1, z1, x2, z2]) => {
    const one = wallToScreen({ x: x1, z: z1 }, transform);
    const two = wallToScreen({ x: x2, z: z2 }, transform);
    return [one.x, one.y, two.x, two.y];
  }) : [];
  const verticalGrid = [];
  const horizontalGrid = [];

  for (let x = 12; x < wall.length; x += 12) {
    const top = wallToScreen({ x, z: wall.height }, transform);
    const bottom = wallToScreen({ x, z: 0 }, transform);
    verticalGrid.push(
      <Line
        key={`x-${x}`}
        points={[top.x, top.y, bottom.x, bottom.y]}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.45}
      />,
    );
  }

  for (let z = 12; z < wall.height; z += 12) {
    const left = wallToScreen({ x: 0, z }, transform);
    const right = wallToScreen({ x: wall.length, z }, transform);
    horizontalGrid.push(
      <Line
        key={`z-${z}`}
        points={[left.x, left.y, right.x, right.y]}
        stroke="#334155"
        strokeWidth={1}
        opacity={0.45}
      />,
    );
  }

  return (
    <Group listening={false}>
      <Rect
        {...wallRect}
        fill="#0f172a"
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeEnabled={!open}
      />
      {sides.map((points) => (
        <Line key={points.join(':')} points={points} stroke="#94a3b8" strokeWidth={1.5} />
      ))}
      {verticalGrid}
      {horizontalGrid}
      {Number.isFinite(crownTop) && (
        <>
          <Line
            points={[crownStart.x, crownStart.y, crownEnd.x, crownEnd.y]}
            stroke="#fbbf24"
            strokeWidth={1.25}
            dash={[7, 5]}
            opacity={0.9}
          />
          <Text
            x={crownStart.x + 5}
            y={crownStart.y - 17 * (transform.text?.label ?? 1)}
            text={`Top of crown ${formatInches(crownTop)}`}
            fontSize={11 * (transform.text?.label ?? 1)}
            fill="#fbbf24"
          />
        </>
      )}
      <Line
        points={[floorStart.x, floorStart.y, floorEnd.x, floorEnd.y]}
        stroke="#e2e8f0"
        strokeWidth={2}
      />
    </Group>
  );
}
