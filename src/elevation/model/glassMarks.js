/** Three parallel drafting marks, in wall coordinates, centred on a glass rectangle. */
export function glassMarks({ x, z, width, height }) {
  const m = Math.min(width, height);
  if (m < 2) return [];
  const round = (value) => Number(value.toFixed(6));
  return [[0, m / 3], [m / 12, m / 5], [-m / 12, m / 5]].map(([offset, length]) => {
    const cx = x + width / 2 - offset / Math.SQRT2;
    const cz = z + height / 2 + offset / Math.SQRT2;
    const half = length / 2 / Math.SQRT2;
    return { x1: round(cx - half), z1: round(cz - half), x2: round(cx + half), z2: round(cz + half) };
  });
}
