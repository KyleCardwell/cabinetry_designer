import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { wallLabel } from '../model/topology.js';
import Hatch from './Hatch.jsx';

/**
 * What this face sees of its neighbours at its corners and wing walls (SPEC-42.2): each return from
 * cornerShapes (sections hatched, their bands outlined) with its wall's label, and each wing wall's outline.
 */
export default function NeighborReturns({ room, wall, settings, transform }) {
  const seams = soffitSeams(room, wall);
  const returns = cornerShapes(room, wall, wall.side ?? 'front', settings)
    .filter((shape) => shape.kind === 'return')
    .map((shape) => {
      const neighbor = room.walls.find((candidate) => candidate.id === shape.wallId);
      const name = neighbor ? wallLabel(room, neighbor) : '';
      const label = shape.soffitId ? `${name} soffit`.trim() : name;
      const parts = shape.parts.map((part) => ({ ...part, rect: wallRectToScreen(part, transform) }));
      const labelPart = parts.find((part) => part.kind === 'section') ?? parts[0];
      return { key: shape.key, label, parts, labelRect: labelPart.rect };
    });

  const landings = landingsOn(room, wall).flatMap(({ wallId, a, b }) => {
    const landedWall = room.walls.find((candidate) => candidate.id === wallId);
    if (!landedWall) return [];
    const verticalEdge = (x) => {
      const seam = seams.find((candidate) => (
        candidate.wallId === wallId && Math.abs(candidate.x - x) <= 1e-6
      ));
      return [{ x, z: 0 }, { x, z: seam?.bottom ?? landedWall.height }];
    };
    return [{
      key: `landing:${wallId}:${a}:${b}`,
      label: wallLabel(room, landedWall),
      rect: wallRectToScreen({ x: a, z: 0, width: b - a, height: landedWall.height }, transform),
      edges: [
        [{ x: a, z: 0 }, { x: b, z: 0 }],
        [{ x: a, z: landedWall.height }, { x: b, z: landedWall.height }],
        verticalEdge(a),
        verticalEdge(b),
      ],
    }];
  });

  return (
    <>
      {returns.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.parts.map((part) => (part.kind === 'section' ? (
            <Group key={part.id} listening={false}>
              <Rect
                {...part.rect}
                fill="#475569"
                opacity={0.26}
                stroke="#94a3b8"
                strokeWidth={1.5}
                listening={false}
              />
              <Hatch rect={part.rect} />
            </Group>
          ) : (
            <Rect
              key={part.id}
              {...part.rect}
              stroke="#94a3b8"
              strokeWidth={1}
              listening={false}
            />
          )))}
          <Text
            {...entry.labelRect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10}
            fill="#e2e8f0"
            listening={false}
          />
        </Group>
      ))}
      {landings.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.edges.map(([start, end]) => {
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
      ))}
    </>
  );
}
