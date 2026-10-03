import { Group, Line, Rect, Text } from 'react-konva';
import { formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

const COLOR = '#5eead4';
const TICK_HALF = 4;

/** Plan clearances (SPEC-36.3): a dimension line across each gap, with ticks and a label. */
export default function PlanClearances({ dimensions, scale }) {
  const fontSize = PLAN_DIM_FONT_SIZE / scale;
  return (
    <Group listening={false}>
      {dimensions.map(({
        kind, from, to, length,
      }) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const span = Math.hypot(dx, dy);
        const unit = span > 0 ? { x: dx / span, y: dy / span } : { x: 1, y: 0 };
        const tick = { x: (-unit.y * TICK_HALF) / scale, y: (unit.x * TICK_HALF) / scale };
        const text = formatInches(length);
        const width = (text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) / scale;
        const height = (PLAN_DIM_FONT_SIZE + 4) / scale;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <Group key={`${kind}:${from.x}:${from.y}:${to.x}:${to.y}`}>
            <Line points={[from.x, from.y, to.x, to.y]} stroke={COLOR} strokeWidth={1 / scale} />
            {[['from', from], ['to', to]].map(([end, point]) => (
              <Line
                key={end}
                points={[point.x - tick.x, point.y - tick.y, point.x + tick.x, point.y + tick.y]}
                stroke={COLOR}
                strokeWidth={1 / scale}
              />
            ))}
            <Group x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} rotation={readableRotation(angle)}>
              <Rect
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                fill={PLAN_BACKGROUND_COLOR}
                opacity={0.85}
              />
              <Text
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                align="center"
                verticalAlign="middle"
                text={text}
                fontSize={fontSize}
                fill={COLOR}
              />
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}
