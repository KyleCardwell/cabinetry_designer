import { Fragment, useEffect, useMemo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallNearMisses } from '../model/landings.js';
import { wallLabel } from '../model/topology.js';
import { formatInches } from '../model/units.js';

const AMBER = '#f59e0b';

export default function PlanNearMisses({ room, scale, text, tool, entry, cursor, onLand }) {
  const misses = useMemo(() => (room ? wallNearMisses(room) : []), [room]);
  const cursorKeys = useCursorKeys(cursor);
  const canLand = tool === 'select' && !entry;
  useEffect(() => () => {
    misses.forEach(({ wallId, endpoint }) => cursorKeys.release(`${wallId}:${endpoint}`));
  }, [canLand, cursorKeys, misses]);

  const size = (text?.label ?? 1) / scale;
  return (
    <>
      {misses.map((miss) => {
        const key = `${miss.wallId}:${miss.endpoint}`;
        const host = room.walls.find((wall) => wall.id === miss.hostId);
        const label = wallLabel(room, host);
        return (
          <Fragment key={key}>
            {miss.gap >= 1e-6 && (
              <Line
                listening={false}
                points={[miss.from.x, miss.from.y, miss.point.x, miss.point.y]}
                stroke={AMBER}
                strokeWidth={1 / scale}
                dash={[4 / scale, 4 / scale]}
              />
            )}
            <Text
              listening={false}
              x={miss.from.x + 10 * size}
              y={miss.from.y - 17 * size}
              text={miss.gap < 1e-6
                ? `Touches ${label}, not landed`
                : `Stops ${formatInches(miss.gap)} short of ${label}`}
              fontSize={10 * size}
              fill={AMBER}
            />
            <Group
              x={miss.from.x + 10 * size}
              y={miss.from.y + 2 * size}
              listening={canLand}
              onMouseEnter={canLand ? () => cursorKeys.request(key, CURSORS.select) : undefined}
              onMouseLeave={canLand ? () => cursorKeys.release(key) : undefined}
              onClick={canLand ? (event) => {
                event.cancelBubble = true;
                onLand(miss);
              } : undefined}
            >
              <Rect
                width={40 * size}
                height={17 * size}
                cornerRadius={4 * size}
                fill="#422006"
                stroke={AMBER}
                strokeWidth={1 / scale}
              />
              <Text
                listening={false}
                width={40 * size}
                height={17 * size}
                align="center"
                verticalAlign="middle"
                text="Land"
                fontSize={10 * size}
                fill={AMBER}
              />
            </Group>
          </Fragment>
        );
      })}
    </>
  );
}
