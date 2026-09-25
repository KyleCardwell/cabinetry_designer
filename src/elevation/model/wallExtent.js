import { CABINET_TYPE_IDS } from './constants.js';
import { wallFrame } from './geometry.js';
import { neighborProfiles } from './neighborProfiles.js';
import { moldingStack, resolveProfile } from './profile.js';
import { resolveSoffitSpan, soffitsOn } from './soffits.js';
import { wallSideView } from './wallSides.js';

/** Return the bounds of everything drawn in one wall elevation. */
export function wallExtent(room, wall, settings) {
  const view = wallSideView(wall, wall.side ?? 'front');
  const length = wallFrame(room, view).length;
  const extent = {
    left: 0,
    right: length,
    top: wall.height,
    bottom: 0,
  };

  for (const run of view.runs) {
    const profileForRun = resolveProfile(
      { defaultProfile: resolveProfile(settings, room, wall) },
      null,
      { profile: run.overrides },
    );
    const hasMolding = run.heightMode === 'auto'
      && (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
        || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
    const stack = hasMolding ? moldingStack(profileForRun) : 0;

    extent.left = Math.min(extent.left, run.x);
    extent.right = Math.max(extent.right, run.x + run.width);
    extent.bottom = Math.min(extent.bottom, run.z);
    extent.top = Math.max(extent.top, run.z + run.height + stack);
  }

  for (const soffit of soffitsOn(view)) {
    const span = resolveSoffitSpan(room, view, soffit);
    extent.left = Math.min(extent.left, span.x);
    extent.right = Math.max(extent.right, span.x + span.width);
  }

  for (const profile of neighborProfiles(room, wall, settings)) {
    extent.left = Math.min(extent.left, profile.x);
    extent.right = Math.max(extent.right, profile.x + profile.width);
    for (const molding of profile.moldings) {
      extent.top = Math.max(extent.top, molding.z + molding.height);
    }
  }

  return extent;
}
