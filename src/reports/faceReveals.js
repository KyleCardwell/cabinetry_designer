import { REVEAL_KEYS } from '../elevation/model/styles.js';
import { formatInch } from './format.js';

const EPSILON = 1e-6;
const ORDER = [...REVEAL_KEYS.slice(0, 4), 'pair', ...REVEAL_KEYS.slice(4)];
const LABELS = { pair: 'pair door gap', horizontal: 'horizontal', vertical: 'vertical' };

function distinct(values = []) {
  return [...values].sort((a, b) => a - b)
    .filter((value, index, sorted) => !index || Math.abs(value - sorted[index - 1]) > EPSILON);
}

/** Format measured reveals, combining equal opposite sides before rounding to inches. */
export function formatRevealParts(values) {
  const resolved = Object.fromEntries(ORDER.map((key) => [key, distinct(values[key])]));
  const skipped = new Set();
  return ORDER.flatMap((key) => {
    const numbers = resolved[key];
    if (skipped.has(key) || !numbers.length) return [];
    let label = LABELS[key] ?? key[0].toUpperCase();
    const opposite = { top: 'bottom', left: 'right' }[key];
    if (opposite && numbers.length === resolved[opposite].length
      && numbers.every((value, index) => Math.abs(value - resolved[opposite][index]) <= EPSILON)) {
      label += ` & ${opposite[0].toUpperCase()}`;
      skipped.add(opposite);
    }
    return [`${numbers.map((value) => `${formatInch(Math.abs(value))}${value < -EPSILON ? ' OH' : ''}`).join('/')} ${label}`];
  });
}

/** Measure the exposed edges and neighboring face gaps in the real box's coordinates. */
export function profiledFaceReveals(box, faces) {
  const solid = faces.filter(({ type }) => type !== 'open');
  const values = Object.fromEntries(ORDER.map((key) => [key, []]));
  for (const [axis, size, cross, crossSize, low, high, gapKey] of [
    ['x', 'width', 'z', 'height', 'left', 'right', 'vertical'],
    ['z', 'height', 'x', 'width', 'bottom', 'top', 'horizontal'],
  ]) {
    const end = (face) => face[axis] + face[size];
    const overlap = (a, b) => Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize])
      - Math.max(a[cross], b[cross]) > EPSILON;
    for (const face of solid) {
      const aligned = solid.filter((other) => other !== face && overlap(face, other));
      const after = aligned.filter((other) => other[axis] >= end(face) - EPSILON);
      if (!aligned.some((other) => end(other) <= face[axis] + EPSILON)) {
        values[low].push(face[axis] - box[axis]);
      }
      if (!after.length) values[high].push(end(box) - end(face));
      for (const other of after) {
        // Skip non-neighbors, such as the first and third fronts of a drawer stack.
        const between = aligned.some((middle) => middle !== other
          && middle[axis] >= end(face) - EPSILON && end(middle) <= other[axis] + EPSILON
          && overlap(middle, other));
        if (between) continue;
        const pair = axis === 'x' && face.type === 'pair_door' && other.type === 'pair_door'
          && face.path === other.path && face.half !== other.half;
        values[pair ? 'pair' : gapKey].push(other[axis] - end(face));
      }
    }
  }
  return formatRevealParts(values);
}
