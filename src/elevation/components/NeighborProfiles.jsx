import { Group, Rect, Shape } from 'react-konva';
import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { doorDrawing } from '../model/doorDetails.js';
import DoorDetails from './DoorDetails.jsx';
import { outlineGeometry } from './outlinePath.js';

const PART_STYLES = {
  profile: { stroke: '#64748b' },
  toe_kick: { fill: ELEVATION_BG, opacity: 1, stroke: ELEVATION_LINE },
  furniture_base: { fill: ELEVATION_BG, opacity: 0.9, stroke: ELEVATION_LINE },
  countertop: { fill: '#9ca3af', opacity: 0.55, stroke: '#cbd5e1' },
  top_mold: { fill: ELEVATION_BG, opacity: 0.55, stroke: ELEVATION_LINE },
  crown: { fill: ELEVATION_BG, opacity: 0.5, stroke: ELEVATION_LINE },
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
