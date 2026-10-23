import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { measureMarks } from '../canvas/measureMarks.js';

const COLOR = '#f472b6';

function MeasureMark({ mark }) {
  const { type, x, y, width = 1, opacity = 1, fill } = mark;
  if (type === 'line') return <Line points={mark.points} stroke={COLOR} strokeWidth={width}
    closed={mark.closed ?? false} fill={fill ? COLOR : undefined} dash={mark.dash} opacity={opacity} />;
  if (type === 'rect') return <Rect x={x} y={y} width={width} height={mark.height}
    stroke={COLOR} fill={fill ? COLOR : undefined} />;
  if (type === 'circle') return <Circle x={x} y={y} radius={mark.r} stroke={COLOR} fill={fill ? COLOR : undefined} />;
  const { text } = mark;
  return (
    <Group x={x} y={y} rotation={mark.angle} opacity={opacity}>
      <Rect x={-width / 2} y={-6.5} width={width} height={13} fill="#831843" cornerRadius={2} />
      <Text x={-width / 2 + 3} y={-5.5} text={text} fontSize={11} fontFamily="monospace" fill="#fdf2f8" />
    </Group>
  );
}

export default function MeasureOverlay(props) {
  return (
    <Group listening={false}>
      {measureMarks(props).map((mark, index) => <MeasureMark key={index} mark={mark} />)}
    </Group>
  );
}
