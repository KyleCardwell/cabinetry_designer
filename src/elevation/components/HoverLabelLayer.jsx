import { useEffect } from 'react';
import { Label, Layer, Rect, Tag, Text } from 'react-konva';
import { hideHoverLabel, useHoverLabel } from '../canvas/hoverLabel.js';

export const HOVER_TINT = 'rgba(248, 250, 252, 0.1)';

/** EC2: the hovered piece's tint and size label, drawn above everything else on the elevation. */
export function HoverLabelShapes({ label }) {
  if (!label) return null;
  const { rect, lines, fontSize = 11 } = label;
  return (
    <>
      <Rect {...rect} fill={HOVER_TINT} listening={false} />
      <Label x={rect.x + rect.width / 2} y={rect.y - 5} opacity={0.96} listening={false}>
        <Tag
          fill="#020617"
          stroke="#475569"
          strokeWidth={1}
          cornerRadius={3}
          pointerDirection="down"
          pointerWidth={6}
          pointerHeight={4}
        />
        <Text text={lines.join(' · ')} fill="#f8fafc" fontSize={fontSize} padding={5} />
      </Label>
    </>
  );
}

/** Any change to `room` (an edit) or `resetKey` (wall, tool) drops a label whose piece may have moved or gone;
 * the next mouse move over a piece shows it again. */
export default function HoverLabelLayer({ room, resetKey }) {
  const label = useHoverLabel();
  useEffect(() => () => hideHoverLabel(), []);
  useEffect(() => hideHoverLabel(), [room, resetKey]);
  return (
    <Layer listening={false}>
      <HoverLabelShapes label={label} />
    </Layer>
  );
}
