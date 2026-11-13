import { bandDepths } from './bandDepths.js';
import { sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';

/** SPEC-50.2 resolve molding picks, band heights and ordered warnings without fixing inputs. */
export function moldingProfiles(profile, settings, run) {
  const warnings = [];
  const pick = (id, kind) => {
    if (id === null || id === undefined || id === 'none') return null;
    const picked = (settings?.sectionProfiles ?? []).find((entry) => entry.id === id && entry.kind === kind);
    if (!picked) warnings.push({ code: 'molding-profile-missing', slot: kind });
    return picked ?? null;
  };
  const state = (id) => id === 'none' ? 'none' : id == null ? 'unpicked' : 'profile';
  const picked = { topMold: state(profile.topMoldProfileId), crown: state(profile.crownProfileId) };
  const topMoldProfile = pick(profile.topMoldProfileId, 'top_mold');
  const crownProfile = pick(profile.crownProfileId, 'crown');
  const nosingProfile = pick(run?.overrides?.nosingProfileId === undefined
    ? profile.nosingProfileId : run.overrides.nosingProfileId, 'nosing');
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
  const nosing = resolve(nosingProfile);
  const topMoldHeight = topMold?.height ?? profile.topMoldHeight;
  const crownHeight = crown?.height ?? profile.crownHeight;
  if (picked.crown === 'unpicked') warnings.push({ code: 'crown-unpicked' });
  if (picked.topMold === 'unpicked') warnings.push({ code: 'top-mold-unpicked' });
  if (picked.crown === 'profile' && (picked.topMold === 'profile' || picked.topMold === 'none')
    && (picked.topMold === 'none' ? 0 : topMoldHeight) + crownHeight < profile.crownStackHeight) {
    warnings.push({ code: 'crown-gap' });
  }
  if (picked.crown === 'profile' && picked.topMold === 'profile' && topMoldHeight > profile.crownStackHeight) {
    warnings.push({ code: 'top-mold-above-crown' });
  }
  const gap = profile.crownStackHeight - topMoldHeight;
  if (picked.crown === 'none' && picked.topMold === 'profile' && gap > 1 / 64) {
    warnings.push({ code: 'top-mold-gap', gap });
  }
  return { overhang: profile.topMoldOverhang, topMold, crown, nosing, picked, warnings };
}

/** Molding front projection and free-end return past the run's faces. */
export function moldingPast(moldings, band, settings) {
  const picked = moldings[band];
  const maxX = picked ? sectionProfileBounds({ geometry: picked.geometry }).maxX : 0;
  if (band === 'topMold') return moldings.overhang + Math.max(0, maxX);
  const overhang = moldings.picked.topMold === 'none' ? 0 : moldings.overhang;
  return picked ? overhang + maxX : bandDepths(settings).crownProjection;
}
