import { Group, Line } from 'react-konva';

export default function Hatch({ rect }) {
  const spacing = 8;
  const count = Math.ceil((rect.width + rect.height) / spacing) + 2;
  return (
    <Group
      clipX={rect.x}
      clipY={rect.y}
      clipWidth={rect.width}
      clipHeight={rect.height}
      listening={false}
    >
      {Array.from({ length: count }, (_, index) => {
        const startX = rect.x - rect.height + index * spacing;
        return (
          <Line
            key={startX}
            points={[
              startX,
              rect.y + rect.height,
              startX + rect.height,
              rect.y,
            ]}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.55}
            listening={false}
          />
        );
      })}
    </Group>
  );
}
