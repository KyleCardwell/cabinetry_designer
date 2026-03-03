import { Group, Rect, Text } from 'react-konva';

/**
 * Renders a single placed object inside a WallGroup.
 * Local coordinates: x = distance along wall from (x1,y1),
 *                    y = perpendicular offset (0 = flush against wall face).
 * The object is drawn "above" the wall line (negative y direction in the
 * rotated group) so cabinets sit against the wall.
 */
export default function PlacedObject({ obj, draggable, wallLength, onDragEnd, onSelect }) {
  const w = obj.width ?? 24;
  const d = obj.depth ?? 24;

  return (
    <Group
      x={obj.x}
      y={(obj.y ?? 0)}
      rotation={obj.rotation ?? 0}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      dragBoundFunc={wallLength != null ? (pos) => {
        // Allow free drag — clamping is handled on dragEnd
        return pos;
      } : undefined}
    >
      <Rect
        width={w}
        height={d}
        fill={obj.fillColor}
        stroke={obj.borderColor}
        strokeWidth={0.5}
      />
      <Text
        text={obj.object_type?.replace('_', '\n') ?? ''}
        width={w}
        height={d}
        align="center"
        verticalAlign="bottom"
        fontSize={3}
        fill="#94a3b8"
        listening={false}
      />
    </Group>
  );
}
