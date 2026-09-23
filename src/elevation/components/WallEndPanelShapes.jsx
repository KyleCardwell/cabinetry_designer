import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanelPartKey } from '../model/partNumbers.js';
import { wallEndPanels } from '../model/wallEndPanels.js';
import PartNumberBadges from './PartNumberBadges.jsx';

export default function WallEndPanelShapes({
  room,
  wall,
  settings,
  partNumbers = null,
  transform,
}) {
  return wallEndPanels(room, wall, settings).map((panel) => {
    const side = panel[wall.side];
    const piece = {
      id: wallEndPanelPartKey(wall.id, panel.endpoint),
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
        {partNumbers && (
          <PartNumberBadges
            pieces={[piece]}
            numbers={partNumbers.byKey}
            overrideKeys={partNumbers.overrideKeys}
            transform={transform}
            lift={1}
          />
        )}
      </Group>
    );
  });
}
