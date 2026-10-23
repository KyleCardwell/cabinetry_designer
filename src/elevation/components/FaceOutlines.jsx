import { Fragment } from 'react';
import { Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { formatDimension } from '../model/units.js';

const SIZE_FONT = 10;
const SIZE_INSET = 3;

export default function FaceOutlines({
  faces,
  transform,
  selectedPath = null,
  selectable = false,
  showSizes = false,
  framed = false,
  onSelectFace,
}) {
  return faces.map((face) => {
    const rect = wallRectToScreen(face, transform);
    const selected = selectedPath !== null
      && (face.path === selectedPath || face.path.startsWith(`${selectedPath}.`));
    const sizeText = formatDimension(face.height);
    const showSize = showSizes
      && rect.height >= SIZE_FONT + SIZE_INSET * 2
      && rect.width >= sizeText.length * 6 + SIZE_INSET * 2;
    return (
      <Fragment key={`${face.path}:${face.half ?? ''}`}>
        <Rect
          {...rect}
          stroke={selected ? '#7dd3fc' : '#e2e8f0'}
          strokeWidth={selected ? 2 : 1}
          // A face frame opening is the frame's own edge, so an open face there stays solid (Kyle 2026-10-23).
          dash={face.type === 'open' && !framed ? [4, 3] : undefined}
          fill={selectable ? 'rgba(0, 0, 0, 0.001)' : undefined}
          listening={selectable}
          onClick={selectable ? (event) => {
            event.cancelBubble = true;
            onSelectFace?.(face.path);
          } : undefined}
        />
        {showSize && (
          <Text
            x={rect.x + SIZE_INSET}
            y={rect.y + rect.height - SIZE_FONT - SIZE_INSET}
            text={sizeText}
            fontSize={SIZE_FONT}
            fill={selected ? '#7dd3fc' : '#e2e8f0'}
            listening={false}
          />
        )}
      </Fragment>
    );
  });
}
