import { frontDepth, runBackOffset } from './corners.js';
import { bandOutline, endEdgeX, frontContour } from './bandEnds.js';
import { cornerShapes } from './cornerParts.js';
import { resolveProfile } from './profile.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
import { bandDepths } from './bandDepths.js';
import { runBaseProfile as runBase } from './furnitureBase.js';
import { isCountertop, runMoldings, runTop } from './tops.js';
import { topOverhangs } from './topOverhang.js';
import { runBandEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { wallEndPanels } from './wallEndPanels.js';
import { wallSideOf } from './wallSides.js';

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
    const overhangs = topOverhangs(room, wall, run, settings);
    const core = faces + overhangs.front;
    const topBack = back - overhangs.back;
    const section = top.kind === 'wood' && woodTopSection(moldings.nosing, top.height, topBack - core);
    if (section) {
      const reference = boxTop + top.height;
      pieces.push({ piece: 'countertop', z: reference + section.minY, height: -section.minY,
        back: topBack, front: core + nosingProjection(moldings.nosing),
        outline: transformOutline(section.outline, ([x, y]) => [core + x, reference + y]),
      });
    } else add('countertop', boxTop, top.height, topBack, core);
  }
  const drawn = runMoldings(wall, run, profile, settings);
  if (drawn.topMold) {
    const height = drawn.crown && !moldings.topMold
      ? Math.min(profile.topMoldHeight, crownZ - boxTop)
      : profile.topMoldHeight;
    addMolding('top_mold', moldings.topMold, boxTop, boxTop, height,
      faces + moldingPast(moldings, 'topMold', settings));
  }
  if (drawn.crown) addMolding('crown', moldings.crown,
    boxTop + profile.crownStackHeight, crownZ, profile.crownHeight,
    faces + moldingPast(moldings, 'crown', settings),
    { overhang: moldings.picked.topMold === 'none' ? 0 : moldings.overhang });
  return pieces;
}

/**
 * A furniture base returned across a run's end (FX5.1): its profile's drawn points as lines from the wall back
 * to the profile, as the elevation draws them along the run. Lines are `{ back, front, z }` in depth.
 */
function baseReturnLines(room, wall, run, settings, piece, back) {
  const base = runBase(room, wall, run, settings);
  const contour = piece.outline && frontContour(piece.outline);
  if (!base.picked || !contour) return {};
  const lines = [];
  for (const id of base.picked.profile.drawnPoints?.elevation ?? []) {
    const z = base.height + base.picked.geometry.points[id][1];
    if (Math.abs(z) <= EPSILON || Math.abs(z - base.height) <= EPSILON
      || lines.some((line) => Math.abs(line.z - z) <= EPSILON)) continue;
    lines.push({ back, front: endEdgeX(contour, z, 1), z });
  }
  return lines.length ? { lines } : {};
}

/**
 * The wall end panel a run's `end` meets (FX5.1), seen end-on: one piece across the whole panel — this face's
 * depth, the wall and the other face's depth — sitting on the furniture base when there is one. Only the panel's
 * first run draws it (front face first), so an island's two faces don't draw it twice.
 */
function wallEndPanelPiece(room, wall, run, end, settings, pieces) {
  const face = wallSideOf(run);
  for (const panel of wallEndPanels(room, wall, settings)) {
    const mine = panel[face];
    const theirs = panel[face === 'front' ? 'back' : 'front'];
    if (mine.side !== end || mine.runIds[0] !== run.id) continue;
    if (face === 'back' && panel.front.runIds.length > 0) continue;
    const base = pieces.find(({ piece }) => piece === 'furniture_base');
    const z = base ? base.z + base.height : 0;
    if (panel.top - z <= EPSILON) continue;
    return [{
      piece: 'end_panel', z, height: panel.top - z, back: -(panel.thickness + theirs.depth), front: mine.depth,
      wallEndpoint: panel.endpoint,
    }];
  }
  return [];
}

/**
 * A run seen end-on: returning top bands fill back to the wall, with the visible end panel. `returnEnd` (a
 * return drawn in end view, FX5.1) also returns the furniture base and adds the wall end panel at that end.
 */
export function runEndView(room, wall, run, end, settings, { returnEnd = false } = {}) {
  const scene = runScene(room, wall, run, settings);
  const back = runBackOffset(run);
  let returns;
  // Band lookup uses raw sections so two end-view returns cannot recursively resolve each other.
  const getReturns = () => (returns ??= cornerShapes(room, wall, wall.side ?? 'front', settings,
    { profiles: false, returns: 'section' }));
  const bands = {
    countertop: 'countertop', top_mold: 'topMold', crown: 'crown',
    ...(returnEnd ? { furniture_base: 'furnitureBase' } : {}),
  };
  const pieces = runSide(room, wall, run, settings).map((piece) => {
    const band = bands[piece.piece];
    if (!band) return piece;
    const ends = runBandEnds(room, wall, run, settings, scene, band, piece.z, piece.height, getReturns);
    if (ends[end === 'left' ? 0 : 1].type !== 'return') return piece;
    return { ...piece, back,
      ...(piece.outline ? { outline: bandOutline(
        [[back, piece.z, 0], [back, piece.z + piece.height, 0]],
        frontContour(piece.outline), piece.z, piece.height,
      ) } : {}),
      ...(piece.piece === 'furniture_base' ? baseReturnLines(room, wall, run, settings, piece, back) : {}),
    };
  });
  if (run.ends?.[end]?.type === 'end_panel') {
    const panel = scene.drawnPieces.find(({ id, kind }) => id === `${run.id}:${end}` && kind === 'end_panel');
    if (panel) pieces.push({ piece: 'end_panel', z: panel.z, height: panel.height,
      back, front: frontDepth(run, settings) });
  }
  if (returnEnd) pieces.push(...wallEndPanelPiece(room, wall, run, end, settings, pieces));
  return pieces;
}
