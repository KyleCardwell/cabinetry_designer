import { Group, Line, Text } from 'react-konva';
import { gappedLine } from '../canvas/gappedLine.js';
import { elevationToPlan } from '../model/geometry.js';
import { planTopOverhangs } from '../model/planTops.js';
import { formatDimension } from '../model/units.js';
import { wallSideFrame } from '../model/wallSides.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

/** Top overhang dimensions use the same line, diagonal ticks and pop-out labels as run depths. */
export default function PlanTopOverhangs({ room, settings, scale }) {
  const fontSize = PLAN_DIM_FONT_SIZE / scale;
  return planTopOverhangs(room, settings).map(({ wallId, runId, side, edge, value, from, to }, index) => {
    const wall = room.walls.find(({ id }) => id === wallId);
    const frame = wallSideFrame(room, wall, 'front');
    const a = elevationToPlan(frame, ...from);
    const b = elevationToPlan(frame, ...to);
    const unit = { x: (b.x - a.x) / value, y: (b.y - a.y) / value };
    const outward = edge === 'front' || edge === 'back' ? frame.r : frame.n;
    const text = formatDimension(value);
    const width = (text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) / scale;
    const fits = value >= width + 8 / scale;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const labelOffset = fits ? 0 : (12 + PLAN_DIM_FONT_SIZE / 2) / scale;
    const label = { x: center.x + outward.x * labelOffset, y: center.y + outward.y * labelOffset };
    const tick = { x: (unit.x + outward.x) * 4 / Math.SQRT2 / scale,
      y: (unit.y + outward.y) * 4 / Math.SQRT2 / scale };
    const lines = fits ? gappedLine(a, b, label, width / 2, 0.5 / scale) : [[a.x, a.y, b.x, b.y]];
    return (
      <Group key={`${wallId}:${runId}:${side}:${edge}:${index}`} listening={false}>
        {lines.map((points, i) => (
          <Line key={`line:${i}`} points={points} stroke="#e2e8f0" strokeWidth={1 / scale} listening={false} />
        ))}
        {[a, b].map((point, i) => (
          <Line
            key={`tick:${i}`}
            points={[point.x - tick.x, point.y - tick.y, point.x + tick.x, point.y + tick.y]}
            stroke="#e2e8f0"
            strokeWidth={1 / scale}
            listening={false}
          />
        ))}
        {!fits && (
          <Line
            points={[center.x, center.y, center.x + outward.x * 10 / scale, center.y + outward.y * 10 / scale]}
            stroke="#64748b"
            strokeWidth={0.75 / scale}
            listening={false}
          />
        )}
        <Text
          x={label.x}
          y={label.y}
          width={width}
          offsetX={width / 2}
          offsetY={fontSize / 2}
          rotation={readableRotation(Math.atan2(unit.y, unit.x) * 180 / Math.PI)}
          align="center"
          text={text}
          fontSize={fontSize}
          fill="#e2e8f0"
          listening={false}
        />
      </Group>
    );
  });
}
