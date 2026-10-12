import { frontDepth, runBackOffset } from './corners.js';
import { resolveProfile } from './profile.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
import { bandDepths } from './bandDepths.js';
import { runBaseProfile as runBase } from './furnitureBase.js';
import { isCountertop, runTop } from './tops.js';

const EPSILON = 1e-6;

/**
 * A run seen from its side (SPEC-42.2): its floor base, box, faces, then its countertop or its top mold and
 * crown, each as { piece, z, height, back, front } with back and front measured from the run's wall face
 * (the plan view's numbers). With a molding profile, outline carries its placed closed loop. Otherwise,
 * the toe kick sits back from the box by its setback, the faces stand off the box (doors and bumper, or the frame), a top runs past the faces by
 * its overhang or projection, and the top mold stops under the crown. `wall` is the run's resolved face.
 */
export function runSide(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const moldings = moldingProfiles(profile, settings, run);
  const depths = bandDepths(settings);
  const top = runTop(wall, run, profile);
  const back = runBackOffset(run);
  const boxFront = back + run.depth;
  const faces = frontDepth(run, settings);
  const boxTop = run.z + run.height;
  const crownZ = boxTop + profile.crownStackHeight - profile.crownHeight;
  const base = runBase(room, wall, run, settings);
  const pieces = [];
  const add = (piece, z, height, from, to) => {
    if (height > EPSILON && to - from > EPSILON) pieces.push({ piece, z, height, back: from, front: to });
  };
  const addMolding = (piece, picked, reference, z, height, front,
    { from = back, overhang = moldings.overhang } = {}) => {
    const loop = picked && sectionProfileOutline(picked.geometry);
    if (!loop) {
      add(piece, z, height, from, front);
      return;
    }
    const outline = transformOutline(loop, ([x, y]) => [faces + overhang + x, reference + y]);
    const { minX, maxX, minY, maxY } = outlineBounds(outline);
    pieces.push({
      piece, z: minY, height: maxY - minY,
      back: minX, front: maxX, outline,
    });
  };

  if (base.kind === 'toe_kick') {
    add('toe_kick', 0, base.height, back, boxFront - depths.toeKickSetback);
  } else if (base.kind === 'furniture_base') {
    addMolding('furniture_base', base.picked, base.height, 0, base.height, faces + base.proud,
      { from: faces, overhang: base.proud });
  }
  add('box', run.z, run.height, back, boxFront);
  add('faces', run.z, run.height, boxFront, faces);
  if (isCountertop(top.kind)) {
    const core = faces + depths.countertopOverhang;
    const section = top.kind === 'wood' && woodTopSection(moldings.nosing, top.height, back - core);
    if (section) {
      const reference = boxTop + top.height;
      pieces.push({ piece: 'countertop', z: reference + section.minY, height: -section.minY,
        back, front: core + nosingProjection(moldings.nosing),
        outline: transformOutline(section.outline, ([x, y]) => [core + x, reference + y]),
      });
    } else add('countertop', boxTop, top.height, back, core);
  }
  if (top.kind === 'crown' || top.kind === 'topMold') {
    const height = top.kind === 'crown' && !moldings.topMold
      ? Math.min(profile.topMoldHeight, crownZ - boxTop)
      : profile.topMoldHeight;
    addMolding('top_mold', moldings.topMold, boxTop, boxTop, height,
      faces + moldingPast(moldings, 'topMold', settings));
  }
  if (top.kind === 'crown') addMolding('crown', moldings.crown,
    boxTop + profile.crownStackHeight, crownZ, profile.crownHeight,
    faces + moldingPast(moldings, 'crown', settings));
  return pieces;
}
