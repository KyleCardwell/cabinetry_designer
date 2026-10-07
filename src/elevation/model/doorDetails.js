import { partSizes } from './doorSizes.js';

function remainingIntervals(start, end, origin, mids) {
  const cuts = mids.map(({ at, width }) => [
    Math.max(start, origin + at - width / 2),
    Math.min(end, origin + at + width / 2),
  ]).filter(([low, high]) => high > low).sort(([a], [b]) => a - b);
  const intervals = [];
  let cursor = start;
  for (const [low, high] of cuts) {
    if (low - cursor > 1e-6) intervals.push([cursor, low]);
    cursor = Math.max(cursor, high);
  }
  if (end - cursor > 1e-6) intervals.push([cursor, end]);
  return intervals;
}

/**
 * Frame openings (5-piece) or molding rectangles (Slab AM) of one part,
 * in wall coordinates (SPEC-46.2, DOORS-PROFILES-PLAN §3.6).
 */
export function partDetail(style, design, rect, sizes) {
  const r = partSizes(style, design, { width: rect.width, height: rect.height, sizes });
  if (r.construction === 'slab') return { ...r, openings: [] };

  const opening = {
    x: rect.x + r.stiles.left,
    z: rect.z + r.rails.bottom,
    width: r.opening.width,
    height: r.opening.height,
  };
  const rows = remainingIntervals(opening.z, opening.z + opening.height, rect.z, r.midRails);
  const columns = remainingIntervals(opening.x, opening.x + opening.width, rect.x, r.midStiles);
  const openings = rows.flatMap(([bottom, top]) => columns.map(([left, right]) => ({
    x: left, z: bottom, width: right - left, height: top - bottom,
  })));
  return { construction: r.construction, openings, sizes: r };
}
