import { useState } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { gappedLine } from '../canvas/gappedLine.js';
import {
  CABINET_TYPE_COLORS,
  CABINET_TYPE_IDS,
  KIND_COLORS,
} from '../model/constants.js';
import { frontDepth } from '../model/corners.js';
import { runFaceLayouts } from '../model/faceLayouts.js';
import { elevationToPlan, planPointToWallX } from '../model/geometry.js';
import { planRunPieces } from '../model/planPieces.js';
import { splitOptionsForRun } from '../model/index.js';
import { splitRun } from '../model/splitRun.js';
import { formatDimension } from '../model/units.js';
import { wallSideFrame } from '../model/wallSides.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { depthDimension } from './depthDimension.js';
import PlanLegs from './PlanLegs.jsx';
import { readableRotation } from './textRotation.js';

const DEPTH_TICK_HALF_LENGTH = 4;

function linePoints(points) {
  return points.flatMap((point) => [point.x, point.y]);
}

function footprintOutlineSegments(frame, span, back, front) {
  const start = span.x;
  const end = span.x + span.width;
  const ranges = [
    { start, end: Math.min(end, 0), overhang: true },
    { start: Math.max(start, 0), end: Math.min(end, frame.length), overhang: false },
    { start: Math.max(start, frame.length), end, overhang: true },
  ].filter((range) => range.end - range.start > 1e-9);
  const segments = ranges.flatMap((range) => [
    {
      points: [
        elevationToPlan(frame, range.start, back),
        elevationToPlan(frame, range.end, back),
      ],
      overhang: range.overhang,
    },
    {
      points: [
        elevationToPlan(frame, range.start, front),
        elevationToPlan(frame, range.end, front),
      ],
      overhang: range.overhang,
    },
  ]);
  for (const x of [start, end]) {
    segments.push({
      points: [elevationToPlan(frame, x, back), elevationToPlan(frame, x, front)],
      overhang: x < 0 || x > frame.length,
    });
  }
  return segments;
}

function depthRangePoints(frame, range) {
  return [
    elevationToPlan(frame, range.start, range.back),
    elevationToPlan(frame, range.end, range.back),
    elevationToPlan(frame, range.end, range.front),
    elevationToPlan(frame, range.start, range.front),
  ];
}

function planPiecePoints(frame, piece) {
  return piece.polygon
    ? piece.polygon.map(([u, v]) => elevationToPlan(frame, u, v))
    : depthRangePoints(frame, piece);
}

function runDepthLayout(run, settings, scale, text, x) {
  const factor = text?.label ?? 1;
  // From the plane the run sits on (SPEC-38): the wall face, or a recess back.
  const planeBack = run._plane?.offset ?? 0;
  const depth = frontDepth(run, settings) - planeBack;
  const dim = depthDimension(run, depth, scale, PLAN_DIM_FONT_SIZE * factor, x);
  return { planeBack, depth, dim };
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
  text,
  onSelect,
  onContextMenu,
  cursor,
}) {
  const factor = text?.label ?? 1;
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const layout = splitRun(run, settings, splitOptionsForRun(room, wall, run, settings));
  const faceLayouts = runFaceLayouts(room, wall, run, settings, layout);
  const { span, boxes, faces, returns, waterfallLegs = [] } = planRunPieces(
    room,
    wall,
    run,
    settings,
    layout,
    faceLayouts,
  );
  const upper = run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const color = CABINET_TYPE_COLORS[run.cabinetTypeId] ?? KIND_COLORS.cabinet;
  const outline = collision ? '#ef4444' : selected ? '#f8fafc' : color;
  const collisionAnchor = elevationToPlan(frame, (span.start + span.end) / 2, 0);

  return (
    <Group
      listening={selectable}
      onContextMenu={(event) => {
        event.cancelBubble = true;
        onContextMenu?.(event);
      }}
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
      {[...boxes, ...faces, ...returns].map((piece) => (
        <Line
          key={`backdrop:${piece.key}`}
          points={linePoints(planPiecePoints(frame, piece))}
          closed
          fill={PLAN_BACKGROUND_COLOR}
          listening={false}
        />
      ))}
      {boxes.map((box) => (
        !box.dashed && (
          <Line
            key={box.key}
            points={linePoints(planPiecePoints(frame, box))}
            closed
            fill={upper ? `${color}59` : `${color}8c`}
            hitStrokeWidth={8 / scale}
          />
        )
      ))}
      {boxes.flatMap((box) => (
        box.polygon ? (
          <Line
            key={`${box.key}:outline`}
            points={linePoints(planPiecePoints(frame, box))}
            closed
            stroke={outline}
            strokeWidth={(collision || selected ? 2.5 : 1.5) / scale}
            {...(box.dashed ? { dash: [4 / scale, 3 / scale] } : {})}
            listening={false}
          />
        ) : footprintOutlineSegments(
          frame,
          { x: box.start, width: box.end - box.start },
          box.back,
          box.front,
        ).map((segment, index) => (
          <Line
            key={`${box.key}:outline:${index}`}
            points={linePoints(segment.points)}
            stroke={outline}
            strokeWidth={(collision || selected ? 2.5 : 1.5) / scale}
            {...(box.dashed
              ? { dash: [4 / scale, 3 / scale] }
              : segment.overhang ? { dash: [2 / scale, 2 / scale] } : {})}
            listening={false}
          />
        ))
      ))}
      {returns.map((range) => (
        <Line
          key={range.key}
          points={linePoints(planPiecePoints(frame, range))}
          closed
          fill={upper ? `${KIND_COLORS.filler}59` : `${KIND_COLORS.filler}8c`}
          stroke={KIND_COLORS.filler}
          strokeWidth={0.75 / scale}
          listening={false}
        />
      ))}
      {faces.map((range) => {
        const faceColor = range.kind === 'filler'
          ? KIND_COLORS.filler
          : ['end_panel', 'panel'].includes(range.kind) ? KIND_COLORS.end_panel : color;
        return (
          <Line
            key={range.key}
            points={linePoints(planPiecePoints(frame, range))}
            closed
            fill={upper ? `${faceColor}59` : `${faceColor}8c`}
            stroke={outline}
            strokeWidth={0.75 / scale}
          />
        );
      })}
      {waterfallLegs.map((leg) => (
        <Line
          key={leg.key}
          points={linePoints(planPiecePoints(frame, leg))}
          closed
          fill="#cbd5e18c"
          stroke={outline}
          strokeWidth={0.75 / scale}
          hitStrokeWidth={8 / scale}
        />
      ))}
      <PlanLegs room={room} wall={wall} run={run} settings={settings}
        frame={frame} scale={scale} stroke={outline}
        onSelect={(event) => {
          event.cancelBubble = true;
          onSelect(event, { runId: run.id, wallId: wall.id });
        }} />
      {collision && hovered && collisionMessage && (
        <Label
          x={collisionAnchor.x}
          y={collisionAnchor.y - 5 / scale}
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
            width={230 * factor / scale}
            text={collisionMessage}
            align="center"
            fill="#fecaca"
            fontSize={11 * factor / scale}
            padding={6 * factor / scale}
          />
        </Label>
      )}
    </Group>
  );
}

export function PlanRunDepth({ frame, room, wall, run, position, depthLabels, settings, scale, text }) {
  if (!position || (position.pair && position.pair.front !== run.id)) return null;
  const factor = text?.label ?? 1;
  const depthFontSize = PLAN_DIM_FONT_SIZE * factor / scale;
  const entries = [{ frame, run, x: position.x }];
  if (position.pair) {
    const backFrame = wallSideFrame(room, wall, 'back');
    entries.unshift({
      frame: backFrame,
      run: wall.runs.find(({ id }) => id === position.pair.back),
      x: planPointToWallX(backFrame, elevationToPlan(frame, position.x, 0)),
    });
  }
  const segments = entries.map(({ frame, run, x }) => {
    const layout = runDepthLayout(run, settings, scale, text, x);
    const { planeBack, depth } = layout;
    const dim = depthLabels?.get(run.id) ?? layout.dim;
    const depthText = formatDimension(depth);
    const depthTextWidth = (depthText.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) * factor / scale;
    return {
      frame, run, planeBack, dim, depthText, depthTextWidth,
      back: elevationToPlan(frame, x, planeBack),
      front: elevationToPlan(frame, x, planeBack + depth),
      label: elevationToPlan(frame, dim.label.x, planeBack + dim.label.offset),
    };
  });
  const dimensionBack = position.pair ? segments[0].front : segments[0].back;
  const dimensionFront = segments.at(-1).front;
  const ticks = position.pair
    ? [dimensionBack, elevationToPlan(segments[0].frame, entries[0].x, 0),
      ...(wall.thickness > 0 ? [elevationToPlan(frame, position.x, 0)] : []), dimensionFront]
    : [dimensionBack, dimensionFront];
  // Ticks grow with the depth text, which follows text.label (TX1).
  const tickHalf = DEPTH_TICK_HALF_LENGTH * factor / scale;
  const tickDirection = {
    x: (frame.n.x + frame.r.x) / Math.SQRT2,
    y: (frame.n.y + frame.r.y) / Math.SQRT2,
  };
  let depthLinePieces = [linePoints([dimensionBack, dimensionFront])];
  for (const segment of segments.filter(({ dim }) => dim.fits)) {
    depthLinePieces = depthLinePieces.flatMap(([x1, y1, x2, y2]) => gappedLine(
      { x: x1, y: y1 }, { x: x2, y: y2 }, segment.label, segment.depthTextWidth / 2, 0.5 / scale,
    ));
  }

  return (
    <Group listening={false}>
      {depthLinePieces.map((points, index) => (
        <Line
          key={`depth-line:${index}`}
          points={points}
          stroke="#e2e8f0"
          strokeWidth={1 / scale}
          listening={false}
        />
      ))}
      {ticks.map((point, index) => (
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
      {segments.map(({ frame, run, planeBack, dim }) => dim.leader && (
        <Line
          key={`depth-leader:${run.id}`}
          points={linePoints([
            elevationToPlan(frame, dim.leader.x1, planeBack + dim.leader.offset),
            elevationToPlan(frame, dim.leader.x2, planeBack + dim.leader.offset),
          ])}
          stroke="#64748b"
          strokeWidth={0.75 / scale}
          listening={false}
        />
      ))}
      {segments.map(({ frame, run, label, depthText, depthTextWidth }) => (
        <Text
          key={`depth-text:${run.id}`}
          x={label.x}
          y={label.y}
          width={depthTextWidth}
          offsetX={depthTextWidth / 2}
          offsetY={depthFontSize / 2}
          rotation={readableRotation(Math.atan2(frame.n.y, frame.n.x) * 180 / Math.PI)}
          align="center"
          text={depthText}
          fontSize={depthFontSize}
          fill="#e2e8f0"
          listening={false}
        />
      ))}
    </Group>
  );
}
