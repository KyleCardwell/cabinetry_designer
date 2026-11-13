import { bandOutline } from './bandEnds.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { flattenOutline, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
import { isProfileGeometry, sectionProfileBounds } from './sectionProfiles.js';

const EPSILON = 1e-6;

/** Resolve floor edges from at most two stored dimensions, even for skipped cutouts. */
export function baseCutoutSpan(cutout, cabinets, settings) {
  const from = cabinets.find((piece) => piece.id === cutout.from);
  const to = cabinets.find((piece) => piece.id === cutout.to);
  if (!from || !to) return null;
  const s0 = Math.min(from.x, to.x);
  const s1 = Math.max(from.x + from.width, to.x + to.width);
  const foot = settings.baseCutoutFoot ?? DEFAULT_SETTINGS.baseCutoutFoot;
  let x0 = s0 + (cutout.left ?? foot);
  let x1 = s1 - (cutout.right ?? foot);
  if (cutout.width !== undefined) {
    if (cutout.left !== undefined) x1 = x0 + cutout.width;
    else if (cutout.right !== undefined) x0 = x1 - cutout.width;
    else {
      const center = (s0 + s1) / 2;
      x0 = center - cutout.width / 2;
      x1 = center + cutout.width / 2;
    }
  }
  return { s0, s1, x0, x1, width: x1 - x0 };
}

function reverseChain(chain) {
  return [...chain].reverse().map(([x, y], index) => [x, y,
    index < chain.length - 1 ? -chain[chain.length - 2 - index][2] || 0 : 0,
  ]);
}

/** Read an open floor-to-top chain, using the section reader to retain and split arcs. */
export function cutoutProfile(profile) {
  if (profile?.kind !== 'base_cutout' || !isProfileGeometry(profile.geometry)) return null;
  const geometry = profile.geometry;
  const loop = geometry.loops.find((entry) => entry.closed === false && entry.segs.length);
  if (!loop || loop.segs.some((seg, i) => i && seg.from !== loop.segs[i - 1].to)) return null;
  const start = loop.segs[0].from;
  const end = loop.segs.at(-1).to;
  const points = Object.fromEntries(loop.segs.flatMap(({ from, to }) => (
    [[from, geometry.points[from]], [to, geometry.points[to]]]
  )));
  const atOrigin = ([x, y]) => Math.abs(x) <= EPSILON && Math.abs(y) <= EPSILON;
  if (!atOrigin(points[start]) && !atOrigin(points[end])) return null;
  const far = atOrigin(points[start]) ? points[end] : points[start];
  const bounds = sectionProfileBounds({ geometry: { ...geometry, points, loops: [loop] } });
  if (bounds.minX < -EPSILON || bounds.minY < -EPSILON || far[1] <= 0
    || Math.abs(far[1] - bounds.maxY) > EPSILON) return null;
  const closed = { ...loop, closed: true,
    segs: [...loop.segs, { type: 'line', from: end, to: start }] };
  const chain = sectionProfileOutline({ ...geometry, points, loops: [closed] });
  return atOrigin(points[start]) ? chain : reverseChain(chain);
}

/** Resolve and sort cutouts against the bottom cabinets and the band's actual floor ends. */
export function resolveBaseCutouts(run, settings, profile, base, pieces, band) {
  const cutouts = [];
  const warnings = [];
  const warn = (code, id) => warnings.push({ code, cutoutId: id });
  const cabinets = pieces.filter((piece) => piece.kind === 'cabinet'
    && Math.abs(piece.z - run.z) <= EPSILON);
  const candidates = [];
  for (const cutout of run.baseCutouts ?? []) {
    const { id } = cutout;
    if (base.kind !== 'furniture_base' || !band || band.width <= 0) {
      warn('base-cutout-no-base', id);
      continue;
    }
    const span = baseCutoutSpan(cutout, cabinets, settings);
    if (!span) {
      warn('base-cutout-orphaned', id);
      continue;
    }
    const { x0, x1, width } = span;
    const profileId = cutout.profileId === undefined ? profile.baseCutoutProfileId : cutout.profileId;
    let half = null;
    if (profileId !== null && profileId !== undefined) {
      const picked = settings.sectionProfiles?.find((entry) => entry.id === profileId);
      half = cutoutProfile(picked);
      if (!half) warn('base-cutout-profile-bad', id);
      if (half && Number.isFinite(picked.topGap) && picked.topGap > 0) {
        const d = base.height - picked.topGap - half.at(-1)[1];
        if (d > EPSILON) {
          half = [[0, 0, 0], ...transformOutline(half, ([x, y]) => [x, y + d])];
        } else if (d < -EPSILON) warn('base-cutout-too-short', id);
      }
    }
    half ??= [[0, 0, 0], [0, settings.baseCutoutHeight ?? DEFAULT_SETTINGS.baseCutoutHeight, 0]];
    const [farX, h] = half.at(-1);
    if (width <= 0 || width < 2 * farX) {
      warn('base-cutout-too-narrow', id);
      continue;
    }
    if (h >= base.height) {
      warn('base-cutout-too-tall', id);
      continue;
    }
    const left = transformOutline(half, ([x, y]) => [x0 + x, y]);
    const right = reverseChain(transformOutline(half, ([x, y]) => [x1 - x, y], true));
    // Equal far ends share one point; its outgoing bulge belongs to the descending half.
    const chain = width === 2 * farX ? [...left.slice(0, -1), ...right] : [...left, ...right];
    candidates.push({ id, x0, x1, h, chain });
  }
  const outline = band?.outline;
  const floorLeft = outline ? outline[0][0] : band?.x;
  const floorRight = outline ? outline[1][0] : band?.x + band?.width;
  for (const cutout of candidates.sort((a, b) => a.x0 - b.x0)) {
    if (cutout.x0 < floorLeft - EPSILON || cutout.x1 > floorRight + EPSILON
      || (cutouts.length && cutout.x0 < cutouts.at(-1).x1 - EPSILON)) {
      warn('base-cutout-overlap', cutout.id);
    } else cutouts.push(cutout);
  }
  return { cutouts, warnings };
}

/** Intervals of the flattened cutout void at a drawn line's height, including its top edge. */
function voidIntervals(cutout, z) {
  if (z < 0 || z > cutout.h + EPSILON) return [];
  const flat = flattenOutline(cutout.chain);
  const crossings = [];
  const intervals = [];
  flat.forEach(([x, y], index) => {
    const [tx, ty] = flat[(index + 1) % flat.length];
    if (Math.abs(y - z) <= EPSILON && Math.abs(ty - z) <= EPSILON) {
      intervals.push([Math.min(x, tx), Math.max(x, tx)]);
    } else if ((y > z) !== (ty > z)) {
      crossings.push(x + (tx - x) * (z - y) / (ty - y));
    }
  });
  crossings.sort((a, b) => a - b);
  for (let i = 0; i + 1 < crossings.length; i += 2) intervals.push([crossings[i], crossings[i + 1]]);
  return intervals;
}

/** Insert floor chains without changing the end contours, and trim lines out of each void. */
export function insertBaseCutouts(band, cutouts) {
  if (!cutouts.length) return band;
  const outline = band.outline ?? bandOutline(
    [[band.x, 0, 0], [band.x, band.height, 0]],
    [[band.x + band.width, 0, 0], [band.x + band.width, band.height, 0]], 0, band.height,
  );
  const bottom = [[...outline[0]]];
  const append = (point) => {
    const last = bottom.at(-1);
    if (Math.abs(last[0] - point[0]) <= EPSILON && Math.abs(last[1] - point[1]) <= EPSILON) {
      last[2] = point[2];
    } else bottom.push([...point]);
  };
  cutouts.forEach(({ chain }) => chain.forEach(append));
  append(outline[1]);
  const lines = (band.lines ?? []).flatMap((line) => {
    let spans = [[line.x1, line.x2]];
    for (const cutout of cutouts) {
      for (const [start, end] of voidIntervals(cutout, line.z1)) {
        spans = spans.flatMap(([x0, x1]) => {
          if (end <= x0 || start >= x1) return [[x0, x1]];
          return [[x0, Math.min(x1, start)], [Math.max(x0, end), x1]]
            .filter(([a, b]) => b - a > EPSILON);
        });
      }
    }
    return spans.map(([x1, x2]) => ({ ...line, x1, x2 }));
  });
  return { ...band, outline: [...bottom, ...outline.slice(2)], lines };
}
