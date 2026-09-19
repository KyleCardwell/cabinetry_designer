import { useState } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';
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
}) {
  const [hovered, setHovered] = useState(false);
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
  const centerY = footprint.reduce((sum, point) => sum + point.y, 0) / footprint.length;
  const depthFontSize = 11 / scale;
  const depthText = formatInches(depth);
  const depthTextWidth = (depthText.length * 0.6 * 11 + 8) / scale;
  let depthRotation = Math.atan2(frame.d.y, frame.d.x) * 180 / Math.PI;
  if (depthRotation > 90 || depthRotation < -90) depthRotation += 180;
  const showsDepth = run.width > depthTextWidth;
  const topY = Math.min(...footprint.map((point) => point.y));

  return (
    <Group
      listening={selectable}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      {showsDepth && (
        <Text
          x={centerX}
          y={centerY}
          width={depthTextWidth}
          offsetX={depthTextWidth / 2}
          offsetY={depthFontSize / 2}
          rotation={depthRotation}
          align="center"
          text={depthText}
          fontSize={depthFontSize}
          fill="#e2e8f0"
          listening={false}
        />
      )}
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
