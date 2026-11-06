import { legFillPlans } from './legRoom.js';
import { runLegs } from './legs.js';

/** Fill placements inherit their leg's resolved support, retaining warnings for skipped fills. */
export function runLegFills(room, wall, run, settings) {
  const placed = Object.assign([], { warnings: [] });
  const legs = new Map(runLegs(room, wall, run, settings).map((entry) => [entry.index, entry]));
  for (const plan of legFillPlans(run, settings)) {
    const placement = legs.get(plan.index);
    if (!placement) continue;
    const { leg, index } = plan;
    const warn = (warning) => placed.warnings.push({ ...warning, index, legId: leg.id });
    if (plan.warning) {
      warn(plan.warning);
      continue;
    }
    const bottom = placement.bounds.z + (leg.fill.bottom ?? settings.legPanelBottomClearance);
    const top = run.z + run.height - (leg.fill.top ?? settings.legPanelTopClearance);
    const height = top - bottom;
    if (height <= 1e-6) {
      warn({ code: 'leg-fill-no-height', type: plan.type });
      continue;
    }
    placed.push({ id: `${leg.id}:fill`, leg, index, type: plan.type, side: plan.side,
      bounds: { x: plan.u0, z: bottom, width: plan.width, height },
      front: plan.front, back: plan.back, depth: plan.depth, thickness: plan.width });
  }
  return placed;
}
