import { cornerParts } from './cornerParts.js';
import { wallFrame } from './geometry.js';
import { resolveProfile } from './profile.js';
import { resolveSoffitSpan, soffitsOn } from './soffits.js';
import { runTop } from './tops.js';
import { wallSideView } from './wallSides.js';

/** The bounds of everything drawn in one wall elevation, its neighbours' corner returns and profiles included, bands and all (SPEC-43.4). */
export function wallExtent(room, wall, settings) {
  const view = wallSideView(wall, wall.side ?? 'front');
  const length = wallFrame(room, view).length;
  const profile = resolveProfile(settings, room, wall);
  const extent = {
    left: 0,
    right: length,
    top: wall.height,
    bottom: 0,
  };

  for (const run of view.runs) {
    const top = runTop(view, run, profile);
    extent.left = Math.min(extent.left, run.x);
    extent.right = Math.max(extent.right, run.x + run.width);
    extent.bottom = Math.min(extent.bottom, run.z);
    extent.top = Math.max(extent.top, run.z + run.height + top.height);
  }

  for (const soffit of soffitsOn(view)) {
    const span = resolveSoffitSpan(room, view, soffit);
    extent.left = Math.min(extent.left, span.x);
    extent.right = Math.max(extent.right, span.x + span.width);
  }

  for (const part of cornerParts(room, wall, wall.side ?? 'front', settings)) {
    extent.left = Math.min(extent.left, part.x);
    extent.right = Math.max(extent.right, part.x + part.width);
    extent.bottom = Math.min(extent.bottom, part.z);
    extent.top = Math.max(extent.top, part.z + part.height);
  }

  return extent;
}
