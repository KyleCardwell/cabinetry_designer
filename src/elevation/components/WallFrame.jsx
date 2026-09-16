import { Group, Line, Rect } from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';

export default function WallFrame({ wall, transform }) {
  const wallRect = wallRectToScreen({
    x: 0,
    z: 0,
    width: wall.length,
    height: wall.height,
  }, transform);
  const floorStart = wallToScreen({ x: 0, z: 0 }, transform);
  const floorEnd = wallToScreen({ x: wall.length, z: 0 }, transform);
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
      />
      {verticalGrid}
      {horizontalGrid}
      <Line
        points={[floorStart.x, floorStart.y, floorEnd.x, floorEnd.y]}
        stroke="#e2e8f0"
        strokeWidth={2}
      />
    </Group>
  );
}
