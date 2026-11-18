import {
  Group,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { soffitsOn } from '../model/soffits.js';
import { formatInches } from '../model/units.js';

export default function SoffitShapes({
  wall,
  transform,
  selectedSoffitId,
  onSelect,
}) {
  return soffitsOn(wall).map((soffit) => {
    const wallRect = {
      x: soffit.x,
      z: soffit.bottom,
      width: soffit.width,
      height: wall.height - soffit.bottom,
    };
    const rect = wallRectToScreen(wallRect, transform);
    const selected = selectedSoffitId === soffit.id;
    return (
      <Group
        key={soffit.id}
        listening={Boolean(onSelect)}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect?.(soffit.id);
        }}
      >
        <Rect
          {...rect}
          fill="rgba(0, 0, 0, 0.001)"
          stroke={selected ? '#7dd3fc' : undefined}
          strokeWidth={3}
          strokeEnabled={selected}
        />
        <Text
          {...rect}
          text={`Soffit · ${formatInches(soffit.bottom)}`}
          align="center"
          verticalAlign="middle"
          fontSize={10 * (transform.text?.label ?? 1)}
          fill="#e2e8f0"
          listening={false}
        />
      </Group>
    );
  });
}
