import { Fragment } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { formatDimension } from '../model/units.js';

const SIZE_FONT = 10;
const SIZE_INSET = 3;

export default function InteriorShapes({
  entries,
  drawnPieces,
  transform,
  selectedPieceId,
  interiorPath = null,
  interiorDivider = null,
  onSelectInterior,
}) {
  const selectedPath = interiorPath ?? 'r';
  const click = (interior) => (event) => {
    event.cancelBubble = true;
    onSelectInterior?.(interior);
  };
  return entries.map((entry) => {
    const piece = drawnPieces.find(({ id }) => id === entry.itemId);
    const clip = piece ? wallRectToScreen(piece, transform) : null;
    const selectable = selectedPieceId === entry.itemId;
    return (
      <Group
        key={entry.itemId}
        clipX={clip?.x}
        clipY={clip?.y}
        clipWidth={clip?.width}
        clipHeight={clip?.height}
      >
        {entry.sections.map((section) => {
          const rect = wallRectToScreen(section, transform);
          const selected = selectable && (section.path === selectedPath
            || section.path.startsWith(`${selectedPath}.`));
          const text = `${formatDimension(section.width)} × ${formatDimension(section.height)}`;
          const showSize = selectable
            && rect.height >= SIZE_FONT + SIZE_INSET * 2
            && rect.width >= text.length * 6 + SIZE_INSET * 2;
          return (
            <Fragment key={section.path}>
              <Rect
                {...rect}
                stroke={selected ? '#7dd3fc' : '#64748b'}
                strokeWidth={selected ? 2 : 1}
                fill={selectable ? 'rgba(0, 0, 0, 0.001)' : undefined}
                listening={selectable}
                onClick={selectable ? click({ path: section.path, divider: null }) : undefined}
              />
              {showSize && (
                <Text
                  x={rect.x + SIZE_INSET}
                  y={rect.y + rect.height - SIZE_FONT - SIZE_INSET}
                  text={text}
                  fontSize={SIZE_FONT}
                  fill={selected ? '#7dd3fc' : '#64748b'}
                  listening={false}
                />
              )}
            </Fragment>
          );
        })}
        {entry.dividers.map((divider) => {
          const selected = selectable && divider.path === selectedPath
            && divider.index === interiorDivider;
          return (
            <Rect
              key={`${divider.path}:${divider.index}`}
              {...wallRectToScreen(divider, transform)}
              fill="#cbd5e1"
              opacity={0.9}
              stroke={selected ? '#7dd3fc' : '#1e293b'}
              strokeWidth={selected ? 2 : 1}
              listening={selectable}
              onClick={selectable ? click({ path: divider.path, divider: divider.index }) : undefined}
            />
          );
        })}
      </Group>
    );
  });
}
