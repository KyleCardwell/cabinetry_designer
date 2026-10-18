import { DEFAULT_SETTINGS } from './constants.js';

const MAX_PRESETS = 200;
const sixtyFourths = (value) => Math.round(value * 64) / 64;

function heightSettings(settings) {
  return { ...DEFAULT_SETTINGS.drawerBoxHeights, ...settings?.drawerBoxHeights };
}

/**
 * Preset drawer box heights, ascending (INTERIORS-PLAN ID11, ProBox): `from`..`to`, then
 * `thenFrom`..`max`, every `step`. Nothing above `max`; a bad step falls back to the default.
 */
export function drawerBoxHeights(settings) {
  const { from, to, thenFrom, max, step: rawStep } = heightSettings(settings);
  const step = rawStep > 0 ? rawStep : DEFAULT_SETTINGS.drawerBoxHeights.step;
  const heights = new Set();
  for (const [start, end] of [[from, Math.min(to, max)], [thenFrom, max]]) {
    for (let i = 0; i < MAX_PRESETS && start + i * step <= end + 1e-9; i += 1) {
      const height = sixtyFourths(start + i * step);
      if (height > 0) heights.add(height);
    }
  }
  return [...heights].sort((a, b) => a - b);
}

/** A box taller than the shop normally builds (warning only; any height can be typed). */
export function isTallDrawerBox(height, settings) {
  return height > heightSettings(settings).warnAbove + 1e-9;
}
