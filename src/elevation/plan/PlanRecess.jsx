import { Group, Line, Text } from 'react-konva';
import { planSideReach } from '../model/planDimensions.js';
import { wallSideOf } from '../model/wallSides.js';
import { elevationToPlan } from '../model/geometry.js';
import {
  projectionDepthX,
  projectionTightSides,
  recessGeometry,
  recessPlanShape,
} from '../model/recesses.js';
import { formatDimension, formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { depthDimension } from './depthDimension.js';
import { readableFlip, readableRotation } from './textRotation.js';

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
export default function PlanRecess({ room, wall, frame, recess, scale, selected, settings }) {
  const tight = projectionTightSides(room, wall, recess, frame.length);
  const shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness, tight);
  const geometry = recessGeometry(recess, frame.length, wall.height);
  // The knockout's face edge sits a pixel into the room so it also hides the wall's face line.
  const knockout = shape.knockout?.map(([u, v]) => [u, v === 0 ? 1 / scale : v]) ?? null;
  const stroke = selected ? '#60a5fa' : '#d1d5db';
  const strokeWidth = (selected ? 2 : 1) / scale;
  const dash = shape.dashed ? [5 / scale, 3 / scale] : undefined;
  const opposite = wallSideOf(recess) === 'front' ? 'back' : 'front';
  const bumpOut = recess.kind !== 'projection' && geometry.depth >= wall.thickness - 1e-6
    ? geometry.depth : 0;
  const label = elevationToPlan(frame, geometry.x + geometry.width / 2,
    -wall.thickness - bumpOut - planSideReach(room, wall, opposite, settings) - 10 / scale);
  const depthDim = recess.kind === 'projection' && geometry.depth > 0
    ? projectionDepth(frame, geometry.depth, projectionDepthX(recess, frame.length, wall.height, tight), scale)
    : null;
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
      {depthDim}
    </Group>
  );
}

const TICK_HALF_LENGTH = 4;

/** A projection's depth from the face, across it at `x` (Kyle 2026-10-16), drawn like a run's depth. */
function projectionDepth(frame, depth, x, scale) {
  const dim = depthDimension({ x, width: 0 }, depth, scale);
  const back = elevationToPlan(frame, x, 0);
  const front = elevationToPlan(frame, x, depth);
  const tick = TICK_HALF_LENGTH / scale;
  const tickDirection = { x: (frame.n.x + frame.r.x) / Math.SQRT2, y: (frame.n.y + frame.r.y) / Math.SQRT2 };
  const angle = Math.atan2(frame.n.y, frame.n.x) * 180 / Math.PI;
  const fontSize = PLAN_DIM_FONT_SIZE / scale;
  const text = formatDimension(depth);
  const textWidth = (text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) / scale;
  const at = elevationToPlan(frame, dim.label.x, dim.label.offset);
  const line = (points, stroke = '#e2e8f0', width = 1) => (
    <Line points={points.flatMap((point) => [point.x, point.y])} stroke={stroke} strokeWidth={width / scale} />
  );
  return (
    <Group>
      {line([back, front])}
      {[back, front].map((point, index) => (
        <Group key={index}>
          {line([
            { x: point.x - tickDirection.x * tick, y: point.y - tickDirection.y * tick },
            { x: point.x + tickDirection.x * tick, y: point.y + tickDirection.y * tick },
          ])}
        </Group>
      ))}
      {dim.leader && line([
        elevationToPlan(frame, dim.leader.x1, dim.leader.offset),
        elevationToPlan(frame, dim.leader.x2, dim.leader.offset),
      ], '#64748b', 0.75)}
      <Text
        x={at.x}
        y={at.y}
        width={textWidth}
        offsetX={textWidth / 2}
        offsetY={dim.fits ? (readableFlip(angle) > 0 ? fontSize + 2 / scale : -2 / scale) : fontSize / 2}
        rotation={readableRotation(angle)}
        align="center"
        text={text}
        fontSize={fontSize}
        fill="#e2e8f0"
      />
    </Group>
  );
}
