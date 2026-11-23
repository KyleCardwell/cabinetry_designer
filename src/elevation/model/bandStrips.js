const EPSILON = 1e-6;
const converted = new WeakMap();
const stripsByBand = new WeakMap();

/** Keep internal hiding strips beside a public band without changing its fields. */
export function attachStrips(band, strips) {
  if (strips?.length) stripsByBand.set(band, strips);
}

export function stripsOf(band) {
  return stripsByBand.get(band);
}

/**
 * A band part's hiding strips as absolute fronts (SPEC-D7): each strip's inset from the band's deepest
 * point comes off the part's own front. Clipped to the part's height, any gap filled at the part's
 * front, equal neighbours merged. `undefined` unless two or more strips remain.
 */
export function partStrips(strips, part) {
  if (!strips || strips.length < 2) return undefined;
  // Cached views share frozen strip lists across pieces and callers. A conversion depends only
  // on height and front, so reuse it without caching mutable input lists.
  if (!Object.isFrozen(strips)) return buildPartStrips(strips, part);
  let byPart = converted.get(strips);
  if (!byPart) {
    byPart = new Map();
    converted.set(strips, byPart);
  }
  const key = `${part.z}:${part.height}:${part.front}`;
  if (!byPart.has(key)) byPart.set(key, buildPartStrips(strips, part));
  return byPart.get(key);
}

function buildPartStrips(strips, part) {
  const bottom = part.z;
  const top = part.z + part.height;
  const out = [];
  const push = (z1, z2, front) => {
    if (z2 - z1 <= EPSILON) return;
    const last = out.at(-1);
    if (last && Math.abs(last.front - front) <= EPSILON) last.z2 = z2;
    else out.push({ z1, z2, front });
  };
  let at = bottom;
  for (const { z1, z2, inset } of [...strips].sort((a, b) => a.z1 - b.z1)) {
    const lo = Math.max(z1, at);
    const hi = Math.min(z2, top);
    if (hi - lo <= EPSILON) continue;
    push(at, lo, part.front);
    push(lo, hi, part.front - inset);
    at = hi;
  }
  push(at, top, part.front);
  if (out.length < 2) return undefined;
  out[0].z1 = bottom;
  out.at(-1).z2 = top;
  return out;
}
