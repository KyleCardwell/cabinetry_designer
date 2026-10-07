import { frontDepth, runBackOffset } from './corners.js';
import { resolveProfile } from './profile.js';
import { bandDepths, hasToeKick } from './bandDepths.js';
import { isCountertop, runTop } from './tops.js';

const EPSILON = 1e-6;

/**
 * A run seen from its side (SPEC-42.2): its toe kick, box, faces, then its countertop or its top mold and
 * crown, each as { piece, z, height, back, front } with back and front measured from the run's wall face
 * (the plan view's numbers). The placeholder shape until profiles: the toe kick sits back from the box by
 * its setback, the faces stand off the box (doors and bumper, or the frame), a top runs past the faces by
 * its overhang or projection, and the top mold stops under the crown. `wall` is the run's resolved face.
 */
export function runSide(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const depths = bandDepths(settings);
  const top = runTop(wall, run, profile);
  const back = runBackOffset(run);
  const boxFront = back + run.depth;
  const faces = frontDepth(run, settings);
  const boxTop = run.z + run.height;
  const crownZ = boxTop + profile.crownStackHeight - profile.crownHeight;
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const pieces = [];
  const add = (piece, z, height, from, to) => {
    if (height > EPSILON && to - from > EPSILON) pieces.push({ piece, z, height, back: from, front: to });
  };

  if (hasToeKick(run)) add('toe_kick', 0, toeKickHeight, back, boxFront - depths.toeKickSetback);
  add('box', run.z, run.height, back, boxFront);
  add('faces', run.z, run.height, boxFront, faces);
  if (isCountertop(top.kind)) add('countertop', boxTop, top.height, back, faces + depths.countertopOverhang);
  if (top.kind === 'crown' || top.kind === 'topMold') {
    const height = top.kind === 'crown'
      ? Math.min(profile.topMoldHeight, crownZ - boxTop)
      : profile.topMoldHeight;
    add('top_mold', boxTop, height, back, faces + depths.topMoldProjection);
  }
  if (top.kind === 'crown') add('crown', crownZ, profile.crownHeight, back, faces + depths.crownProjection);
  return pieces;
}
