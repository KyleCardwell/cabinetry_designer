import { arcPoints, formatMeasure } from '../model/measure.js';

function pickMarks(pick, filled, toScreen) {
  if (!pick) return [];
  const point = toScreen(pick.point);
  const fill = filled ? true : undefined;
  if (pick.kind === 'corner') {
    return [{ type: 'rect', x: point.x - 4.5, y: point.y - 4.5, width: 9, height: 9, fill }];
  }
  if (pick.kind === 'mid') {
    return [{ type: 'line', points: [point.x, point.y - 5, point.x + 5, point.y + 5, point.x - 5, point.y + 5],
      closed: true, fill }];
  }
  const marks = [];
  const edge = pick.kind === 'edge' || pick.kind === 'on-edge';
  const cross = edge || pick.kind === 'arc';
  if (edge) {
    const start = toScreen({ x: pick.segment.x1, y: pick.segment.y1 });
    const end = toScreen({ x: pick.segment.x2, y: pick.segment.y2 });
    marks.push({ type: 'line', points: [start.x, start.y, end.x, end.y],
      width: filled && pick.kind === 'edge' ? 3 : 2 });
  }
  if (pick.kind === 'arc') {
    marks.push({ type: 'line', points: arcPoints(pick.arc).flatMap((sample) => {
      const screen = toScreen(sample);
      return [screen.x, screen.y];
    }), width: filled ? 3 : 2 });
  }
  if (pick.kind === 'center') marks.push({ type: 'circle', x: point.x, y: point.y, r: 4, fill });
  marks.push({ type: 'line', points: cross
    ? [point.x - 3.5, point.y - 3.5, point.x + 3.5, point.y + 3.5]
    : [point.x - 3.5, point.y, point.x + 3.5, point.y] });
  marks.push({ type: 'line', points: cross
    ? [point.x - 3.5, point.y + 3.5, point.x + 3.5, point.y - 3.5]
    : [point.x, point.y - 3.5, point.x, point.y + 3.5] });
  return marks;
}

function measureLabel(from, to, text, rotation, opacity) {
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
  return { type: 'label', x: (from.x + to.x) / 2 - Math.sin(radians) * offset,
    y: (from.y + to.y) / 2 + Math.cos(radians) * offset, angle, text, width, opacity };
}

function measurementMarks(result, toScreen, opacity = 1) {
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
  const marks = [{ type: 'line', points: [from.x, from.y, to.x, to.y], opacity }];
  for (const point of [from, to]) {
    marks.push({ type: 'line', points: [point.x - nx, point.y - ny, point.x + nx, point.y + ny], opacity });
  }
  if (legs) {
    marks.push({ type: 'line', points: [from.x, from.y, elbow.x, elbow.y, to.x, to.y], dash: [4, 3], opacity });
    marks.push(measureLabel(from, elbow, formatMeasure(result.dx), 0, opacity));
    marks.push(measureLabel(elbow, to, formatMeasure(result.dy), -90, opacity));
  }
  if (result.extension) {
    marks.push({ type: 'line', points: [extensionFrom.x, extensionFrom.y, extensionTo.x, extensionTo.y],
      dash: [4, 3], opacity });
  }
  marks.push(measureLabel(from, to, text, undefined, opacity));
  return marks;
}

/** Measurement primitives in screen pixels and paint order; fill is a renderer-colour flag. */
export function measureMarks({ first, hover, measures, preview, toScreen }) {
  return [
    ...measures.flatMap(({ result }) => measurementMarks(result, toScreen)),
    ...(preview ? measurementMarks(preview, toScreen, 0.7) : []),
    ...pickMarks(hover, false, toScreen),
    ...pickMarks(first, true, toScreen),
  ];
}
