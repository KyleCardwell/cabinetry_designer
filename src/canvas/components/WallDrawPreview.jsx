import { Line } from 'react-konva';

export default function WallDrawPreview({ start, end, scale }) {
  if (!start || !end) return null;

  return (
    <Line
      points={[start.x, start.y, end.x, end.y]}
      stroke="#3b82f6"
      strokeWidth={1 / scale}
      dash={[4 / scale, 4 / scale]}
      listening={false}
    />
  );
}
