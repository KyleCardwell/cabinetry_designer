import { Line } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';

export default function SwingMarks({ marks, transform }) {
  return marks.flatMap(({ partId, lines }) => lines.map((line, index) => {
    const start = wallToScreen({ x: line.x1, z: line.z1 }, transform);
    const end = wallToScreen({ x: line.x2, z: line.z2 }, transform);
    return (
      <Line
        key={`${partId}:${index}`}
        points={[start.x, start.y, end.x, end.y]}
        stroke="#cbd5e1"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />
    );
  }));
}
