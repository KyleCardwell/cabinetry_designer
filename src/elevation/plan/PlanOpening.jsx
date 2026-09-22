import { useRef } from 'react';
import { Group, Line, Text } from 'react-konva';
import {
  dot,
  elevationToPlan,
  subtract,
} from '../model/geometry.js';
import {
  openingGeometry,
  openingReferenceBounds,
} from '../model/openings.js';
import { formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';

function linePoints(points) {
  return points.flatMap((point) => [point.x, point.y]);
}

function readableRotation(frame) {
  let rotation = Math.atan2(frame.r.y, frame.r.x) * 180 / Math.PI;
  if (rotation > 90 || rotation < -90) rotation += 180;
  return rotation;
}

export default function PlanOpening({
  room,
  wall,
  frame,
  opening,
  settings,
  selected,
  selectable,
  scale,
  onSelect,
  onMove,
}) {
  void room;
  const dragStartRef = useRef(null);
  const geometry = openingGeometry(opening, frame.length, settings);
  const { jamb, casing } = geometry;
  const referenceX = geometry.offsets.left[opening.measureMode].edge;
  const range = openingReferenceBounds(opening, frame.length, settings);
  const voidPolygon = [
    elevationToPlan(frame, jamb.x, 0),
    elevationToPlan(frame, jamb.x + jamb.width, 0),
    elevationToPlan(frame, jamb.x + jamb.width, -wall.thickness),
    elevationToPlan(frame, jamb.x, -wall.thickness),
  ];
  const jambLines = [jamb.x, jamb.x + jamb.width].map((x) => [
    elevationToPlan(frame, x, 0),
    elevationToPlan(frame, x, -wall.thickness),
  ]);
  const detailOffset = opening.kind === 'window' ? -wall.thickness / 2 : 0;
  const detailLine = [
    elevationToPlan(frame, jamb.x, detailOffset),
    elevationToPlan(frame, jamb.x + jamb.width, detailOffset),
  ];
  const casingPolygon = casing ? [
    elevationToPlan(frame, casing.x, 0),
    elevationToPlan(frame, casing.x + casing.width, 0),
    elevationToPlan(frame, casing.x + casing.width, casing.thickness),
    elevationToPlan(frame, casing.x, casing.thickness),
  ] : null;
  const labelOffset = (casing?.thickness ?? 0) + 12 / scale;
  const labelPoint = elevationToPlan(
    frame,
    jamb.x + jamb.width / 2,
    labelOffset,
  );
  const selectedStroke = selected ? '#f8fafc' : '#e2e8f0';
  const selectedWidth = (selected ? 2.5 : 1) / scale;
  const draggable = selected && selectable && Boolean(onMove);

  const stopEvent = (event) => {
    event.cancelBubble = true;
  };

  const constrainedPosition = (position) => {
    const start = dragStartRef.current;
    if (!start) return position;
    const requestedDelta = dot(subtract(position, start), frame.r) / scale;
    const nextX = Math.min(range.max, Math.max(range.min, referenceX + requestedDelta));
    const deltaPixels = (nextX - referenceX) * scale;
    return {
      x: start.x + frame.r.x * deltaPixels,
      y: start.y + frame.r.y * deltaPixels,
    };
  };

  return (
    <Group
      listening={selectable}
      draggable={draggable}
      dragBoundFunc={constrainedPosition}
      onMouseDown={stopEvent}
      onClick={(event) => {
        stopEvent(event);
        onSelect?.(event, opening.id);
      }}
      onMouseEnter={(event) => {
        event.target.getStage().container().style.cursor = draggable ? 'move' : 'pointer';
      }}
      onMouseLeave={(event) => {
        event.target.getStage().container().style.cursor = 'default';
      }}
      onDragStart={(event) => {
        stopEvent(event);
        dragStartRef.current = event.target.absolutePosition();
        onSelect?.(event, opening.id);
      }}
      onDragEnd={(event) => {
        stopEvent(event);
        const start = dragStartRef.current;
        const end = event.target.absolutePosition();
        const delta = start ? dot(subtract(end, start), frame.r) / scale : 0;
        const nextX = Math.min(range.max, Math.max(range.min, referenceX + delta));
        event.target.position({ x: 0, y: 0 });
        event.target.getLayer()?.batchDraw();
        dragStartRef.current = null;
        onMove?.(nextX);
      }}
    >
      <Line
        points={linePoints(voidPolygon)}
        closed
        fill={PLAN_BACKGROUND_COLOR}
      />
      {jambLines.map((points, index) => (
        <Line
          key={index}
          points={linePoints(points)}
          stroke={selectedStroke}
          strokeWidth={selectedWidth}
          listening={false}
        />
      ))}
      <Line
        points={linePoints(detailLine)}
        stroke={opening.kind === 'window' ? '#7dd3fc' : '#e2e8f0'}
        strokeWidth={(opening.kind === 'window' ? 1.25 : 1) / scale}
        listening={false}
      />
      {casingPolygon && (
        <Line
          points={linePoints(casingPolygon)}
          closed
          fill="#a8a29e"
          opacity={0.9}
          stroke={selected ? '#f8fafc' : '#e7e5e4'}
          strokeWidth={selectedWidth}
        />
      )}
      <Text
        x={labelPoint.x}
        y={labelPoint.y}
        width={120 / scale}
        offsetX={60 / scale}
        offsetY={5.5 / scale}
        align="center"
        rotation={readableRotation(frame)}
        text={`${opening.label} · ${formatInches(jamb.width)}`}
        fontSize={PLAN_DIM_FONT_SIZE / scale}
        fill="#e2e8f0"
        listening={false}
      />
    </Group>
  );
}
