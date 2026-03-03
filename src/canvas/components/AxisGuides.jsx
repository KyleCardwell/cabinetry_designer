import { Line } from 'react-konva';

const AXIS_EXTENT = 10000;

export default function AxisGuides({ scale }) {
  return (
    <>
      <Line
        points={[-AXIS_EXTENT, 0, AXIS_EXTENT, 0]}
        stroke="#ef4444"
        strokeWidth={1 / scale}
        listening={false}
      />
      <Line
        points={[0, -AXIS_EXTENT, 0, AXIS_EXTENT]}
        stroke="#22c55e"
        strokeWidth={1 / scale}
        listening={false}
      />
    </>
  );
}
