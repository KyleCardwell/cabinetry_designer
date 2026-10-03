import { Group, Line, Text } from 'react-konva';
import { elevationToPlan } from '../model/geometry.js';
import { recessGeometry, recessPlanShape } from '../model/recesses.js';
import { formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

function toPoints(frame, points) {
  return points.flatMap(([u, v]) => {
    const point = elevationToPlan(frame, u, v);
    return [point.x, point.y];
  });
}

/**
 * A recess or projection in plan (SPEC-38): wall added (a deep recess's bump-out, a projection), the notch
 * knocked out of the wall, and its outline, dashed when it's raised off the floor. Not clickable.
 */
export default function PlanRecess({ wall, frame, recess, scale, selected }) {
  const shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness);
  const geometry = recessGeometry(recess, frame.length, wall.height);
  // The knockout's face edge sits a pixel into the room so it also hides the wall's face line.
  const knockout = shape.knockout?.map(([u, v]) => [u, v === 0 ? 1 / scale : v]) ?? null;
  const stroke = selected ? '#60a5fa' : '#d1d5db';
  const strokeWidth = (selected ? 2 : 1) / scale;
  const dash = shape.dashed ? [5 / scale, 3 / scale] : undefined;
  const label = elevationToPlan(frame, shape.label[0], shape.label[1]);
  return (
    <Group listening={false}>
      {shape.fill && (
        <Line points={toPoints(frame, shape.fill)} closed fill="#6b7280" opacity={0.85} />
      )}
      {knockout && (
        <Line points={toPoints(frame, knockout)} closed fill={PLAN_BACKGROUND_COLOR} />
      )}
      {shape.lines.map((line, index) => (
        <Line
          key={index}
          points={toPoints(frame, line)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
        />
      ))}
      <Text
        x={label.x}
        y={label.y}
        width={120 / scale}
        offsetX={60 / scale}
        offsetY={PLAN_DIM_FONT_SIZE / 2 / scale}
        align="center"
        rotation={readableRotation(Math.atan2(frame.r.y, frame.r.x) * 180 / Math.PI)}
        text={`${recess.label} · ${formatInches(geometry.width)} × ${formatInches(geometry.depth)}`}
        fontSize={PLAN_DIM_FONT_SIZE / scale}
        fill="#e2e8f0"
      />
    </Group>
  );
}
