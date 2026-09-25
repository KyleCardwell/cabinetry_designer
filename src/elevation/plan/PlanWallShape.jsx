import { Circle, Group, Line, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { wallFrame } from '../model/geometry.js';
import { landingsOn } from '../model/landings.js';
import { wallNumbers } from '../model/topology.js';
import { wallOutline } from '../model/wallOutline.js';
import { wallSideFrame, wallSideView } from '../model/wallSides.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

export default function PlanWallShape({
  room,
  wall,
  isSelected,
  scale,
  onSelect,
  onOpen,
  cursor,
}) {
  const cursorKeys = useCursorKeys(cursor);
  const frame = wallFrame(room, wall);
  if (frame.length === 0) return null;

  const outline = wallOutline(room, wall);
  const exterior = { x: -frame.n.x, y: -frame.n.y };
  const midpoint = {
    x: (wall.x1 + wall.x2) / 2,
    y: (wall.y1 + wall.y2) / 2,
  };
  const tickLength = 8 / scale;
  const fontSize = PLAN_DIM_FONT_SIZE / scale;
  const number = wallNumbers(room).get(wall.id);
  const numberRadius = 9 / scale;
  const hasFrontLandings = landingsOn(room, wallSideView(wall, 'front')).length > 0;
  const innerRowOffset = wall.thickness + 22 / scale;
  const dimensionOffset = innerRowOffset + (hasFrontLandings ? 20 / scale : 0);
  const extensionEndOffset = dimensionOffset + 4 / scale;
  const numberOffset = dimensionOffset + 24 / scale;
  const numberPoint = {
    x: midpoint.x + exterior.x * numberOffset + frame.d.x * 24 / scale,
    y: midpoint.y + exterior.y * numberOffset + frame.d.y * 24 / scale,
  };
  const extensionStartOffset = wall.thickness + 2 / scale;
  const faceEndpoints = [
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 },
  ];
  const dimensionEndpoints = faceEndpoints.map((point) => ({
    x: point.x + exterior.x * dimensionOffset,
    y: point.y + exterior.y * dimensionOffset,
  }));
  const tickDirection = {
    x: (frame.d.x + exterior.x) / Math.SQRT2,
    y: (frame.d.y + exterior.y) / Math.SQRT2,
  };
  const tickHalfLength = 4 / scale;
  const layout = layoutDimensionRow(
    [{ start: 0, end: frame.length }],
    { scale, fontSize: PLAN_DIM_FONT_SIZE },
  );
  const dimensionLabel = layout.labels[0];
  const labelDistance = (dimensionLabel.mode === 'popout'
    ? 10 + 14 * dimensionLabel.level
    : 10) / scale;
  const dimensionCenter = {
    x: midpoint.x + exterior.x * dimensionOffset,
    y: midpoint.y + exterior.y * dimensionOffset,
  };
  const labelPoint = {
    x: dimensionCenter.x + exterior.x * labelDistance,
    y: dimensionCenter.y + exterior.y * labelDistance,
  };
  const labelRotation = readableRotation(
    Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI,
  );
  const landingRows = ['front', 'back'].flatMap((side) => {
    const sideView = wallSideView(wall, side);
    const intervals = landingsOn(room, sideView);
    if (intervals.length === 0) return [];
    const sideFrame = wallSideFrame(room, wall, side);
    const outward = side === 'front' ? exterior : frame.n;
    const offset = side === 'front' ? innerRowOffset : innerRowOffset + 20 / scale;
    const segments = [];
    let cursor = 0;
    intervals.forEach(({ a, b }) => {
      segments.push({ start: cursor, end: a });
      segments.push({ start: a, end: b });
      cursor = b;
    });
    segments.push({ start: cursor, end: sideFrame.length });
    const rowLayout = layoutDimensionRow(segments, {
      scale,
      fontSize: PLAN_DIM_FONT_SIZE,
    });
    const rowStart = {
      x: sideFrame.leftPoint.x + outward.x * offset,
      y: sideFrame.leftPoint.y + outward.y * offset,
    };
    const rowEnd = {
      x: sideFrame.rightPoint.x + outward.x * offset,
      y: sideFrame.rightPoint.y + outward.y * offset,
    };
    const rowTickDirection = {
      x: (sideFrame.r.x + outward.x) / Math.SQRT2,
      y: (sideFrame.r.y + outward.y) / Math.SQRT2,
    };
    const rowRotation = readableRotation(
      Math.atan2(sideFrame.r.y, sideFrame.r.x) * 180 / Math.PI,
    );
    return [{
      side,
      sideFrame,
      outward,
      offset,
      segments,
      layout: rowLayout,
      rowStart,
      rowEnd,
      tickDirection: rowTickDirection,
      rotation: rowRotation,
    }];
  });

  return (
    <Group
      onClick={onSelect}
      onDblClick={onOpen}
      onMouseEnter={() => cursorKeys.request(wall.id, CURSORS.select)}
      onMouseLeave={() => cursorKeys.release(wall.id)}
    >
      <Line
        points={outline.flatMap((point) => [point.x, point.y])}
        closed
        fill={isSelected ? '#60a5fa' : '#6b7280'}
        opacity={0.85}
        hitStrokeWidth={8 / scale}
      />
      <Line
        points={[wall.x1, wall.y1, wall.x2, wall.y2]}
        stroke={isSelected ? '#bfdbfe' : '#d1d5db'}
        strokeWidth={(wall.thickness === 0 ? 2 : 1) / scale}
        hitStrokeWidth={wall.thickness === 0 ? 8 / scale : undefined}
        listening={wall.thickness === 0}
      />
      <Line
        points={[
          midpoint.x,
          midpoint.y,
          midpoint.x + frame.n.x * tickLength,
          midpoint.y + frame.n.y * tickLength,
        ]}
        stroke="#22d3ee"
        strokeWidth={1.5 / scale}
        listening={false}
      />
      <Group listening={false}>
        <Line
          points={dimensionEndpoints.flatMap((point) => [point.x, point.y])}
          stroke="#94a3b8"
          strokeWidth={1 / scale}
        />
        {faceEndpoints.map((point, index) => {
          const extensionStart = {
            x: point.x + exterior.x * extensionStartOffset,
            y: point.y + exterior.y * extensionStartOffset,
          };
          const extensionEnd = {
            x: point.x + exterior.x * extensionEndOffset,
            y: point.y + exterior.y * extensionEndOffset,
          };
          const dimensionPoint = dimensionEndpoints[index];
          return (
            <Group key={index}>
              <Line
                points={[
                  extensionStart.x,
                  extensionStart.y,
                  extensionEnd.x,
                  extensionEnd.y,
                ]}
                stroke="#64748b"
                strokeWidth={0.75 / scale}
              />
              <Line
                points={[
                  dimensionPoint.x - tickDirection.x * tickHalfLength,
                  dimensionPoint.y - tickDirection.y * tickHalfLength,
                  dimensionPoint.x + tickDirection.x * tickHalfLength,
                  dimensionPoint.y + tickDirection.y * tickHalfLength,
                ]}
                stroke="#cbd5e1"
                strokeWidth={1 / scale}
              />
            </Group>
          );
        })}
        {dimensionLabel.mode === 'popout' && (
          <Line
            points={[
              dimensionCenter.x,
              dimensionCenter.y,
              labelPoint.x,
              labelPoint.y,
            ]}
            stroke="#64748b"
            strokeWidth={0.75 / scale}
          />
        )}
        <Text
          x={labelPoint.x}
          y={labelPoint.y}
          width={dimensionLabel.width / scale}
          offsetX={dimensionLabel.width / scale / 2}
          offsetY={fontSize / 2}
          rotation={labelRotation}
          align="center"
          text={dimensionLabel.text}
          fontSize={fontSize}
          fill="#e2e8f0"
        />
      </Group>
      {landingRows.map((row) => {
        const boundaries = [
          row.segments[0].start,
          ...row.segments.map((segment) => segment.end),
        ];
        return (
          <Group key={row.side} listening={false}>
            <Line
              points={[row.rowStart.x, row.rowStart.y, row.rowEnd.x, row.rowEnd.y]}
              stroke="#94a3b8"
              strokeWidth={1 / scale}
            />
            {boundaries.map((boundary, index) => {
              const facePoint = {
                x: row.sideFrame.leftPoint.x + row.sideFrame.r.x * boundary,
                y: row.sideFrame.leftPoint.y + row.sideFrame.r.y * boundary,
              };
              const extensionStart = {
                x: facePoint.x + row.outward.x * 2 / scale,
                y: facePoint.y + row.outward.y * 2 / scale,
              };
              const extensionEnd = {
                x: facePoint.x + row.outward.x * (row.offset + 4 / scale),
                y: facePoint.y + row.outward.y * (row.offset + 4 / scale),
              };
              const dimensionPoint = {
                x: facePoint.x + row.outward.x * row.offset,
                y: facePoint.y + row.outward.y * row.offset,
              };
              return (
                <Group key={`${row.side}:${boundary}:${index}`}>
                  <Line
                    points={[
                      extensionStart.x,
                      extensionStart.y,
                      extensionEnd.x,
                      extensionEnd.y,
                    ]}
                    stroke="#64748b"
                    strokeWidth={0.75 / scale}
                  />
                  <Line
                    points={[
                      dimensionPoint.x - row.tickDirection.x * tickHalfLength,
                      dimensionPoint.y - row.tickDirection.y * tickHalfLength,
                      dimensionPoint.x + row.tickDirection.x * tickHalfLength,
                      dimensionPoint.y + row.tickDirection.y * tickHalfLength,
                    ]}
                    stroke="#cbd5e1"
                    strokeWidth={1 / scale}
                  />
                </Group>
              );
            })}
            {row.layout.labels.map((rowLabel, index) => {
              if (rowLabel.mode === 'hidden') return null;
              const segment = row.segments[index];
              const centerX = (segment.start + segment.end) / 2;
              const dimensionPoint = {
                x: row.sideFrame.leftPoint.x
                  + row.sideFrame.r.x * centerX
                  + row.outward.x * row.offset,
                y: row.sideFrame.leftPoint.y
                  + row.sideFrame.r.y * centerX
                  + row.outward.y * row.offset,
              };
              const rowLabelDistance = (rowLabel.mode === 'popout'
                ? 10 + 14 * rowLabel.level
                : 10) / scale;
              const rowLabelPoint = {
                x: dimensionPoint.x + row.outward.x * rowLabelDistance,
                y: dimensionPoint.y + row.outward.y * rowLabelDistance,
              };
              return (
                <Group key={`${row.side}:label:${index}`}>
                  {rowLabel.mode === 'popout' && (
                    <Line
                      points={[
                        dimensionPoint.x,
                        dimensionPoint.y,
                        rowLabelPoint.x,
                        rowLabelPoint.y,
                      ]}
                      stroke="#64748b"
                      strokeWidth={0.75 / scale}
                    />
                  )}
                  <Text
                    x={rowLabelPoint.x}
                    y={rowLabelPoint.y}
                    width={rowLabel.width / scale}
                    offsetX={rowLabel.width / scale / 2}
                    offsetY={fontSize / 2}
                    rotation={row.rotation}
                    align="center"
                    text={rowLabel.text}
                    fontSize={fontSize}
                    fill="#e2e8f0"
                  />
                </Group>
              );
            })}
          </Group>
        );
      })}
      <Circle
        x={numberPoint.x}
        y={numberPoint.y}
        radius={numberRadius}
        fill="#111827"
        stroke={isSelected ? '#93c5fd' : '#cbd5e1'}
        strokeWidth={1 / scale}
        listening={false}
      />
      <Text
        x={numberPoint.x - numberRadius}
        y={numberPoint.y - numberRadius}
        width={numberRadius * 2}
        height={numberRadius * 2}
        text={String(number ?? '')}
        align="center"
        verticalAlign="middle"
        fontSize={10 / scale}
        fill="#f8fafc"
        listening={false}
      />
    </Group>
  );
}
