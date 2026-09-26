import { captureSides } from './capture.js';
import { cellCaptureSides, cellPieces, coveredSides, hingeStops, stackedSides } from './cells.js';
import { findLeaf } from './cellTree.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { applyHinges, cabinetFaces, defaultFace } from './faces.js';
import { runItems } from './grid.js';
import { endCornerAnglesForRun, endMinWidthsForRun, pinTargetsForRun } from './room.js';
import { splitRun } from './splitRun.js';
import { cabinetReveals, resolveStyle } from './styles.js';
import { wallViewForRun } from './wallSides.js';

/** splitRun with the same options RunGroup uses. */
export function layoutRun(room, wall, run, settings) {
  return splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
  });
}

/**
 * Faces, effective style and reveals for every cabinet piece in a run, keyed by piece id.
 * `run` may be a preview copy; the wall's other runs supply cross-run neighbors.
 */
export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(room, wall, run, settings)) {
  wall = wallViewForRun(wall, run);
  const otherPieces = wall.runs
    .filter((other) => other.id !== run.id)
    .flatMap((other) => layoutRun(room, wall, other, settings).pieces);
  const tolerance = settings.adjacentRunGap ?? DEFAULT_SETTINGS.adjacentRunGap;
  const result = new Map();
  const cells = cellPieces(run, layout);
  for (const piece of cells.pieces) {
    if (piece.kind !== 'cabinet' || piece.role !== 'item') continue;
    const item = piece.columnId
      ? findLeaf(run.grid, piece.id)
      : runItems(run).find((candidate) => candidate.id === piece.id);
    const column = piece.columnId
      ? layout.pieces.find((candidate) => candidate.id === piece.columnId)
      : piece;
    const columnCaptured = captureSides(layout.pieces, column.id, otherPieces, tolerance);
    const byPanels = cellCaptureSides(cells.pieces, piece.id);
    const captured = piece.columnId
      ? {
        left: byPanels.left
          || (columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6),
        right: byPanels.right || (columnCaptured.right
          && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6),
      }
      : columnCaptured;
    const face = item?.face ?? defaultFace(piece.width, settings);
    const covered = coveredSides(cells.pieces, piece.id);
    const pairCovers = face.type === 'pair_door' && (covered.left > 0 || covered.right > 0);
    const style = resolveStyle(settings, room, run, item);
    const runEdges = {
      top: Math.abs(piece.z + piece.height - run.z - run.height) <= 1e-6,
      bottom: Math.abs(piece.z - run.z) <= 1e-6,
    };
    const reveals = cabinetReveals({
      style,
      cabinetTypeId: run.cabinetTypeId,
      run,
      face,
      captured,
      stacked: stackedSides(cells.pieces, piece.id),
      covered: pairCovers ? { ...covered, left: 0, right: 0 } : covered,
      runEdges,
      manual: item?.reveals ?? null,
      settings,
    });
    const resolved = cabinetFaces(item, piece, run.cabinetTypeId, settings, reveals.values);
    const hinged = applyHinges(resolved.faces, hingeStops(cells.pieces, piece.id), covered);
    result.set(piece.id, {
      faces: hinged.faces,
      warnings: [
        ...resolved.warnings,
        ...hinged.warnings,
        ...(pairCovers ? [{ code: 'pair-door-covers-panel', path: 'r' }] : []),
      ],
      style,
      reveals,
    });
  }
  return result;
}
