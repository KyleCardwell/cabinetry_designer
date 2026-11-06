import { legWarningSubject, runLegList } from './endLegs.js';
import { legFillPlans } from './legRoom.js';
import { runLegs } from './legs.js';
import { runFaceStyles } from './doorStyleResolve.js';

/** Panels inherit leg support; run fillers use box height. Retain warnings for skipped panels. */
export function runLegFills(room, wall, run, settings) {
  const placed = Object.assign([], { warnings: [] });
  const legs = new Map(runLegs(room, wall, run, settings).map((entry) => [entry.leg.id, entry]));
  // Match runFillerThickness locally: planPieces imports legRoom through the layout graph.
  const faces = runLegList(run).some(({ fill }) => fill?.type === 'filler')
    ? runFaceStyles(room, wall, run, settings) : [];
  const fillerThickness = faces.length && faces.every(({ design }) => design.slabCore === 'mdf')
    ? Math.max(...faces.map(({ style }) => style.thickness)) : settings.fillerThickness;
  for (const plan of legFillPlans(run, { ...settings, fillerThickness })) {
    const placement = legs.get(plan.legId);
    if (!placement) continue;
    const { leg } = plan;
    const subject = legWarningSubject(run, leg);
    const warn = (warning) => placed.warnings.push({ ...warning, ...subject, legId: leg.id });
    if (plan.warning) {
      warn(plan.warning);
      continue;
    }
    if (plan.type === 'filler') {
      placed.push({ id: `${leg.id}:fill`, leg, ...subject, type: 'filler', side: plan.side,
        bounds: { x: plan.u0, z: run.z, width: plan.width, height: run.height },
        face: plan.face, ret: plan.ret, front: plan.front, back: plan.back,
        thickness: plan.thickness, orderedDepth: plan.orderedDepth });
      continue;
    }
    const bottom = placement.bounds.z + (leg.fill.bottom ?? settings.legPanelBottomClearance);
    const top = run.z + run.height - (leg.fill.top ?? settings.legPanelTopClearance);
    const height = top - bottom;
    if (height <= 1e-6) {
      warn({ code: 'leg-fill-no-height', type: plan.type });
      continue;
    }
    (plan.warnings ?? []).forEach(warn);
    placed.push({ id: `${leg.id}:fill`, leg, ...subject, type: plan.type, side: plan.side,
      bounds: { x: plan.u0, z: bottom, width: plan.width, height },
      front: plan.front, back: plan.back, depth: plan.depth, thickness: plan.width,
      returns: plan.returns, ...(plan.returnDepth !== undefined ? { returnDepth: plan.returnDepth } : {}) });
  }
  return placed;
}
