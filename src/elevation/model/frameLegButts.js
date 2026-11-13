import { frontDepth } from './corners.js';
import { frameStandards } from './frameStandards.js';
import { runLegs } from './legs.js';

const EPSILON = 1e-6;

/**
 * Covered end joints, in the run's elevation coordinates. Each joint supplies the panel's
 * x/width, the frame's z/height, and its stored frame choice (absent means Auto).
 */
export function frameLegButts(room, wall, run, settings, joints) {
  const butts = {};
  if (!wall || !Object.keys(joints).length) return butts;
  const legs = runLegs(room, wall, run, settings);
  const front = frontDepth(run, settings);
  const standard = frameStandards(settings.insetFrame, run._frame?.bead ?? 0)['left-stile'];
  for (const [side, joint] of Object.entries(joints)) {
    if (joint.frame === 'miter') continue;
    const panelInside = side === 'left' ? joint.x + joint.width : joint.x;
    const covering = legs.filter(({ bounds, back }) => bounds.x <= joint.x + EPSILON
      && bounds.x + bounds.width >= joint.x + joint.width - EPSILON
      && back >= front - EPSILON
      && Math.min(bounds.z + bounds.height, joint.z + joint.height)
        - Math.max(bounds.z, joint.z) > EPSILON);
    const inside = ({ bounds }) => side === 'left' ? bounds.x + bounds.width : bounds.x;
    covering.sort((a, b) => side === 'left' ? inside(b) - inside(a) : inside(a) - inside(b));
    const leg = covering[0];
    if (!leg) continue;
    const legInside = inside(leg);
    const opening = legInside + (side === 'left' ? standard : -standard);
    const boxOutside = opening + (side === 'left' ? -0.75 : 0.75);
    if (side === 'left' ? boxOutside < panelInside - EPSILON : boxOutside > panelInside + EPSILON) continue;
    butts[side] = { legId: leg.leg.id, legInside, opening, panelInside };
  }
  return butts;
}
