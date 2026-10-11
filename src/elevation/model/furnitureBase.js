import { hasToeKick } from './bandDepths.js';
import { resolveProfile } from './profile.js';
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
