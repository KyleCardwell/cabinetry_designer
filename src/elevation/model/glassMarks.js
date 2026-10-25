const ANGLE = Math.PI / 3; // 60° from horizontal (Kyle 2026-10-24, GM1)
const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);
const BIG = 24; // panels over 24 × 24 get a set at the top-left and bottom-right corners
const INSET = 3;
const round = (value) => Number(value.toFixed(6));

/** One set of three parallel marks for a panel whose smaller side is `m`, centred on cx, cz. */
function markSet(m, cx, cz) {
  return [[0, m / 3], [m / 18, m / 5], [-m / 18, m / 5]].map(([offset, length]) => {
    const x = cx - offset * SIN;
    const z = cz + offset * COS;
    const hx = (length / 2) * COS;
    const hz = (length / 2) * SIN;
    return { x1: x - hx, z1: z - hz, x2: x + hx, z2: z + hz };
  });
}

const rounded = (lines) => lines.map(({ x1, z1, x2, z2 }) => ({
  x1: round(x1), z1: round(z1), x2: round(x2), z2: round(z2),
}));

/** Drafting marks, in wall coordinates, on a glass rectangle (or wall window). */
export function glassMarks({ x, z, width, height }) {
  const m = Math.min(width, height);
  if (m < 2) return [];
  if (width <= BIG || height <= BIG) return rounded(markSet(m, x + width / 2, z + height / 2));
  const base = markSet(BIG, 0, 0);
  const minX = Math.min(...base.flatMap(({ x1, x2 }) => [x1, x2]));
  const maxX = Math.max(...base.flatMap(({ x1, x2 }) => [x1, x2]));
  const minZ = Math.min(...base.flatMap(({ z1, z2 }) => [z1, z2]));
  const maxZ = Math.max(...base.flatMap(({ z1, z2 }) => [z1, z2]));
  return rounded([
    ...markSet(BIG, x + INSET - minX, z + height - INSET - maxZ),
    ...markSet(BIG, x + width - INSET - maxX, z + INSET - minZ),
  ]);
}
