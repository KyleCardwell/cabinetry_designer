import { plotScale } from './drawingScale.js';

const ANGLE = Math.PI / 3; // 60° from horizontal, in wall coordinates (z up).
const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);
const round = (value) => Number(value.toFixed(6));

/** Three parallel, edge-to-edge drafting marks on a glass rectangle (or wall window). */
export function glassMarks({ x, z, width, height }) {
  if (![x, z, width, height].every(Number.isFinite)) return [];
  const m = Math.min(width, height);
  if (m < 2) return [];
  const g = Math.min(m / 11, 2);
  const lines = [];
  for (const [offset, weight] of [[g, 70], [0, 100], [-g, 35]]) {
    const px = x + width / 2 - SIN * offset;
    const pz = z + height / 2 + COS * offset;
    // Intersect the infinite line with each slab; both direction components are positive.
    const start = Math.max((x - px) / COS, (z - pz) / SIN);
    const end = Math.min((x + width - px) / COS, (z + height - pz) / SIN);
    if (end - start < 1e-6) continue;
    lines.push({
      x1: round(px + start * COS), z1: round(pz + start * SIN),
      x2: round(px + end * COS), z2: round(pz + end * SIN), weight,
    });
  }
  return lines;
}

/** Convert a paper lineweight (1/100 mm) to canvas pixels, with a visible minimum. */
export function glassMarkStrokePx(weight, settings, transform) {
  return Math.max(0.75, weight / 100 / 25.4 * plotScale(settings) * transform.scale);
}
