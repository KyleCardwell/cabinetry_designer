import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import {
  layoutPartBadges,
  partBadgeLevels,
  PART_BADGE_FONT_SIZE,
  PART_BADGE_HEIGHT,
  PART_BADGE_LIFT,
  PART_BADGE_STEP,
} from '../canvas/partNumberLayout.js';
import { wallRectToScreen } from '../canvas/transform.js';

export default function PartNumberBadges({
  pieces,
  numbers,
  overrideKeys,
  transform,
  lift = 0,
}) {
  if (pieces.length === 0) return null;
  const rects = new Map(pieces.map((piece) => [
    piece.id,
    wallRectToScreen(piece, transform),
  ]));
  const firstRect = rects.get(pieces[0].id);
  const entries = pieces.flatMap((piece) => {
    if (!numbers.has(piece.id)) return [];
    const rect = rects.get(piece.id);
    return [{
      key: piece.id,
      text: String(numbers.get(piece.id)),
      left: rect.x,
      right: rect.x + rect.width,
    }];
  });
  const badges = layoutPartBadges(entries, {
    maxLevels: partBadgeLevels(firstRect.height),
  });

  return (
    <Group listening={false}>
      {badges.map((badge) => {
        const rect = rects.get(badge.key);
        const restY = rect.y + rect.height / 2 - PART_BADGE_LIFT;
        const y = restY - (badge.level + lift) * PART_BADGE_STEP;
        return (
          <Group key={badge.key} listening={false}>
            {badge.level + lift > 0 && (
              <Line
                points={[badge.center, y + PART_BADGE_HEIGHT / 2, badge.center, restY]}
                stroke="#94a3b8"
                strokeWidth={0.75}
                listening={false}
              />
            )}
            <Rect
              x={badge.center - badge.width / 2}
              y={y - PART_BADGE_HEIGHT / 2}
              width={badge.width}
              height={PART_BADGE_HEIGHT}
              cornerRadius={PART_BADGE_HEIGHT / 2}
              fill="#0f172a"
              stroke={overrideKeys.has(badge.key) ? '#facc15' : '#f8fafc'}
              strokeWidth={1.25}
              listening={false}
            />
            <Text
              x={badge.center - badge.width / 2}
              y={y - PART_BADGE_HEIGHT / 2}
              width={badge.width}
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
