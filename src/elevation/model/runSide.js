import { frontDepth, runBackOffset } from './corners.js';
import { bandOutline, endEdgeX, frontContour } from './bandEnds.js';
import { runSections } from './runSections.js';
import { cornerShapes } from './cornerParts.js';
import { runBaseProfile as runBase } from './furnitureBase.js';
import { runBandEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { wallEndPanels } from './wallEndPanels.js';
import { wallSideOf } from './wallSides.js';

const EPSILON = 1e-6;

/** A run's sections for side and end drawings. */
export function runSide(room, wall, run, settings) {
  return runSections(room, wall, run, settings);
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
    const z = Math.max(panel.bottom, base ? base.z + base.height : 0);
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
