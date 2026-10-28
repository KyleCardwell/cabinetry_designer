import { Group, Rect, Shape } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { doorDrawing } from '../model/doorDetails.js';
import DoorDetails from './DoorDetails.jsx';
import { outlineGeometry } from './outlinePath.js';

const PART_STYLES = {
  profile: { stroke: '#64748b' },
  toe_kick: { fill: '#111827', opacity: 1, stroke: '#334155' },
  furniture_base: { fill: '#475569', opacity: 0.9, stroke: '#f1f5f9' },
  countertop: { fill: '#9ca3af', opacity: 0.55, stroke: '#cbd5e1' },
  top_mold: { fill: '#94a3b8', opacity: 0.55, stroke: '#cbd5e1' },
  crown: { fill: '#e2e8f0', opacity: 0.5, stroke: '#f8fafc' },
};

/** Runs on a connected wall that reach past this face's ends, seen from the side (SPEC-42.2). */
export default function NeighborProfiles({
  room, wall, settings, transform, doorsOff = false,
  shapes = cornerShapes(room, wall, wall.side ?? 'front', settings),
}) {
  return shapes
    .filter((shape) => shape.kind === 'profile')
    .map((shape) => (
      <Group key={shape.key} listening={false}>
        {shape.parts.map((part) => {
          const PartShape = part.outline ? Shape : Rect;
          const geometry = part.outline
            ? outlineGeometry(part.outline, transform) : wallRectToScreen(part, transform);
          return (
            <Group key={part.id} listening={false}>
              <PartShape
                {...geometry}
                {...PART_STYLES[part.kind]}
                strokeWidth={1}
                listening={false}
              />
              {!doorsOff && doorDrawing(room).details && part.doorDetail && (
                <DoorDetails
                  parts={[{ ...part, key: part.id, ...part.doorDetail, lines: part.doorDetail.profileLines }]}
                  warnings={[]}
                  transform={transform}
                  showDetails
                  showTags={false}
                />
              )}
            </Group>
          );
        })}
      </Group>
    ));
}
