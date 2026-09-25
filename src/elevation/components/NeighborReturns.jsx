import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import {
  anchoredToCorner,
  cornerAt,
  frontDepth,
  spanCorner,
} from '../model/corners.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { wallLabel } from '../model/topology.js';
import { wallSideOf } from '../model/wallSides.js';
import Hatch from './Hatch.jsx';

export default function NeighborReturns({ room, wall, settings, transform }) {
  const returns = [];
  const seams = soffitSeams(room, wall);
  for (const side of ['left', 'right']) {
    const corner = cornerAt(room, wall, side);
    if (corner.type !== 'inside') continue;
    const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
    if (!neighbor) continue;
    const sine = Math.sin(corner.angle * Math.PI / 180);
    if (Math.abs(sine) < 1e-9) continue;

    for (const run of neighbor.runs) {
      if (wallSideOf(run) !== corner.neighborWallSide) continue;
      if (!anchoredToCorner(run.anchors?.[corner.neighborSide], corner) || run.height <= 0) continue;
      const width = Math.min(wall.length, frontDepth(run, settings) / sine);
      const rect = wallRectToScreen({
        x: side === 'left' ? 0 : wall.length - width,
        z: run.z,
        width,
        height: run.height,
      }, transform);
      returns.push({
        key: `${side}:${neighbor.id}:${run.id}`,
        kind: 'return',
        label: wallLabel(room, neighbor),
        rect,
      });
    }
  }

  for (const { wallId, a, b } of landingsOn(room, wall)) {
    const landedWall = room.walls.find((candidate) => candidate.id === wallId);
    if (!landedWall) continue;
    returns.push({
      key: `landing:${wallId}:${a}:${b}`,
      kind: 'landing',
      label: wallLabel(room, landedWall),
      wallId,
      a,
      b,
      height: landedWall.height,
      rect: wallRectToScreen({
        x: a,
        z: 0,
        width: b - a,
        height: landedWall.height,
      }, transform),
    });

    for (const side of ['left', 'right']) {
      const corner = spanCorner(room, wall, {
        wallSide: wall.side,
        anchors: { [side]: { to: 'wall', wallId } },
      }, side);
      const sine = Math.sin(corner.angle * Math.PI / 180);
      if (corner.type !== 'inside' || Math.abs(sine) < 1e-9) continue;

      for (const run of landedWall.runs) {
        if (wallSideOf(run) !== corner.neighborWallSide) continue;
        if (run.anchors?.[corner.neighborSide] !== true || run.height <= 0) continue;
        const width = frontDepth(run, settings) / sine;
        returns.push({
          key: `landing:${wallId}:${side}:${run.id}`,
          kind: 'return',
          label: wallLabel(room, landedWall),
          rect: wallRectToScreen({
            x: side === 'left' ? b : a - width,
            z: run.z,
            width,
            height: run.height,
          }, transform),
        });
      }
    }
  }

  return returns.map((entry) => {
    const verticalEdge = (x) => {
      const seam = seams.find((candidate) => (
        candidate.wallId === entry.wallId && Math.abs(candidate.x - x) <= 1e-6
      ));
      return [{ x, z: 0 }, { x, z: seam?.bottom ?? entry.height }];
    };
    const edges = entry.kind === 'landing' ? [
      [{ x: entry.a, z: 0 }, { x: entry.b, z: 0 }],
      [{ x: entry.a, z: entry.height }, { x: entry.b, z: entry.height }],
      verticalEdge(entry.a),
      verticalEdge(entry.b),
    ] : [];

    return (
      <Group key={entry.key} listening={false}>
        {entry.kind === 'return' && (
          <>
            <Rect
              {...entry.rect}
              fill="#475569"
              opacity={0.26}
              stroke="#94a3b8"
              strokeWidth={1.5}
              listening={false}
            />
            <Hatch rect={entry.rect} />
          </>
        )}
        {edges.map(([start, end]) => {
          const screenStart = wallToScreen(start, transform);
          const screenEnd = wallToScreen(end, transform);
          return (
            <Line
              key={`${start.x}:${start.z}:${end.x}:${end.z}`}
              points={[screenStart.x, screenStart.y, screenEnd.x, screenEnd.y]}
              stroke="#94a3b8"
              strokeWidth={1.5}
              listening={false}
            />
          );
        })}
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
    );
  });
}
