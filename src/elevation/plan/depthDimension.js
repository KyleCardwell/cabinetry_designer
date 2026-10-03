import { CABINET_TYPE_IDS } from '../model/constants.js';
import { formatInches } from '../model/units.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';

export const DEPTH_LANE_SHIFT = 28;
export const DEPTH_POPOUT_LEADER = 10;
export const DEPTH_LANES = {
  [CABINET_TYPE_IDS.BASE]: 0,
  [CABINET_TYPE_IDS.UPPER]: -1,
  [CABINET_TYPE_IDS.TALL]: 1,
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function depthDimension(run, depth, scale, fontSize = PLAN_DIM_FONT_SIZE) {
  const lane = DEPTH_LANES[run.cabinetTypeId] ?? 0;
  const side = lane < 0 ? -1 : 1;
  const margin = Math.min(run.width / 2, 6 / scale);
  const x = clamp(
    run.x + run.width / 2 + lane * DEPTH_LANE_SHIFT / scale,
    run.x + margin,
    run.x + run.width - margin,
  );
  const textPx = formatInches(depth).length * 0.6 * fontSize + 8;
  const fits = depth * scale >= textPx + 4;
  const offset = depth / 2;

  if (fits) {
    return { x, fits, label: { x, offset }, leader: null };
  }

  return {
    x,
    fits,
    label: {
      x: x + side * (DEPTH_POPOUT_LEADER + 2 + fontSize / 2) / scale,
      offset,
    },
    leader: {
      x1: x,
      x2: x + side * DEPTH_POPOUT_LEADER / scale,
      offset,
    },
  };
}
