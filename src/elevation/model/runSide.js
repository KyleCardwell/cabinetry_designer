import { frontDepth, runBackOffset } from './corners.js';
import { bandOutline, clipEdgeBelow, endEdgeX, frontContour } from './bandEnds.js';
import { runSections } from './runSections.js';
import { bandPaths } from './bandPaths.js';
import { bandLineHeights, memberCaps } from './bandSweep.js';
import { buildingPaths } from './pathBuilding.js';
import { runScene } from './runScene.js';
import { wallEndPanels } from './wallEndPanels.js';
import { wallSideOf } from './wallSides.js';

const EPSILON = 1e-6;

/** A run's sections for side and end drawings. */
export function runSide(room, wall, run, settings) {
  return runSections(room, wall, run, settings);
}

/**
 * A band returned across a run's end (FX5.1 furniture base; crown, top mold and countertop nosing since D9): its
 * profile's drawn points as lines from the wall back to the profile, as the elevation draws them along the run.
 * Lines are `{ back, front, z }` in depth.
 */
function returnLines(room, wall, run, settings, piece, kind, back) {
  const contour = piece.outline && frontContour(piece.outline);
  if (!contour) return {};
  const lines = [];
  for (const z of bandLineHeights(room, wall, run, kind, settings)) {
    if (z <= piece.z + EPSILON || z >= piece.z + piece.height - EPSILON
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
 * Where both return, the crown laps over the top mold's top: cut the top mold (and its lines) at the crown's
 * bottom, as the elevation along the run hides it behind the crown.
 */
function lapUnderCrown(pieces, back) {
  const crown = pieces.find(({ piece, back: from }) => piece === 'crown' && Math.abs(from - back) <= EPSILON);
  const index = pieces.findIndex(({ piece, back: from }) => piece === 'top_mold' && Math.abs(from - back) <= EPSILON);
  const mold = pieces[index];
  if (!crown || !mold?.outline || crown.z >= mold.z + mold.height - EPSILON || crown.z <= mold.z + EPSILON) return;
  const edge = clipEdgeBelow(frontContour(mold.outline), crown.z);
  const height = crown.z - mold.z;
  const outline = bandOutline([[back, mold.z, 0], [back, crown.z, 0]], edge, mold.z, height);
  const lines = mold.lines?.filter(({ z }) => z < crown.z - EPSILON);
  pieces[index] = { ...mold, height, front: Math.max(...edge.map(([x]) => x)), outline,
    ...(lines ? { lines } : {}) };
  if (lines && !lines.length) delete pieces[index].lines;
}

/**
 * A run seen end-on: returning top bands fill back to the wall, with the visible end panel. `returnEnd` (a
 * return drawn in end view, FX5.1) also returns the furniture base and adds the wall end panel at that end.
 */
export function runEndView(room, wall, run, end, settings, { returnEnd = false } = {}) {
  if (buildingPaths()) throw new Error('runEndView ran while buildingPaths() is true');
  const scene = runScene(room, wall, run, settings);
  const back = runBackOffset(run);
  const { paths, ends } = bandPaths(room, settings);
  const bands = {
    countertop: 'countertop', top_mold: 'topMold', crown: 'crown',
    ...(returnEnd ? { furniture_base: 'furnitureBase' } : {}),
  };
  const pieces = runSide(room, wall, run, settings).map((piece) => {
    const band = bands[piece.piece];
    if (!band) return piece;
    // An insert with a different section reads the main top at the same surface height.
    const topPath = band === 'countertop' && paths.find((path) => path.kind === band
      && Math.abs(path.z + path.height - piece.z - piece.height) <= EPSILON
      && path.segments.some((member) => member.wallId === wall.id
        && member.face === (wall.side ?? 'front') && member.runId === run.id && !member.corner && !member.return));
    const rule = ends.get(`${run.id}|${band}|${topPath ? topPath.z : piece.z}|${end}`);
    const path = rule && paths.find(({ id }) => id === rule.pathId);
    const cap = path && memberCaps(room, path, wall, run, settings)[end === 'left' ? 0 : 1];
    if (cap?.type !== 'return') return piece;
    return { ...piece, back,
      ...(piece.outline ? { outline: bandOutline(
        [[back, piece.z, 0], [back, piece.z + piece.height, 0]],
        frontContour(piece.outline), piece.z, piece.height,
      ) } : {}),
      ...returnLines(room, wall, run, settings, piece, band, back),
    };
  });
  lapUnderCrown(pieces, back);
  if (run.ends?.[end]?.type === 'end_panel') {
    const panel = scene.drawnPieces.find(({ id, kind }) => id === `${run.id}:${end}` && kind === 'end_panel');
    if (panel) pieces.push({ piece: 'end_panel', z: panel.z, height: panel.height,
      back, front: frontDepth(run, settings) });
  }
  if (returnEnd) pieces.push(...wallEndPanelPiece(room, wall, run, end, settings, pieces));
  return pieces;
}
