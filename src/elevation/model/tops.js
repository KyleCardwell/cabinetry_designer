import { CABINET_TYPE_IDS } from './constants.js';
import { moldingStack } from './profile.js';
import { runMolding } from './soffits.js';

export const TOP_LABELS = {
  stone: 'Stone countertop',
  wood: 'Shop-built wood top',
  crown: 'Crown',
  topMold: 'Top mold',
  none: 'None',
};

/** Whether a top is a countertop (stone or shop-built wood) rather than a molding. */
export function isCountertop(kind) {
  return kind === 'stone' || kind === 'wood';
}

/**
 * The top a run gets when run.top is unset — today's behaviour: none under a run it's held under,
 * stone on a base, the soffit's molding (or crown) on an auto-height upper or tall, otherwise none.
 */
export function defaultRunTop(wall, run, profile) {
  if (run.stack?.above) return 'none';
  if (run.cabinetTypeId === CABINET_TYPE_IDS.BASE) return 'stone';
  if (run.heightMode !== 'auto') return 'none';
  return runMolding(wall, run, profile);
}

/** The part on top of a run: its kind and height. `profile` is the wall's resolved profile. */
export function runTop(wall, run, profile) {
  const kind = run.top ?? defaultRunTop(wall, run, profile);
  const countertop = run.overrides?.countertopThickness ?? profile.countertopThickness;
  const height = isCountertop(kind) ? countertop
    : kind === 'crown' ? moldingStack(profile)
      : kind === 'topMold' ? profile.topMoldHeight
        : 0;
  return { kind, height };
}
