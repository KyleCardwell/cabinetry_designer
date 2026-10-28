import { useMemo, useState } from 'react';
import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { gappedLine } from '../canvas/gappedLine.js';
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
  step: '#fbbf24',
  't-filler': '#fbbf24',
  countertop: '#cbd5e1',
  waterfall: '#cbd5e1',
  overhang: '#cbd5e1',
  clearance: '#cbd5e1',
  molding: '#cbd5e1',
  soffit: '#94a3b8',
  recess: '#a5b4fc',
  'counter-height': '#7dd3fc',
  neighbor: '#94a3b8',
  wall: '#e2e8f0',
};

const FONT_SIZE = 11;
const TICK_HALF_LENGTH = 4;
const WALL_END_TICK_HALF_LENGTH = 6;

function colorFor(segment, highlightRunId) {
  if (segment.violated) return '#f59e0b';
  if (segment.kind === 'run' && highlightRunId
    && (segment.runId === highlightRunId || segment.runIds?.includes(highlightRunId))) return '#38bdf8';
  return KIND_COLORS[segment.kind] ?? '#cbd5e1';
}

export default function DimensionRow({
  segments,
  orientation,
  side,
  offsetPx,
  edgeGapPx = 0,
  transform,
  onSegmentClick,
  onPieceClick,
  onFeatureClick,
  highlightRunId,
  wallEndMarks = [],
  wallLength = 0,
  cursor,
}) {
  const [hoveredHiddenIndex, setHoveredHiddenIndex] = useState(null);
  const cursorKeys = useCursorKeys(cursor);
  const factor = transform.text?.dimension ?? 1;
  const fontSize = FONT_SIZE * factor;
  const layout = useMemo(() => layoutDimensionRow(segments, {
    scale: transform.scale,
    fontSize,
  }), [segments, transform.scale, fontSize]);
  if (segments.length === 0) return null;

  const horizontal = orientation === 'horizontal';
  const outward = side === 'below'
    ? { x: 0, y: 1 }
    : side === 'above'
      ? { x: 0, y: -1 }
      : side === 'right'
        ? { x: 1, y: 0 }
        : { x: -1, y: 0 };
  const axis = horizontal ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const edgePoint = (value) => {
    if (!horizontal) {
      return wallToScreen({ x: side === 'right' ? wallLength : 0, z: value }, transform);
    }
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
  // A gapped row (DM3: the piece row skips open space) puts extension lines at every segment end only.
  const boundaries = [...new Set(segments.flatMap((segment) => [segment.start, segment.end]))]
    .sort((a, b) => a - b);
  const tickDirection = {
    x: (axis.x + outward.x) / Math.SQRT2,
    y: (axis.y + outward.y) / Math.SQRT2,
  };

  return (
    <Group>
      {boundaries.map((value, index) => {
        const edge = edgePoint(value);
        const row = rowPoint(value);
        return (
          <Group key={`${value}:${index}`} listening={false}>
            <Line
              points={[
                edge.x + outward.x * edgeGapPx,
                edge.y + outward.y * edgeGapPx,
                row.x,
                row.y,
              ]}
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
        const feature = segment.kind === 'recess' || segment.kind === 'opening';
        const clickable = (segment.kind === 'run' && Boolean(onSegmentClick))
          || (segment.kind === 'piece' && Boolean(onPieceClick))
          || (feature && Boolean(onFeatureClick));
        const showsHiddenTooltip = label.mode === 'hidden';
        const showsPointerCursor = clickable;
        const linePieces = label.mode === 'inline'
          ? gappedLine(start, end, midpoint, label.width / 2)
          : [[start.x, start.y, end.x, end.y]];
        const labelDistance = label.mode === 'inline' ? 0 : 12 * factor * label.level;
        const labelPoint = rowPoint(midpointValue, labelDistance);
        // -90 puts the text's bottom to the right.
        const rotation = horizontal ? 0 : -90;
        const tooltipPoint = rowPoint(midpointValue, 12 * factor * (layout.levels + 1));
        const hitEvents = {
          onClick: clickable ? (event) => {
            event.cancelBubble = true;
            if (segment.kind === 'piece') {
              onPieceClick(segment, event.target.getStage().getPointerPosition());
            } else if (feature) {
              onFeatureClick(segment);
            } else {
              onSegmentClick(segment);
            }
          } : undefined,
          onMouseEnter: showsHiddenTooltip || showsPointerCursor
            ? () => {
              if (showsHiddenTooltip) setHoveredHiddenIndex(index);
              cursorKeys.request(
                index,
                showsHiddenTooltip ? CURSORS.explain : CURSORS.select,
              );
            }
            : undefined,
          onMouseLeave: showsHiddenTooltip || showsPointerCursor
            ? () => {
              if (showsHiddenTooltip) setHoveredHiddenIndex(null);
              cursorKeys.release(index);
            }
            : undefined,
        };
        const band = horizontal
          ? {
            x: Math.min(start.x, end.x),
            y: start.y - 14 * factor,
            width: Math.abs(end.x - start.x),
            height: 28 * factor,
          }
          : {
            x: start.x - 14 * factor,
            y: Math.min(start.y, end.y),
            width: 28 * factor,
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
          <Group key={`${index}:${segment.kind}:${segment.start}:${segment.end}`}>
            {linePieces.map((points, pieceIndex) => (
              <Line
                key={pieceIndex}
                points={points}
                stroke={color}
                strokeWidth={segment.pinned
                  ? 2.5
                  : segment.kind === 'run' || segment.kind === 'opening' ? 1.5 : 1}
                listening={false}
              />
            ))}

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
                offsetY={fontSize / 2}
                rotation={rotation}
                align="center"
                text={label.text}
                fontSize={fontSize}
                fill={color}
                listening={false}
              />
            )}

            {(clickable || showsHiddenTooltip) && (
              <Rect
                {...band}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
              />
            )}
            {clickable && label.mode !== 'hidden' && (
              <Rect
                x={labelPoint.x}
                y={labelPoint.y}
                width={label.width + 8}
                height={fontSize + 8}
                offsetX={(label.width + 8) / 2}
                offsetY={(fontSize + 8) / 2}
                rotation={rotation}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
              />
            )}
            {clickable && label.mode === 'popout' && (
              <Rect
                {...leader}
                fill="rgba(0,0,0,0.001)"
                {...hitEvents}
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
                  y={-(fontSize + 8) / 2}
                  width={label.width}
                  height={fontSize + 8}
                  fill="#020617"
                  stroke={color}
                  strokeWidth={1}
                  cornerRadius={3}
                />
                <Text
                  x={-label.width / 2}
                  y={-fontSize / 2}
                  width={label.width}
                  align="center"
                  text={label.text}
                  fontSize={fontSize}
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
