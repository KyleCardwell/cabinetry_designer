import { Group, Label, Rect, Tag, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { formatInches } from '../model/units.js';

export default function DragPreview({ bounds, transform }) {
  const rect = wallRectToScreen({
    x: bounds.x,
    z: bounds.bottomZ,
    width: bounds.width,
    height: bounds.topZ - bounds.bottomZ,
  }, transform);

  return (
    <Group listening={false}>
      <Rect
        {...rect}
        fill="#2563eb"
        opacity={0.24}
        stroke="#60a5fa"
        strokeWidth={2}
        dash={[7, 5]}
      />
      <Label x={rect.x + rect.width / 2} y={rect.y - 6}>
        <Tag
          fill="#0f172a"
          stroke="#60a5fa"
          strokeWidth={1}
          cornerRadius={3}
          pointerDirection="down"
          pointerWidth={7}
          pointerHeight={5}
        />
        <Text
          text={formatInches(bounds.width)}
          fill="#dbeafe"
          fontSize={12}
          padding={5}
        />
      </Label>
    </Group>
  );
}
