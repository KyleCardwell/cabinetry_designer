import { useMemo, useRef, useState } from 'react';
import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { wallToScreen } from '../canvas/transform.js';

const KIND_COLORS = {
  piece: '#cbd5e1',
  'corner-gap': '#f59e0b',
  open: '#64748b',
  'tall-span': '#64748b',
  gap: '#64748b',
  run: '#e2e8f0',
  opening: '#e2e8f0',
  'toe-kick': '#cbd5e1',
  box: '#cbd5e1',
  countertop: '#cbd5e1',
  clearance: '#cbd5e1',
  molding: '#cbd5e1',
  wall: '#e2e8f0',
};

const FONT_SIZE = 11;
const TICK_HALF_LENGTH = 4;
const WALL_END_TICK_HALF_LENGTH = 6;

function colorFor(segment, highlightRunId) {
  if (segment.violated) return '#f59e0b';
  if (segment.kind === 'run' && segment.runId === highlightRunId) return '#38bdf8';
  return KIND_COLORS[segment.kind] ?? '#cbd5e1';
}

export default function DimensionRow({
  segments,
  orientation,
  side,
  offsetPx,
  transform,
  onSegmentClick,
  highlightRunId,
  wallEndMarks = [],
  draggableRuns = false,
  onSegmentDragStart,
  onSegmentDragMove,
  onSegmentDragEnd,
}) {
  const [hoveredHiddenIndex, setHoveredHiddenIndex] = useState(null);
  const dragMovedRef = useRef(false);
  const layout = useMemo(() => layoutDimensionRow(segments, {
    scale: transform.scale,
    fontSize: FONT_SIZE,
  }), [segments, transform.scale]);
  if (segments.length === 0) return null;

  const horizontal = orientation === 'horizontal';
  const outward = side === 'below'
    ? { x: 0, y: 1 }
    : side === 'above'
      ? { x: 0, y: -1 }
      : { x: -1, y: 0 };
  const axis = horizontal ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const edgePoint = (value) => {
    if (!horizontal) return wallToScreen({ x: 0, z: value }, transform);
    return wallToScreen({
      x: value,
      z: side === 'above' ? transform.wallHeight : 0,
    }, transform);
  };
  const rowPoint = (value, extraOutward = 0) => {
    const edge = edgePoint(value);
    const distance = offsetPx + extraOutward;
    return {
      x: edge.x + outward.x * distance,
      y: edge.y + outward.y * distance,
    };
  };
  const boundaries = [segments[0].start, ...segments.map((segment) => segment.end)];
  const tickDirection = {
    x: (axis.x + outward.x) / Math.SQRT2,
    y: (axis.y + outward.y) / Math.SQRT2,
  };
  const setResizeCursor = (event, cursor) => {
    const stage = event.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };
  const dragDelta = (event, origin) => (horizontal
    ? (event.target.x() - origin.x) / transform.scale
    : -(event.target.y() - origin.y) / transform.scale);
  const dragProps = (segment, origin) => (draggableRuns && segment.kind === 'run' ? {
    draggable: true,
    dragBoundFunc: (position) => (horizontal
      ? { x: position.x, y: origin.y }
      : { x: origin.x, y: position.y }),
    onMouseEnter: (event) => setResizeCursor(event, 'move'),
    onMouseLeave: (event) => setResizeCursor(event, 'default'),
    onDragStart: (event) => {
      event.cancelBubble = true;
      dragMovedRef.current = false;
      onSegmentClick?.(segment);
      onSegmentDragStart?.(segment);
    },
    onDragMove: (event) => {
      event.cancelBubble = true;
      dragMovedRef.current = true;
      onSegmentDragMove?.(segment, dragDelta(event, origin));
    },
    onDragEnd: (event) => {
      event.cancelBubble = true;
      const delta = dragDelta(event, origin);
      event.target.position(origin);
      onSegmentDragEnd?.(segment, delta);
    },
  } : {});

  return (
    <Group>
      {boundaries.map((value, index) => {
        const edge = edgePoint(value);
        const row = rowPoint(value);
        return (
          <Group key={`${value}:${index}`} listening={false}>
            <Line
              points={[edge.x, edge.y, row.x, row.y]}
              stroke="#475569"
              strokeWidth={0.75}
            />
            <Line
              points={[
                row.x - tickDirection.x * TICK_HALF_LENGTH,
                row.y - tickDirection.y * TICK_HALF_LENGTH,
                row.x + tickDirection.x * TICK_HALF_LENGTH,
                row.y + tickDirection.y * TICK_HALF_LENGTH,
              ]}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          </Group>
        );
      })}

      {wallEndMarks.map((value) => {
        const row = rowPoint(value);
        return (
          <Line
            key={`wall-end:${value}`}
            points={[
              row.x - tickDirection.x * WALL_END_TICK_HALF_LENGTH,
              row.y - tickDirection.y * WALL_END_TICK_HALF_LENGTH,
              row.x + tickDirection.x * WALL_END_TICK_HALF_LENGTH,
              row.y + tickDirection.y * WALL_END_TICK_HALF_LENGTH,
            ]}
            stroke="#e2e8f0"
            strokeWidth={2}
            listening={false}
          />
        );
      })}

      {segments.map((segment, index) => {
        const label = layout.labels[index];
        const start = rowPoint(segment.start);
        const end = rowPoint(segment.end);
        const midpointValue = (segment.start + segment.end) / 2;
        const midpoint = rowPoint(midpointValue);
        const color = colorFor(segment, highlightRunId);
        const clickable = segment.kind === 'run' && Boolean(onSegmentClick);
        const showsHiddenTooltip = label.mode === 'hidden';
        const labelDistance = label.mode === 'inline' ? 8 : 12 * label.level;
        const labelPoint = rowPoint(midpointValue, labelDistance);
        const rotation = horizontal ? 0 : -90;
        const tooltipPoint = rowPoint(midpointValue, 12 * (layout.levels + 1));
        const hitEvents = {
          onClick: clickable ? (event) => {
            event.cancelBubble = true;
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }
            onSegmentClick(segment);
          } : undefined,
          onMouseEnter: showsHiddenTooltip
            ? () => setHoveredHiddenIndex(index)
            : undefined,
          onMouseLeave: showsHiddenTooltip
            ? () => setHoveredHiddenIndex(null)
            : undefined,
        };
        const band = horizontal
          ? {
            x: Math.min(start.x, end.x),
            y: start.y - 14,
            width: Math.abs(end.x - start.x),
            height: 28,
          }
          : {
            x: start.x - 14,
            y: Math.min(start.y, end.y),
            width: 28,
            height: Math.abs(end.y - start.y),
          };
        const leader = horizontal
          ? {
            x: midpoint.x - 5,
            y: Math.min(midpoint.y, labelPoint.y),
            width: 10,
            height: Math.abs(labelPoint.y - midpoint.y),
          }
          : {
            x: Math.min(midpoint.x, labelPoint.x),
            y: midpoint.y - 5,
            width: Math.abs(labelPoint.x - midpoint.x),
            height: 10,
          };

        return (
          <Group key={`${segment.kind}:${segment.start}:${segment.end}`}>
            <Line
              points={[start.x, start.y, end.x, end.y]}
              stroke={color}
              strokeWidth={segment.pinned
                ? 2.5
                : segment.kind === 'run' || segment.kind === 'opening' ? 1.5 : 1}
              listening={false}
            />

            {label.mode === 'popout' && (
              <Line
                points={[midpoint.x, midpoint.y, labelPoint.x, labelPoint.y]}
                stroke={color}
                strokeWidth={0.75}
                listening={false}
              />
            )}

            {label.mode !== 'hidden' && (
              <Text
                x={labelPoint.x}
                y={labelPoint.y}
                width={label.width}
                offsetX={label.width / 2}
                offsetY={FONT_SIZE / 2}
                rotation={rotation}
                align="center"
                text={label.text}
                fontSize={FONT_SIZE}
                fill={color}
                listening={false}
              />
            )}

            {(clickable || showsHiddenTooltip) && (
              <Rect
                {...band}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
                {...dragProps(segment, { x: band.x, y: band.y })}
              />
            )}
            {clickable && label.mode !== 'hidden' && (
              <Rect
                x={labelPoint.x}
                y={labelPoint.y}
                width={label.width + 8}
                height={FONT_SIZE + 8}
                offsetX={(label.width + 8) / 2}
                offsetY={(FONT_SIZE + 8) / 2}
                rotation={rotation}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
                {...dragProps(segment, { x: labelPoint.x, y: labelPoint.y })}
              />
            )}
            {clickable && label.mode === 'popout' && (
              <Rect
                {...leader}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
                {...dragProps(segment, { x: leader.x, y: leader.y })}
              />
            )}

            {hoveredHiddenIndex === index && (
              <Group
                x={tooltipPoint.x}
                y={tooltipPoint.y}
                rotation={rotation}
                listening={false}
              >
                <Rect
                  x={-label.width / 2}
                  y={-(FONT_SIZE + 8) / 2}
                  width={label.width}
                  height={FONT_SIZE + 8}
                  fill="#020617"
                  stroke={color}
                  strokeWidth={1}
                  cornerRadius={3}
                />
                <Text
                  x={-label.width / 2}
                  y={-FONT_SIZE / 2}
                  width={label.width}
                  align="center"
                  text={label.text}
                  fontSize={FONT_SIZE}
                  fill="#f8fafc"
                />
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
