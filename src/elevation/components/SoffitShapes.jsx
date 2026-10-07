import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { soffitFlushSides, soffitsOn } from '../model/soffits.js';
import { formatInches } from '../model/units.js';

export default function SoffitShapes({
  room,
  wall,
  transform,
  selectedSoffitId,
  onSelect,
}) {
  return soffitsOn(wall).map((soffit) => {
    const rect = wallRectToScreen({
      x: soffit.x,
      z: soffit.bottom,
      width: soffit.width,
      height: wall.height - soffit.bottom,
    }, transform);
    const selected = selectedSoffitId === soffit.id;
    const flush = soffitFlushSides(room, wall, soffit);
    const stroke = selected ? '#60a5fa' : '#94a3b8';
    const strokeWidth = selected ? 2 : 1.5;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const edges = [
      [left, top, right, top],
      [left, bottom, right, bottom],
      ...(!flush.left ? [[left, top, left, bottom]] : []),
      ...(!flush.right ? [[right, top, right, bottom]] : []),
    ];
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
          fill="rgba(0,0,0,0)"
          strokeEnabled={false}
        />
        {edges.map((points) => (
          <Line
            key={points.join(':')}
            points={points}
            stroke={stroke}
            strokeWidth={strokeWidth}
            listening={false}
          />
        ))}
        <Text
          {...rect}
          text={`Soffit · ${formatInches(soffit.bottom)}`}
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
