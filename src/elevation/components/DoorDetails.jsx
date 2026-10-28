import { Fragment } from 'react';
import { Line, Rect, Text } from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';

export default function DoorDetails({ parts, warnings, transform, showDetails, showTags }) {
  const labelScale = transform.text?.label ?? 1;
  return parts.map((part) => {
    const rect = wallRectToScreen(part, transform);
    const warned = warnings.some((warning) => warning.key === part.key
      || (warning.code === 'front-panel-over-taller'
        && warning.pieceId === part.pieceId && warning.path === part.path));
    return (
      <Fragment key={part.key}>
        {showDetails && part.openingsShown !== false && part.openings.map((opening, index) => {
          const openingRect = wallRectToScreen(opening, transform);
          if (openingRect.width < 2 || openingRect.height < 2) return null;
          return (
            <Rect
              key={index}
              {...openingRect}
              stroke="#94a3b8"
              strokeWidth={1}
              fillEnabled={false}
              listening={false}
            />
          );
        })}
        {showDetails && part.lines.map((line, index) => {
          const lineRect = wallRectToScreen(line, transform);
          if (lineRect.width < 2 || lineRect.height < 2) return null;
          return (
            <Rect
              key={`line-${index}`}
              {...lineRect}
              stroke="#cbd5e1"
              strokeWidth={0.75}
              fillEnabled={false}
              listening={false}
            />
          );
        })}
        {showDetails && (part.miters ?? []).map((miter, index) => {
          const start = wallToScreen({ x: miter.x1, z: miter.z1 }, transform);
          const end = wallToScreen({ x: miter.x2, z: miter.z2 }, transform);
          if (Math.hypot(end.x - start.x, end.y - start.y) < 2) return null;
          return (
            <Line
              key={`miter-${index}`}
              points={[start.x, start.y, end.x, end.y]}
              stroke="#cbd5e1"
              strokeWidth={0.75}
              listening={false}
            />
          );
        })}
        {warned && (
          <Rect
            {...rect}
            stroke="#f59e0b"
            strokeWidth={1.5}
            dash={[4, 2]}
            fillEnabled={false}
            listening={false}
          />
        )}
        {showTags && rect.width >= 14 * labelScale && rect.height >= 12 * labelScale && (
          <Text
            x={rect.x + 3}
            y={rect.y + 3}
            text={part.label}
            fontSize={9 * labelScale}
            fill="#c4b5fd"
            listening={false}
          />
        )}
      </Fragment>
    );
  });
}
