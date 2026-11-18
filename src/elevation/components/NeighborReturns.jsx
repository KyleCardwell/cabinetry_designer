import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { cornerReturnLegs } from '../model/cornerLegs.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { wallLabel } from '../model/topology.js';

/**
 * What this face sees of its neighbours at its corners and wing walls (SPEC-42.2): each return from
 * cornerShapes, retaining selection outlines, wall labels and landing outlines above the painter.
 */
export default function NeighborReturns({
  room, wall, settings, transform,
  shapes = cornerShapes(room, wall, wall.side ?? 'front', settings),
  legs = cornerReturnLegs(room, wall, settings), selection = null,
}) {
  const seams = soffitSeams(room, wall);
  const returns = shapes
    .filter((shape) => shape.kind === 'return')
    .map((shape) => {
      const neighbor = room.walls.find((candidate) => candidate.id === shape.wallId);
      const name = neighbor ? wallLabel(room, neighbor) : '';
      const label = shape.cornerOf ? '' : shape.soffitId ? `${name} soffit`.trim() : name;
      const labelPart = shape.parts.find((part) => ['section', 'profile'].includes(part.kind)) ?? shape.parts[0];
      return { key: shape.key, label, labelRect: wallRectToScreen(labelPart, transform) };
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
      {legs.map((leg) => {
        const selected = selection?.cornerOf?.wallId === leg.ownerWallId
          && selection.cornerOf.runId === leg.runId && selection.cornerOf.side === leg.side;
        return selected ? (
          <Rect
            key={leg.key}
            {...wallRectToScreen(leg.rect, transform)}
            fillEnabled={false}
            stroke="#7dd3fc"
            strokeWidth={3}
            listening={false}
          />
        ) : null;
      })}
      {returns.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.label && <Text
            {...entry.labelRect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10 * (transform.text?.label ?? 1)}
            fill="#e2e8f0"
            listening={false}
          />}
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
            fontSize={10 * (transform.text?.label ?? 1)}
            fill="#e2e8f0"
            listening={false}
          />
        </Group>
      ))}
    </>
  );
}
