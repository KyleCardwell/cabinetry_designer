import { Group, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { recessGeometry, recessesOn } from '../model/recesses.js';
import { formatInches } from '../model/units.js';

/**
 * Recesses and projections on the elevation (SPEC-38): a recess is a dashed outline over a darker fill (it's
 * behind the face), a projection a solid outline over a lighter one, each labeled with its depth.
 */
export default function RecessShapes({ wall, transform, selectedRecessId, onSelect }) {
  return recessesOn(wall).map((recess) => {
    const geometry = recessGeometry(recess, wall.length, wall.height);
    const rect = wallRectToScreen({
      x: geometry.x,
      z: geometry.bottom,
      width: geometry.width,
      height: geometry.top - geometry.bottom,
    }, transform);
    const selected = selectedRecessId === recess.id;
    const projection = recess.kind === 'projection';
    return (
      <Group
        key={recess.id}
        listening={Boolean(onSelect)}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect?.(recess.id);
        }}
      >
        <Rect
          {...rect}
          fill={projection ? 'rgba(148,163,184,0.16)' : 'rgba(2,6,23,0.55)'}
          stroke={selected ? '#60a5fa' : '#94a3b8'}
          strokeWidth={selected ? 2 : 1.25}
          dash={projection ? undefined : [6, 4]}
        />
        <Text
          x={rect.x + 4}
          y={rect.y + 4}
          width={Math.max(0, rect.width - 8)}
          text={`${recess.label} · ${formatInches(recess.depth)} ${projection ? 'out' : 'deep'}`}
          fontSize={10}
          fill="#cbd5e1"
          listening={false}
        />
      </Group>
    );
  });
}
