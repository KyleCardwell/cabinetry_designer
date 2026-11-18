const EPSILON = 1e-7;

/** Boxes use centre coordinates, unlike the bottom-left part rectangles. */
export function badgeBoxesOverlap(a, b, gap = 0) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap - EPSILON
    && Math.abs(a.z - b.z) < (a.height + b.height) / 2 + gap - EPSILON;
}

function contains(rect, { x, z }) {
  if (rect.outline) {
    let inside = false;
    const points = rect.outline;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [ax, az] = points[j];
      const [bx, bz] = points[i];
      const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax);
      if (Math.abs(cross) < EPSILON && x >= Math.min(ax, bx) - EPSILON
        && x <= Math.max(ax, bx) + EPSILON && z >= Math.min(az, bz) - EPSILON
        && z <= Math.max(az, bz) + EPSILON) return true;
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  }
  return x >= rect.x - EPSILON && x <= rect.x + rect.width + EPSILON
    && z >= rect.z - EPSILON && z <= rect.z + rect.height + EPSILON;
}

function visible(badge, point) {
  return contains(badge.rect, point) && !(badge.blockers ?? []).some((blocker) =>
    contains(blocker, point) && !(blocker.holes ?? []).some((hole) => contains(hole, point)));
}

function steps(prefer, min, max, step) {
  const values = [prefer];
  for (let k = 1; k < 40; k += 1) {
    const above = prefer + k * step;
    const below = prefer - k * step;
    if (above <= max + EPSILON && above >= min - EPSILON) values.push(above);
    if (below >= min - EPSILON && below <= max + EPSILON) values.push(below);
    if (above > max && below < min) break;
  }
  return values.filter((value) => value >= min - EPSILON && value <= max + EPSILON);
}

function candidates(badge, gap) {
  const { rect, prefer, width, height, axis } = badge;
  const zs = axis === 'horizontal' || rect.height < height ? [prefer.z]
    : steps(prefer.z, rect.z + height / 2, rect.z + rect.height - height / 2, height + gap);
  const xs = axis !== 'vertical' && rect.width >= width + 2 * gap
    ? steps(prefer.x, rect.x + width / 2, rect.x + rect.width - width / 2, width + gap)
    : [prefer.x];
  return xs.flatMap((x) => zs.map((z) => ({ x, z })))
    .sort((a, b) => ((a.x - prefer.x) ** 2 + (a.z - prefer.z) ** 2)
      - ((b.x - prefer.x) ** 2 + (b.z - prefer.z) ** 2)
      || Math.abs(a.x - prefer.x) - Math.abs(b.x - prefer.x))
    .slice(0, 40);
}

/** Find the first visible interval at this x, starting at the edge nearest the badge. */
function leaderTarget(badge, above) {
  const x = badge.prefer.x;
  const { rect } = badge;
  const levels = [rect.z, rect.z + rect.height];
  for (const shape of (badge.blockers ?? []).flatMap((blocker) => [blocker, ...(blocker.holes ?? [])])) {
    if (shape.outline) {
      shape.outline.forEach(([ax, az], index, points) => {
        const [bx, bz] = points[(index + 1) % points.length];
        if (ax === bx) {
          if (Math.abs(x - ax) < EPSILON) levels.push(az, bz);
        } else if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx)) {
          levels.push(az + (bz - az) * (x - ax) / (bx - ax));
        }
      });
    } else levels.push(shape.z, shape.z + shape.height);
  }
  const ordered = [...new Set(levels.filter((z) => z >= rect.z && z <= rect.z + rect.height))]
    .sort((a, b) => above ? b - a : a - b);
  for (let i = 0; i < ordered.length; i += 1) {
    const z = ordered[i];
    if (visible(badge, { x, z })) return { x, z };
    if (i + 1 < ordered.length) {
      const next = ordered[i + 1];
      if (visible(badge, { x, z: (z + next) / 2 })) {
        return { x, z: z + Math.sign(next - z) * Math.min(1e-6, Math.abs(next - z) / 2) };
      }
    }
  }
  return badge.prefer;
}

/** Place most constrained parts first, returning badges in their original drawing order. */
export function placePartBadges(badges, { gap, taken = [] }) {
  const occupied = [...taken];
  const result = new Array(badges.length);
  const ordered = badges.map((badge, index) => ({ badge, index })).sort(({ badge: a }, { badge: b }) =>
    Number(b.axis === 'horizontal') - Number(a.axis === 'horizontal')
    || a.rect.width - b.rect.width || a.prefer.x - b.prefer.x || a.prefer.z - b.prefer.z);
  for (const { badge, index } of ordered) {
    const { key, text, width, height, rect, prefer } = badge;
    const free = (point) => !occupied.some((box) => badgeBoxesOverlap({ ...point, width, height }, box, gap));
    let point = candidates(badge, gap).find((candidate) => visible(badge, candidate) && free(candidate));
    let leader = null;
    if (!point) {
      const fallback = [1, -1].flatMap((direction) => Array.from({ length: 4 }, (_, k) => ({
        x: prefer.x,
        z: (direction === 1 ? rect.z + rect.height : rect.z)
          + direction * (gap + height / 2 + k * (height + gap)),
      })));
      point = fallback.find(free) ?? fallback[3];
      const above = point.z > rect.z + rect.height;
      const target = leaderTarget(badge, above);
      leader = { x1: point.x, z1: point.z + (above ? -height / 2 : height / 2), x2: target.x, z2: target.z };
    }
    result[index] = { key, text, ...point, width, height, leader };
    occupied.push(result[index]);
  }
  return result;
}
