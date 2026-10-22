import {
  Group,
  Line,
  Rect,
  Shape,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { wallLabel } from '../model/topology.js';
import Hatch from './Hatch.jsx';
import { outlineGeometry, outlinePath } from './outlinePath.js';

/**
 * What this face sees of its neighbours at its corners and wing walls (SPEC-42.2): each return from
 * cornerShapes (sections hatched, end views and bands outlined) with its wall's label and wing wall outline.
 */
export default function NeighborReturns({
  room, wall, settings, transform,
  shapes = cornerShapes(room, wall, wall.side ?? 'front', settings),
}) {
  const seams = soffitSeams(room, wall);
  const returns = shapes
    .filter((shape) => shape.kind === 'return')
    .map((shape) => {
      const neighbor = room.walls.find((candidate) => candidate.id === shape.wallId);
      const name = neighbor ? wallLabel(room, neighbor) : '';
      const label = shape.soffitId ? `${name} soffit`.trim() : name;
      const parts = shape.parts.map((part) => ({
        ...part,
        rect: wallRectToScreen(part, transform),
      }));
      const labelPart = parts.find((part) => ['section', 'profile'].includes(part.kind)) ?? parts[0];
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
          {entry.parts.map((part) => {
            const PartShape = part.outline ? Shape : Rect;
            const geometry = part.outline ? outlineGeometry(part.outline, transform) : part.rect;
            const section = part.kind === 'section';
            const profile = part.kind === 'profile' || part.kind === 'end_panel';
            const clipFunc = part.outline ? outlinePath(part.outline, transform) : undefined;
            return (
              <Group key={part.id} listening={false}>
                <PartShape
                  {...geometry}
                  fill={section ? '#475569' : undefined}
                  opacity={section ? 0.26 : 1}
                  stroke={profile ? '#64748b' : '#94a3b8'}
                  strokeWidth={section ? 1.5 : 1}
                  listening={false}
                />
                {section && (
                  <Group clipFunc={clipFunc} listening={false}>
                    <Hatch rect={part.rect} />
                  </Group>
                )}
              </Group>
            );
          })}
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
