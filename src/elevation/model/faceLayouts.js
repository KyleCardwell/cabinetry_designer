import { captureSides } from './capture.js';
import { cellPieces, stackedSides } from './cells.js';
import { findLeaf } from './cellTree.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { cabinetFaces, defaultFace } from './faces.js';
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
    const captured = piece.columnId
      ? {
        left: columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6,
        right: columnCaptured.right
          && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6,
      }
      : columnCaptured;
    const style = resolveStyle(settings, room, run, item);
    const reveals = cabinetReveals({
      style,
      cabinetTypeId: run.cabinetTypeId,
      run,
      face: item?.face ?? defaultFace(piece.width, settings),
      captured,
      stacked: stackedSides(cells.pieces, piece.id),
      manual: item?.reveals ?? null,
      settings,
    });
    result.set(piece.id, {
      ...cabinetFaces(item, piece, run.cabinetTypeId, settings, reveals.values),
      style,
      reveals,
    });
  }
  return result;
}
