import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallLineToScreen, wallRectToScreen } from '../canvas/transform.js';
import {
  joinedSides,
  soffitFlushSides,
  soffitJoinsBySide,
  soffitProjectionJoins,
  soffitsOn,
} from '../model/soffits.js';
import { formatInches } from '../model/units.js';

export default function SoffitShapes({
  room,
  wall,
  transform,
  selectedSoffitId,
  onSelect,
  combinedJoins = [],
}) {
  // A combined elevation's nearer face just as deep joins like a projection (Kyle 2026-10-23).
  const joins = [...soffitProjectionJoins(wall), ...combinedJoins];
  return soffitsOn(wall).map((soffit) => {
    const wallRect = {
      x: soffit.x,
      z: soffit.bottom,
      width: soffit.width,
      height: wall.height - soffit.bottom,
    };
    const rect = wallRectToScreen(wallRect, transform);
    const selected = selectedSoffitId === soffit.id;
    const flush = soffitFlushSides(room, wall, soffit);
    const stroke = selected ? '#60a5fa' : '#94a3b8';
    const strokeWidth = selected ? 2 : 1.5;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    // A side flush with a wing wall is open; one butting a projection as deep is drawn only past it.
    const joined = joinedSides(wallRect, soffitJoinsBySide(joins, soffit, flush));
    const edges = [
      [left, top, right, top],
      [left, bottom, right, bottom],
      ...(!flush.left && !joined.openEdges.includes('left') ? [[left, top, left, bottom]] : []),
      ...(!flush.right && !joined.openEdges.includes('right') ? [[right, top, right, bottom]] : []),
      ...joined.lines.map((line) => wallLineToScreen(line, transform)),
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
