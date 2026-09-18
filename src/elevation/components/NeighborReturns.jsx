import { Group, Line, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { cornerAt, frontDepth } from '../model/corners.js';
import { wallLabel } from '../model/topology.js';

function Hatch({ rect }) {
  const spacing = 8;
  const count = Math.ceil((rect.width + rect.height) / spacing) + 2;
  return (
    <Group
      clipX={rect.x}
      clipY={rect.y}
      clipWidth={rect.width}
      clipHeight={rect.height}
      listening={false}
    >
      {Array.from({ length: count }, (_, index) => {
        const startX = rect.x - rect.height + index * spacing;
        return (
          <Line
            key={startX}
            points={[
              startX,
              rect.y + rect.height,
              startX + rect.height,
              rect.y,
            ]}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.55}
            listening={false}
          />
        );
      })}
    </Group>
  );
}

export default function NeighborReturns({ room, wall, settings, transform }) {
  const returns = [];
  for (const side of ['left', 'right']) {
    const corner = cornerAt(room, wall, side);
    if (corner.type !== 'inside') continue;
    const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
    if (!neighbor) continue;
    const sine = Math.sin(corner.angle * Math.PI / 180);
    if (Math.abs(sine) < 1e-9) continue;

    for (const run of neighbor.runs) {
      if (run.anchors?.[corner.neighborSide] !== true || run.height <= 0) continue;
      const width = Math.min(wall.length, frontDepth(run, settings) / sine);
      const rect = wallRectToScreen({
        x: side === 'left' ? 0 : wall.length - width,
        z: run.z,
        width,
        height: run.height,
      }, transform);
      returns.push({
        key: `${side}:${neighbor.id}:${run.id}`,
        label: wallLabel(room, neighbor),
        rect,
      });
    }
  }

  return returns.map((entry) => (
    <Group key={entry.key} listening={false}>
      <Rect
        {...entry.rect}
        fill="#475569"
        opacity={0.26}
        stroke="#94a3b8"
        strokeWidth={1.5}
        listening={false}
      />
      <Hatch rect={entry.rect} />
      <Text
        {...entry.rect}
        text={entry.label}
        align="center"
        verticalAlign="middle"
        fontSize={10}
        fill="#e2e8f0"
        listening={false}
      />
    </Group>
  ));
}
