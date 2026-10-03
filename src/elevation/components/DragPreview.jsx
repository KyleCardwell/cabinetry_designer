import { Group, Label, Rect, Tag, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { formatInches } from '../model/units.js';

export default function DragPreview({ run, valid, transform }) {
  const rect = wallRectToScreen(run, transform);
  const color = valid ? '#60a5fa' : '#ef4444';

  return (
    <Group listening={false}>
      <Rect
        {...rect}
        fill="#2563eb"
        opacity={0.24}
        stroke={color}
        strokeWidth={2}
        dash={[7, 5]}
      />
      <Label x={rect.x + rect.width / 2} y={rect.y - 6}>
        <Tag
          fill="#0f172a"
          stroke={color}
          strokeWidth={1}
          cornerRadius={3}
          pointerDirection="down"
          pointerWidth={7}
          pointerHeight={5}
        />
        <Text
          text={formatInches(run.width)}
          fill="#dbeafe"
          fontSize={12}
          padding={5}
        />
      </Label>
    </Group>
  );
}
