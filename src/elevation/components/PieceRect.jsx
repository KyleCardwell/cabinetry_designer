import { useState } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { KIND_COLORS } from '../model/constants.js';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { hideHoverLabel, pieceSizeText, showHoverLabel } from '../canvas/hoverLabel.js';

export default function PieceRect({
  piece,
  transform,
  warning,
  error,
  selected,
  cornerFiller = false,
  subLabel = null,
  notes = [],
  framed = false,
  ghost = false,
  onSelect,
  cursor,
}) {
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const rect = wallRectToScreen(piece, transform);
  const labelScale = transform.text?.label ?? 1;
  const fontSize = 13 * labelScale;
  // FX5: no piece prints its width any more (the dimensions and properties carry it); hover still shows it.
  // EC2: hover shows W × H in the top hover layer, framed boxes included.
  // The centred block is kept for text notes: the sub-label, then any `notes`, stacked and centred.
  const centerLines = [subLabel, ...notes].filter(Boolean);
  const longest = Math.max(0, ...centerLines.map((line) => line.length));
  const narrow = rect.width < Math.max(44 * labelScale, longest * fontSize * 0.65)
    || rect.height < centerLines.length * fontSize * 1.25;
  const outline = error
    ? '#ef4444'
    : warning
      ? '#f59e0b'
      : selected
        ? '#7dd3fc'
        : '#1e293b';
  const fixedCabinet = piece.kind === 'cabinet' && !piece.auto;
  const hollow = piece.kind === 'void' || piece.kind === 'shelves';
  // A framed box never shows; a mitered end panel (ghost) shows while hovered or selected (SPEC-36.1).
  const quiet = framed || (ghost && !hovered && !selected);
  const showLabels = !quiet;
  const showHover = () => showHoverLabel({
    id: piece.id,
    rect,
    lines: [pieceSizeText(piece), ...(framed ? [] : centerLines)],
    fontSize: 11 * labelScale,
  });

  return (
    <Group
      onMouseEnter={() => {
        setHovered(true);
        showHover();
        cursorKeys.request(piece.id, CURSORS.select);
      }}
      onMouseMove={showHover}
      onMouseLeave={() => {
        setHovered(false);
        hideHoverLabel(piece.id);
        cursorKeys.release(piece.id);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
    >
      <Rect
        {...rect}
        fill={quiet
          ? 'rgba(0, 0, 0, 0.001)'
          : hollow ? 'transparent' : cornerFiller ? '#fbbf24' : KIND_COLORS[piece.kind]}
        opacity={0.82}
        stroke={quiet && outline === '#1e293b'
          ? undefined
          : piece.kind === 'void' && outline === '#1e293b' ? KIND_COLORS.void : outline}
        strokeWidth={selected ? 3 : error || warning ? 2 : 1}
      />

      {showLabels && !narrow && centerLines.length > 0 && (
        <Text
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          align="center"
          verticalAlign="middle"
          lineHeight={1.25}
          text={centerLines.join('\n')}
          fill="#cbd5e1"
          fontSize={fontSize}
          listening={false}
        />
      )}

      {showLabels && fixedCabinet && rect.width >= 12 * labelScale && (
        <Text
          x={rect.x + rect.width - 11 * labelScale}
          y={rect.y + 3}
          width={8 * labelScale}
          text="*"
          fill="#f8fafc"
          fontSize={13 * labelScale}
          fontStyle="bold"
          listening={false}
        />
      )}

    </Group>
  );
}
