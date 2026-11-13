import { DEFAULT_SETTINGS } from './constants.js';

/** Shop standard member widths, including the bead on each exposed edge. */
export function frameStandards(insetFrame, bead = 0) {
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...insetFrame };
  return {
    'left-stile': 2 * frame.stile + bead,
    'right-stile': 2 * frame.stile + bead,
    'top-rail': frame.rail + bead,
    'bottom-rail': frame.rail + bead,
    stile: 2 * frame.stile + 2 * bead,
    rail: frame.rail + 2 * bead,
    'mid-rail': frame.midRail + 2 * bead,
    mullion: frame.mullion + 2 * bead,
  };
}
