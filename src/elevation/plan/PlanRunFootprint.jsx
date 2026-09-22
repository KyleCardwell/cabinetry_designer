import { useState } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import {
  CABINET_TYPE_COLORS,
  CABINET_TYPE_IDS,
  KIND_COLORS,
} from '../model/constants.js';
import { frontDepth } from '../model/corners.js';
import { elevationToPlan } from '../model/geometry.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from '../model/room.js';
import { runFootprint } from '../model/footprints.js';
import { splitRun } from '../model/splitRun.js';
import { formatInches } from '../model/units.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';
import { depthDimension } from './depthDimension.js';
import { readableFlip, readableRotation } from './textRotation.js';

const DEPTH_TICK_HALF_LENGTH = 4;

function linePoints(points) {
  return points.flatMap((point) => [point.x, point.y]);
}

function footprintOutlineSegments(frame, run, depth) {
  const start = run.x;
  const end = run.x + run.width;
  const ranges = [
    { start, end: Math.min(end, 0), overhang: true },
    { start: Math.max(start, 0), end: Math.min(end, frame.length), overhang: false },
    { start: Math.max(start, frame.length), end, overhang: true },
  ].filter((range) => range.end - range.start > 1e-9);
  const segments = ranges.flatMap((range) => [
    {
      points: [
        elevationToPlan(frame, range.start, 0),
        elevationToPlan(frame, range.end, 0),
      ],
      overhang: range.overhang,
    },
    {
      points: [
        elevationToPlan(frame, range.start, depth),
        elevationToPlan(frame, range.end, depth),
      ],
      overhang: range.overhang,
    },
  ]);
  for (const x of [start, end]) {
    segments.push({
      points: [elevationToPlan(frame, x, 0), elevationToPlan(frame, x, depth)],
      overhang: x < 0 || x > frame.length,
    });
  }
  return segments;
}

export default function PlanRunFootprint({
  frame,
  room,
  wall,
  run,
  settings,
  collision,
  collisionMessage,
  selected,
  selectable,
  scale,
  onSelect,
  cursor,
}) {
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const footprint = runFootprint(frame, run, settings);
  const layout = splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, frame.length, settings),
  });
  const depth = frontDepth(run, settings);
  const upper = run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const color = CABINET_TYPE_COLORS[run.cabinetTypeId] ?? KIND_COLORS.cabinet;
  const outline = collision ? '#ef4444' : selected ? '#f8fafc' : color;
  const outlineSegments = footprintOutlineSegments(frame, run, depth);
  const boundaryPieces = layout.pieces.slice(1).filter(
    (piece) => piece.x > run.x && piece.x < run.x + run.width,
  );
  const centerX = footprint.reduce((sum, point) => sum + point.x, 0) / footprint.length;
  const depthFontSize = PLAN_DIM_FONT_SIZE / scale;
  const depthText = formatInches(depth);
  const depthTextWidth = (depthText.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) / scale;
  const dim = depthDimension(run, depth, scale);
  const dimensionBack = elevationToPlan(frame, dim.x, 0);
  const dimensionFront = elevationToPlan(frame, dim.x, depth);
  const depthLabelLocation = elevationToPlan(frame, dim.label.x, dim.label.offset);
  const tickHalf = DEPTH_TICK_HALF_LENGTH / scale;
  const tickDirection = {
    x: (frame.n.x + frame.r.x) / Math.SQRT2,
    y: (frame.n.y + frame.r.y) / Math.SQRT2,
  };
  const depthAngle = Math.atan2(frame.n.y, frame.n.x) * 180 / Math.PI;
  const depthRotation = readableRotation(depthAngle);
  const depthFlip = readableFlip(depthAngle);
  const topY = Math.min(...footprint.map((point) => point.y));

  return (
    <Group
      listening={selectable}
      onMouseEnter={() => {
        setHovered(true);
        cursorKeys.request(run.id, CURSORS.select);
      }}
      onMouseLeave={() => {
        setHovered(false);
        cursorKeys.release(run.id);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(event);
      }}
    >
      <Line
        points={linePoints(footprint)}
        closed
        fill={upper ? `${color}59` : `${color}8c`}
        hitStrokeWidth={8 / scale}
      />
      {outlineSegments.map((segment, index) => (
        <Line
          key={`outline:${index}`}
          points={linePoints(segment.points)}
          stroke={outline}
          strokeWidth={(collision || selected ? 2.5 : 1.5) / scale}
          dash={segment.overhang
            ? [2 / scale, 2 / scale]
            : upper ? [5 / scale, 3 / scale] : undefined}
          listening={false}
        />
      ))}
      {boundaryPieces.map((piece) => {
        const face = elevationToPlan(frame, piece.x, 0);
        const front = elevationToPlan(frame, piece.x, depth);
        return (
          <Line
            key={piece.id}
            points={[face.x, face.y, front.x, front.y]}
            stroke={KIND_COLORS[piece.kind] ?? '#cbd5e1'}
            strokeWidth={0.75 / scale}
            opacity={0.9}
            dash={piece.x < 0 || piece.x > frame.length
              ? [2 / scale, 2 / scale]
              : undefined}
            listening={false}
          />
        );
      })}
      <Line
        points={[dimensionBack.x, dimensionBack.y, dimensionFront.x, dimensionFront.y]}
        stroke="#e2e8f0"
        strokeWidth={1 / scale}
        listening={false}
      />
      {[dimensionBack, dimensionFront].map((point, index) => (
        <Line
          key={`depth-tick:${index}`}
          points={[
            point.x - tickDirection.x * tickHalf,
            point.y - tickDirection.y * tickHalf,
            point.x + tickDirection.x * tickHalf,
            point.y + tickDirection.y * tickHalf,
          ]}
          stroke="#e2e8f0"
          strokeWidth={1 / scale}
          listening={false}
        />
      ))}
      {dim.leader && (
        <Line
          points={linePoints([
            elevationToPlan(frame, dim.leader.x1, dim.leader.offset),
            elevationToPlan(frame, dim.leader.x2, dim.leader.offset),
          ])}
          stroke="#64748b"
          strokeWidth={0.75 / scale}
          listening={false}
        />
      )}
      <Text
        x={depthLabelLocation.x}
        y={depthLabelLocation.y}
        width={depthTextWidth}
        offsetX={depthTextWidth / 2}
        offsetY={dim.fits
          ? (depthFlip > 0 ? depthFontSize + 2 / scale : -2 / scale)
          : depthFontSize / 2}
        rotation={depthRotation}
        align="center"
        text={depthText}
        fontSize={depthFontSize}
        fill="#e2e8f0"
        listening={false}
      />
      {collision && hovered && collisionMessage && (
        <Label
          x={centerX}
          y={topY - 5 / scale}
          opacity={0.98}
          listening={false}
        >
          <Tag
            fill="#020617"
            stroke="#ef4444"
            strokeWidth={1 / scale}
            cornerRadius={3 / scale}
            pointerDirection="down"
            pointerWidth={7 / scale}
            pointerHeight={5 / scale}
          />
          <Text
            width={230 / scale}
            text={collisionMessage}
            align="center"
            fill="#fecaca"
            fontSize={11 / scale}
            padding={6 / scale}
          />
        </Label>
      )}
    </Group>
  );
}
