// Links between trees are references (R5): group:index names a face seam,
// leaf:pair names a pair door gap. Positions rank typed > seam > equal.
export const seamKey = (groupPath, index) => `${groupPath}:${index}`;
export const pairKey = (leafPath) => `${leafPath}:pair`;

export function parseSeam(seam) {
  const match = typeof seam === 'string' ? /^(r(?:\.\d+)*):(\d+|pair)$/.exec(seam) : null;
  if (!match) return null;
  return match[2] === 'pair' ? { path: match[1], pair: true } : { path: match[1], index: Number(match[2]) };
}

export function isSeamKey(seam, direction) {
  const parsed = parseSeam(seam);
  return parsed !== null && (direction === 'horizontal' || !parsed.pair);
}

// Only pair_door faces carry `half`, so it alone identifies a pair door half.
export function pairHalves(faces) {
  for (const left of faces) {
    if (left.half !== 'left') continue;
    const right = faces.find((face) => face.path === left.path && face.half === 'right');
    if (right) return { left, right };
  }
  return null;
}

export function pairSeam(faces) {
  const halves = pairHalves(faces);
  if (!halves) return null;
  const { left, right } = halves;
  return (left.x + left.width + right.x) / 2;
}

export function rankedPosition(typed, reference) {
  if (typed != null) return { at: typed, source: 'typed' };
  if (reference != null) return { at: reference, source: 'reference' };
  return { at: null, source: 'auto' };
}
