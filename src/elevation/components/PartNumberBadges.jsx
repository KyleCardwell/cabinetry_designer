import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import {
  PART_BADGE_FONT_SIZE,
  PART_BADGE_HEIGHT,
} from '../canvas/partNumberLayout.js';
import { wallLineToScreen, wallToScreen } from '../canvas/transform.js';

export default function PartNumberBadges({
  badges,
  overrideKeys,
  transform,
  molding = false,
}) {
  return (
    <Group listening={false}>
      {badges.map((badge) => {
        const { x: center, y } = wallToScreen(badge, transform);
        const width = badge.width * transform.scale;
        return (
          <Group key={badge.key} listening={false}>
            {badge.leader && (
              <Line
                points={wallLineToScreen(badge.leader, transform)}
                stroke="#94a3b8"
                strokeWidth={0.75}
                listening={false}
              />
            )}
            <Rect
              x={center - width / 2}
              y={y - PART_BADGE_HEIGHT / 2}
              width={width}
              height={PART_BADGE_HEIGHT}
              cornerRadius={PART_BADGE_HEIGHT / 2}
              fill={molding ? '#1e293b' : '#0f172a'}
              stroke={molding ? '#cbd5e1' : overrideKeys.has(badge.key) ? '#facc15' : '#f8fafc'}
              strokeWidth={1.25}
              listening={false}
            />
            <Text
              x={center - width / 2}
              y={y - PART_BADGE_HEIGHT / 2}
              width={width}
              height={PART_BADGE_HEIGHT}
              text={badge.text}
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
