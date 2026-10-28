import { Label, Layer, Rect, Tag, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

const HOVER = '#f472b6';
const REFUSED = '#f59e0b';
const MOVING = '#38bdf8';

/**
 * "Center over…" pick layer (SPEC-CV1): a full-canvas catcher so normal selection, stretch and joint
 * drags stay off, a faint outline on the run that will move, and the hovered cell's outline + label.
 */
export default function CenterPickOverlay({
  width, height, transform, run, hovered, onMove, onLeave, onClick,
}) {
  if (!run || !transform) return null;
  const runRect = wallRectToScreen({ x: run.x, z: run.z, width: run.width, height: run.height }, transform);
  const color = hovered?.refused ? REFUSED : HOVER;
  const label = hovered
    ? `${hovered.target.label}${hovered.refused ? ` — ${hovered.refused}` : ''}`
    : null;
  return (
    <Layer>
      <Rect
        width={width}
        height={height}
        fill="transparent"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={(event) => {
          event.cancelBubble = true;
          onClick(event);
        }}
      />
      <Rect {...runRect} stroke={MOVING} strokeWidth={1.5} dash={[4, 4]} opacity={0.7} listening={false} />
      {hovered && (
        <Rect
          {...wallRectToScreen(hovered.target.rect, transform)}
          stroke={color}
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
      )}
      {label && hovered.pointer && (
        <Label x={hovered.pointer.x + 14} y={hovered.pointer.y + 14} listening={false}>
          <Tag fill="#030712" opacity={0.9} cornerRadius={3} />
          <Text text={label} fill={color} fontSize={12} padding={4} />
        </Label>
      )}
    </Layer>
  );
}
