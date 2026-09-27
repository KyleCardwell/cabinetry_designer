import { useState } from 'react';
import { Group, Label, Rect, Tag, Text } from 'react-konva';
import { KIND_COLORS } from '../model/constants.js';
import { formatInches } from '../model/units.js';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';

export default function PieceRect({
  piece,
  transform,
  warning,
  error,
  selected,
  cornerFiller = false,
  subLabel = null,
  framed = false,
  onSelect,
  cursor,
}) {
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const rect = wallRectToScreen(piece, transform);
  const widthText = Number.isFinite(piece.absorbed)
    ? `${formatInches(piece.width)} (${piece.absorbed >= 0 ? '+' : ''}${formatInches(piece.absorbed)})`
    : formatInches(piece.width);
  const narrow = rect.width < Math.max(44, widthText.length * 6.5);
  const outline = error
    ? '#ef4444'
    : warning
      ? '#f59e0b'
      : selected
        ? '#7dd3fc'
        : '#1e293b';
  const fixedCabinet = piece.kind === 'cabinet' && !piece.auto;
  const hollow = piece.kind === 'void' || piece.kind === 'shelves';
  const showLabels = !framed;

  return (
    <Group
      onMouseEnter={() => {
        setHovered(true);
        cursorKeys.request(piece.id, CURSORS.select);
      }}
      onMouseLeave={() => {
        setHovered(false);
        cursorKeys.release(piece.id);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
    >
      <Rect
        {...rect}
        fill={framed
          ? 'rgba(0, 0, 0, 0.001)'
          : hollow ? 'transparent' : cornerFiller ? '#fbbf24' : KIND_COLORS[piece.kind]}
        opacity={0.82}
        dash={piece.kind === 'void' ? [6, 4] : undefined}
        stroke={framed && outline === '#1e293b'
          ? undefined
          : piece.kind === 'void' && outline === '#1e293b' ? KIND_COLORS.void : outline}
        strokeWidth={selected ? 3 : error || warning ? 2 : 1}
      />

      {showLabels && !narrow && (
        <Text
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={subLabel ? rect.height - 13 : rect.height}
          align="center"
          verticalAlign="middle"
          text={widthText}
          fill="#f8fafc"
          fontSize={11}
          listening={false}
        />
      )}

      {showLabels && subLabel && !narrow && (
        <Text
          x={rect.x}
          y={rect.y + rect.height / 2 + 2}
          width={rect.width}
          align="center"
          text={subLabel}
          fill="#cbd5e1"
          fontSize={10}
          listening={false}
        />
      )}

      {showLabels && fixedCabinet && rect.width >= 12 && (
        <Text
          x={rect.x + rect.width - 11}
          y={rect.y + 3}
          width={8}
          text="*"
          fill="#f8fafc"
          fontSize={13}
          fontStyle="bold"
          listening={false}
        />
      )}

      {showLabels && narrow && hovered && (
        <Label
          x={rect.x + rect.width / 2}
          y={rect.y - 5}
          opacity={0.96}
          listening={false}
        >
          <Tag
            fill="#020617"
            stroke="#475569"
            strokeWidth={1}
            cornerRadius={3}
            pointerDirection="down"
            pointerWidth={6}
            pointerHeight={4}
          />
          <Text
            text={subLabel ? `${widthText} · ${subLabel}` : widthText}
            fill="#f8fafc"
            fontSize={11}
            padding={5}
          />
        </Label>
      )}
    </Group>
  );
}
