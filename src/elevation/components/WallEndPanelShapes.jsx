import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanelSpans } from '../model/wallEndPanels.js';

export default function WallEndPanelShapes({
  room,
  wall,
  settings,
  transform,
}) {
  return wallEndPanelSpans(room, wall, settings).map((span) => {
    const side = span[wall.side];
    const piece = {
      x: side.x,
      z: span.bottom,
      width: span.width,
      height: span.top - span.bottom,
    };
    const rect = wallRectToScreen(piece, transform);
    return (
      <Group key={`${span.endpoint}-${span.bottom}`} listening={false}>
        <Rect
          {...rect}
          fill={KIND_COLORS.end_panel}
          opacity={0.55}
          stroke={KIND_COLORS.end_panel}
          strokeWidth={1}
          listening={false}
        />
      </Group>
    );
  });
}
