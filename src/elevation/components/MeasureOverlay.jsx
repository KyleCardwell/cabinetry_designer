import { Group, Line, Rect, Text } from 'react-konva';
import { formatMeasure } from '../model/measure.js';

const COLOR = '#f472b6';

function PickMarker({ pick, filled, toScreen }) {
  if (!pick) return null;
  const point = toScreen(pick.point);
  const fill = filled ? COLOR : undefined;
  if (pick.kind === 'corner') {
    return <Rect x={point.x - 4.5} y={point.y - 4.5} width={9} height={9} stroke={COLOR} fill={fill} />;
  }
  if (pick.kind === 'mid') {
    return <Line points={[point.x, point.y - 5, point.x + 5, point.y + 5, point.x - 5, point.y + 5]}
      closed stroke={COLOR} fill={fill} />;
  }
  const edge = pick.kind === 'edge' || pick.kind === 'on-edge';
  const start = edge ? toScreen({ x: pick.segment.x1, y: pick.segment.y1 }) : null;
  const end = edge ? toScreen({ x: pick.segment.x2, y: pick.segment.y2 }) : null;
  return (
    <Group>
      {edge && <Line points={[start.x, start.y, end.x, end.y]} stroke={COLOR}
        strokeWidth={filled && pick.kind === 'edge' ? 3 : 2} />}
      <Line points={edge
        ? [point.x - 3.5, point.y - 3.5, point.x + 3.5, point.y + 3.5]
        : [point.x - 3.5, point.y, point.x + 3.5, point.y]} stroke={COLOR} />
      <Line points={edge
        ? [point.x - 3.5, point.y + 3.5, point.x + 3.5, point.y - 3.5]
        : [point.x, point.y - 3.5, point.x, point.y + 3.5]} stroke={COLOR} />
    </Group>
  );
}

function MeasureLabel({ from, to, text, rotation }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  // Match dimension labels' 0.6-em width estimate; monospace keeps the pill predictable.
  const width = text.length * 11 * 0.6 + 6;
  let angle = rotation ?? Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle <= -90) angle += 180;
  if (angle > 90) angle -= 180;
  if (rotation !== undefined) angle = rotation;
  const offset = length < width ? 12 : 0;
  const radians = angle * Math.PI / 180;
  return (
    <Group x={(from.x + to.x) / 2 - Math.sin(radians) * offset}
      y={(from.y + to.y) / 2 + Math.cos(radians) * offset} rotation={angle}>
      <Rect x={-width / 2} y={-6.5} width={width} height={13} fill="#831843" cornerRadius={2} />
      <Text x={-width / 2 + 3} y={-5.5} text={text} fontSize={11} fontFamily="monospace" fill="#fdf2f8" />
    </Group>
  );
}

function Measurement({ result, toScreen, opacity = 1 }) {
  const from = toScreen(result.from);
  const to = toScreen(result.to);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const nx = length ? -(to.y - from.y) / length * 3 : 0;
  const ny = length ? (to.x - from.x) / length * 3 : 3;
  const elbow = toScreen({ x: result.to.x, y: result.from.y });
  const legs = result.kind === 'points' && result.dx > 1e-3 && result.dy > 1e-3;
  const extensionFrom = result.extension && toScreen(result.extension.from);
  const extensionTo = result.extension && toScreen(result.extension.to);
  const text = formatMeasure(result.distance)
    + (result.angle === undefined ? '' : ` · ${Math.round(result.angle * 10) / 10}°`);
  return (
    <Group opacity={opacity}>
      <Line points={[from.x, from.y, to.x, to.y]} stroke={COLOR} />
      {[from, to].map((point, index) => (
        <Line key={index} points={[point.x - nx, point.y - ny, point.x + nx, point.y + ny]} stroke={COLOR} />
      ))}
      {legs && <>
        <Line points={[from.x, from.y, elbow.x, elbow.y, to.x, to.y]} stroke={COLOR} dash={[4, 3]} />
        <MeasureLabel from={from} to={elbow} text={formatMeasure(result.dx)} rotation={0} />
        <MeasureLabel from={elbow} to={to} text={formatMeasure(result.dy)} rotation={-90} />
      </>}
      {result.extension && <Line points={[extensionFrom.x, extensionFrom.y, extensionTo.x, extensionTo.y]}
        stroke={COLOR} dash={[4, 3]} />}
      <MeasureLabel from={from} to={to} text={text} />
    </Group>
  );
}

export default function MeasureOverlay({ first, hover, measures, preview, toScreen }) {
  return (
    <Group listening={false}>
      {measures.map(({ result }, index) => <Measurement key={index} result={result} toScreen={toScreen} />)}
      {preview && <Measurement result={preview} toScreen={toScreen} opacity={0.7} />}
      <PickMarker pick={hover} toScreen={toScreen} />
      <PickMarker pick={first} filled toScreen={toScreen} />
    </Group>
  );
}
