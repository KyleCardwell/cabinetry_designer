import { DIMENSION_TEXT_HEIGHT } from './elevationDimensions.js';

const EPSILON = 1e-6;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];

/** The DXF line and its oriented text box, in drawing inches with y up (PD3). */
export function dimensionShape({ start, end, offset, text, textAt }, scale) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const u = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const n = [-u[1], u[0]];
  const line = [start, end].map((p) => [p[0] + n[0] * offset, p[1] + n[1] * offset]);
  const center = textAt ?? [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2];
  const height = DIMENSION_TEXT_HEIGHT * scale;
  return { line, center, axes: [u, n], half: [text.length * 0.5 * height / 2, height / 2] };
}

export function boxesOverlap(a, b) {
  return [...a.axes, ...b.axes].every((axis) => {
    const radius = (box) => box.half.reduce((sum, half, i) => sum + half * Math.abs(dot(box.axes[i], axis)), 0);
    return Math.abs(dot(subtract(a.center, b.center), axis)) < radius(a) + radius(b) - EPSILON;
  });
}

/** Clip a segment to the open text rectangle; mere boundary contact is clear. */
export function lineHitsBox(line, box) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 2; i += 1) {
    const start = dot(subtract(line[0], box.center), box.axes[i]);
    const delta = dot(subtract(line[1], line[0]), box.axes[i]);
    const half = box.half[i] - EPSILON;
    if (Math.abs(delta) <= EPSILON) {
      if (Math.abs(start) >= half) return false;
    } else {
      const bounds = [(-half - start) / delta, (half - start) / delta].sort((a, b) => a - b);
      low = Math.max(low, bounds[0]);
      high = Math.min(high, bounds[1]);
      if (low >= high) return false;
    }
  }
  return true;
}

