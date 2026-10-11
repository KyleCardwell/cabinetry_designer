import { hasToeKick } from './bandDepths.js';
import { bandOutline, endEdgeX, frontContour, placeAtEnd } from './bandEnds.js';
import { resolveProfile } from './profile.js';
import { outlineBounds, sectionProfileOutline } from './sectionProfileOutline.js';
import { sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';

const EPSILON = 1e-6;

/** Resolve a run's floor base and its profile, stretching furniture bases down from their top. */
export function runBase(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const height = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const proud = run.overrides?.furnitureBaseProud ?? profile.furnitureBaseProud;
  const kind = hasToeKick(run) && height > 0
    ? run.overrides?.baseKind ?? profile.baseKind
    : null;
  const warnings = [];
  const result = { kind, height, proud, picked: null, warnings };
  if (kind !== 'furniture_base') return result;

  const id = run.overrides?.furnitureBaseProfileId === undefined
    ? profile.furnitureBaseProfileId : run.overrides.furnitureBaseProfileId;
  if (id === null || id === undefined) return result;
  const picked = (settings?.sectionProfiles ?? [])
    .find((entry) => entry.id === id && entry.kind === 'furniture_base');
  if (!picked) {
    warnings.push({ code: 'molding-profile-missing', slot: 'furniture_base' });
    return result;
  }

  const geometry = stretchProfileGeometry(picked, -height);
  if (geometry === null) warnings.push({ code: 'furniture-base-too-short' });
  if (!Object.hasOwn(picked, 'stretch')) {
    const { minY, maxY } = sectionProfileBounds(picked);
    if (Math.abs(maxY - minY - height) > EPSILON) {
      warnings.push({ code: 'furniture-base-height-mismatch' });
    }
  }
  result.picked = { profile: picked, geometry: geometry ?? picked.geometry };
  return result;
}

/** Front projection and free-end return, including any profile that projects beyond its origin. */
export function furnitureBasePast(base) {
  const maxX = base.picked ? sectionProfileBounds({ geometry: base.picked.geometry }).maxX : 0;
  return base.proud + Math.max(0, maxX);
}

/** Place the floor band and stop its profile lines on the returned or coped end contours. */
export function furnitureBaseBand(base, ends) {
  const [left, right] = ends;
  const rect = { x: left.x, z: 0, width: right.x - left.x, height: base.height, lines: [] };
  if (!base.picked) return rect;
  const edges = ends.map((end, index) => {
    const source = end.base ?? base;
    const loop = source.picked && sectionProfileOutline(source.picked.geometry);
    const outline = end.outline ?? (loop && end.type !== 'square' && end.side !== undefined
      ? placeAtEnd(loop, end.side, source.proud, source.height, end.facing) : null);
    return (outline && frontContour(outline, end.facing ?? (index === 0 ? 1 : -1)))
      ?? [[end.x, 0, 0], [end.x, base.height, 0]];
  });
  rect.outline = bandOutline(...edges, 0, base.height);
  const { minX, maxX } = outlineBounds(rect.outline);
  rect.x = minX;
  rect.width = maxX - minX;
  for (const id of base.picked.profile.drawnPoints.elevation ?? []) {
    const z = base.height + base.picked.geometry.points[id][1];
    if (Math.abs(z) <= EPSILON || Math.abs(z - base.height) <= EPSILON
      || rect.lines.some((line) => Math.abs(line.z1 - z) <= EPSILON)) continue;
    rect.lines.push({ x1: endEdgeX(edges[0], z, -1), z1: z,
      x2: endEdgeX(edges[1], z, 1), z2: z });
  }
  return rect;
}
