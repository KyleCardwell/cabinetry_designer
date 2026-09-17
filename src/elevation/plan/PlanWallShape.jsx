import { Circle, Group, Line, Text } from 'react-konva';
import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { wallFrame } from '../model/geometry.js';
import { wallNumbers } from '../model/topology.js';
import { wallOutline } from '../model/wallOutline.js';

export default function PlanWallShape({
  room,
  wall,
  isSelected,
  scale,
  onSelect,
  onOpen,
}) {
  const frame = wallFrame(room, wall);
  if (frame.length === 0) return null;

  const outline = wallOutline(room, wall);
  const exterior = { x: -frame.n.x, y: -frame.n.y };
  const midpoint = {
    x: (wall.x1 + wall.x2) / 2,
    y: (wall.y1 + wall.y2) / 2,
  };
  const tickLength = 8 / scale;
  const fontSize = 11 / scale;
  const number = wallNumbers(room).get(wall.id);
  const numberRadius = 9 / scale;
  const numberOffset = wall.thickness + 38 / scale;
  const numberPoint = {
    x: midpoint.x + exterior.x * numberOffset + frame.d.x * 24 / scale,
    y: midpoint.y + exterior.y * numberOffset + frame.d.y * 24 / scale,
  };
  const dimensionOffset = wall.thickness + 18 / scale;
  const extensionStartOffset = wall.thickness + 2 / scale;
  const extensionEndOffset = wall.thickness + 22 / scale;
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
    { scale, fontSize: 11 },
  );
  const dimensionLabel = layout.labels[0];
  const labelDistance = (dimensionLabel.mode === 'popout'
    ? 9 + 12 * dimensionLabel.level
    : 9) / scale;
  const dimensionCenter = {
    x: midpoint.x + exterior.x * dimensionOffset,
    y: midpoint.y + exterior.y * dimensionOffset,
  };
  const labelPoint = {
    x: dimensionCenter.x + exterior.x * labelDistance,
    y: dimensionCenter.y + exterior.y * labelDistance,
  };
  let labelRotation = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI;
  if (labelRotation > 90 || labelRotation < -90) labelRotation += 180;

  return (
    <Group onClick={onSelect} onDblClick={onOpen}>
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
        strokeWidth={1 / scale}
        listening={false}
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
