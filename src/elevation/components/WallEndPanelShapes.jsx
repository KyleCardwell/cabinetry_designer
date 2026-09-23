import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanels } from '../model/wallEndPanels.js';

export default function WallEndPanelShapes({
  room,
  wall,
  settings,
  transform,
}) {
  return wallEndPanels(room, wall, settings).map((panel) => {
    const side = panel[wall.side];
    const piece = {
      x: side.x,
      z: 0,
      width: panel.width,
      height: panel.top,
    };
    const rect = wallRectToScreen(piece, transform);
    return (
      <Group key={panel.endpoint} listening={false}>
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
