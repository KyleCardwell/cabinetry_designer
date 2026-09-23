import { Group, Line, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { neighborProfiles } from '../model/neighborProfiles.js';
import { formatInches } from '../model/units.js';

const DIMENSION_FONT_SIZE = 11;
const TICK_HALF_LENGTH = 4;
const TEXT_BOX_WIDTH = 80;
/** Below this on-screen span the dimension is dropped and the outline draws alone. */
const MIN_DIMENSION_PX = 10;

export default function NeighborProfiles({ room, wall, settings, transform }) {
  return neighborProfiles(room, wall, settings).map((profile) => {
    const rect = wallRectToScreen(profile, transform);
    const y = rect.y + rect.height / 2;

    return (
      <Group key={profile.key} listening={false}>
        <Rect {...rect} stroke="#64748b" strokeWidth={1} />
        {rect.width >= MIN_DIMENSION_PX && (
          <>
            <Line
              points={[rect.x, y, rect.x + rect.width, y]}
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <Line
              points={[rect.x, y - TICK_HALF_LENGTH, rect.x, y + TICK_HALF_LENGTH]}
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <Line
              points={[
                rect.x + rect.width,
                y - TICK_HALF_LENGTH,
                rect.x + rect.width,
                y + TICK_HALF_LENGTH,
              ]}
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <Text
              text={formatInches(profile.width)}
              x={rect.x + rect.width / 2 - TEXT_BOX_WIDTH / 2}
              y={y - DIMENSION_FONT_SIZE - 4}
              width={TEXT_BOX_WIDTH}
              align="center"
              fontSize={DIMENSION_FONT_SIZE}
              fill="#e2e8f0"
            />
          </>
        )}
      </Group>
    );
  });
}
