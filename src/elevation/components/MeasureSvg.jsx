import { measureMarks } from '../canvas/measureMarks.js';

const COLOR = '#f472b6';

function MeasureMark({ mark }) {
  const { type, x, y, width = 1, opacity = 1, fill } = mark;
  if (type === 'line') {
    const Shape = mark.closed ? 'polygon' : 'polyline';
    return <Shape points={mark.points.join(' ')} stroke={COLOR} strokeWidth={width}
      strokeDasharray={mark.dash?.join(' ')} fill={fill ? COLOR : 'none'} opacity={opacity} />;
  }
  if (type === 'rect') return <rect x={x} y={y} width={width} height={mark.height}
    stroke={COLOR} strokeWidth={2} fill={fill ? COLOR : 'none'} />;
  if (type === 'circle') return <circle cx={x} cy={y} r={mark.r}
    stroke={COLOR} strokeWidth={2} fill={fill ? COLOR : 'none'} />;
  return (
    <g transform={`translate(${x} ${y}) rotate(${mark.angle})`} opacity={opacity}>
      <rect x={-width / 2} y={-6.5} width={width} height={13} rx={2} fill="#831843" />
      <text fontFamily="monospace" fontSize={11} dominantBaseline="central" textAnchor="middle" fill="#fdf2f8">
        {mark.text}
      </text>
    </g>
  );
}

export default function MeasureSvg(props) {
  return (
    <g pointerEvents="none">
      {measureMarks(props).map((mark, index) => <MeasureMark key={index} mark={mark} />)}
    </g>
  );
}
