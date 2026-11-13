import { bandDepths } from './bandDepths.js';
import { moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { waterfallEnds } from './runBands.js';
import { runTop } from './tops.js';

/** Core-edge overhangs in inches; missing sides inherit the resolved top's defaults. */
export function topOverhangs(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const top = runTop(wall, run, profile);
  const nosing = moldingProfiles(profile, settings, run).nosing;
  const hasNosing = top.kind === 'wood'
    && (nosingProjection(nosing) > 0 || woodTopSection(nosing, top.height, -run.depth) !== null);
  const past = hasNosing ? 0 : bandDepths(settings).countertopOverhang;
  const waterfall = waterfallEnds(room, wall, run, settings);
  const defaults = { front: past, back: 0, left: waterfall.left ? 0 : past, right: waterfall.right ? 0 : past };
  return Object.fromEntries(Object.entries(defaults).map(([side, fallback]) => {
    const value = run.topOverhang?.[side];
    return [side, Number.isFinite(value) && value >= 0 ? value : fallback];
  }));
}
