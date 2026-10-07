import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';

const PART_STYLES = {
  profile: { stroke: '#64748b' },
  toe_kick: { fill: '#111827', opacity: 1, stroke: '#334155' },
  countertop: { fill: '#9ca3af', opacity: 0.55, stroke: '#cbd5e1' },
  top_mold: { fill: '#94a3b8', opacity: 0.55, stroke: '#cbd5e1' },
  crown: { fill: '#e2e8f0', opacity: 0.5, stroke: '#f8fafc' },
};

/** Runs on a connected wall that reach past this face's ends, seen from the side (SPEC-42.2). */
export default function NeighborProfiles({ room, wall, settings, transform }) {
  return cornerShapes(room, wall, wall.side ?? 'front', settings)
    .filter((shape) => shape.kind === 'profile')
    .map((shape) => (
      <Group key={shape.key} listening={false}>
        {shape.parts.map((part) => (
          <Rect
            key={part.id}
            {...wallRectToScreen(part, transform)}
            {...PART_STYLES[part.kind]}
            strokeWidth={1}
            listening={false}
          />
        ))}
      </Group>
    ));
}
