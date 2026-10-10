import { Fragment } from 'react';
import { Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

export default function DoorDetails({ parts, warnings, transform, showDetails, showTags }) {
  return parts.map((part) => {
    const rect = wallRectToScreen(part, transform);
    const warned = warnings.some((warning) => warning.key === part.key
      || (warning.code === 'front-panel-over-taller'
        && warning.pieceId === part.pieceId && warning.path === part.path));
    return (
      <Fragment key={part.key}>
        {showDetails && part.openings.map((opening, index) => {
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
        {showTags && rect.width >= 14 && rect.height >= 12 && (
          <Text
            x={rect.x + 3}
            y={rect.y + 3}
            text={part.label}
            fontSize={9}
            fill="#c4b5fd"
            listening={false}
          />
        )}
      </Fragment>
    );
  });
}
