import { bandDepths } from './bandDepths.js';
import { sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';

/** SPEC-50.2 resolve molding picks, band heights and ordered warnings without fixing inputs. */
export function moldingProfiles(profile, settings) {
  const warnings = [];
  const pick = (id, kind) => {
    if (id === null || id === undefined) return null;
    const picked = (settings?.sectionProfiles ?? []).find((entry) => entry.id === id && entry.kind === kind);
    if (!picked) warnings.push({ code: 'molding-profile-missing', slot: kind });
    return picked ?? null;
  };
  const topMoldProfile = pick(profile.topMoldProfileId, 'top_mold');
  const crownProfile = pick(profile.crownProfileId, 'crown');
  const resolve = (picked, target) => {
    if (!picked) return null;
    const { minY, maxY } = sectionProfileBounds(picked);
    const geometry = stretchProfileGeometry(picked, target);
    if (geometry === null) warnings.push({ code: 'top-mold-too-short' });
    if (!picked.geometry.loops.some((loop) => loop.closed)) {
      warnings.push({ code: 'molding-profile-open', slot: picked.kind });
    }
    return {
      profile: picked,
      geometry: geometry ?? picked.geometry,
      height: picked.kind === 'top_mold' && Object.hasOwn(picked, 'stretch') ? target : maxY - minY,
    };
  };
  const topMold = resolve(topMoldProfile, profile.topMoldHeight);
  const crown = resolve(crownProfile);
  const topMoldHeight = topMold?.height ?? profile.topMoldHeight;
  const crownHeight = crown?.height ?? profile.crownHeight;
  if (topMoldHeight + crownHeight - profile.crownStackHeight < 0) warnings.push({ code: 'crown-gap' });
  if (topMoldHeight > profile.crownStackHeight) warnings.push({ code: 'top-mold-above-crown' });
  return { overhang: profile.topMoldOverhang, topMold, crown, warnings };
}

/** Molding front projection and free-end return past the run's faces. */
export function moldingPast(moldings, band, settings) {
  const picked = moldings[band];
  const maxX = picked ? sectionProfileBounds({ geometry: picked.geometry }).maxX : 0;
  if (band === 'topMold') return moldings.overhang + Math.max(0, maxX);
  return picked ? moldings.overhang + maxX : bandDepths(settings).crownProjection;
}
