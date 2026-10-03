import { Group, Rect, Text } from 'react-konva';
import {
  partBadgeWidth,
  PART_BADGE_FONT_SIZE,
  PART_BADGE_HEIGHT,
} from '../canvas/partNumberLayout.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { wallMoldingBadges } from '../model/partNumbers.js';

const MOLDING_BADGE_GAP = 4;

export default function MoldingBadges({ room, wall, settings, partNumbers, transform }) {
  if (!partNumbers) return null;
  const badges = wallMoldingBadges(room, wall, settings, partNumbers.byKey);

  return (
    <Group listening={false}>
      {badges.map((badge) => {
        const rect = wallRectToScreen(badge, transform);
        const text = `${badge.label} ${badge.number}`;
        const width = partBadgeWidth(text);
        const centerX = rect.x + rect.width / 2 + badge.slot * (width + MOLDING_BADGE_GAP);
        const centerY = rect.y + rect.height / 2;
        return (
          <Group key={badge.key} listening={false}>
            <Rect
              x={centerX - width / 2}
              y={centerY - PART_BADGE_HEIGHT / 2}
              width={width}
              height={PART_BADGE_HEIGHT}
              cornerRadius={PART_BADGE_HEIGHT / 2}
              fill="#1e293b"
              stroke="#cbd5e1"
              strokeWidth={1.25}
              listening={false}
            />
            <Text
              x={centerX - width / 2}
              y={centerY - PART_BADGE_HEIGHT / 2}
              width={width}
              height={PART_BADGE_HEIGHT}
              text={text}
              align="center"
              verticalAlign="middle"
              fontSize={PART_BADGE_FONT_SIZE}
              fontStyle="bold"
              fill="#f8fafc"
              listening={false}
            />
          </Group>
        );
      })}
    </Group>
  );
}
