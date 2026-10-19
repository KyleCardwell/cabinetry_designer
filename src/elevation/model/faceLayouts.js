import { captureSides } from './capture.js';
import { cellCaptureSides, cellPieces, coveredSides, EPSILON, gapReach, hingeStops, stackedSides } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { cabinetFaceLevels, facePartType, resolveDoorStyle } from './doorStyleResolve.js';
import { teamDoorStyle } from './doorStyles.js';
import { applyHinges, cabinetFaces, defaultFace, faceArea } from './faces.js';
import { getFaceNode } from './faceTree.js';
import { faceOpenings, frameRegions } from './frames.js';
import { runItems } from './grid.js';
import { endCornerAnglesForRun, endMinWidthsForRun, pinTargetsForRun } from './room.js';
import { splitRun } from './splitRun.js';
import { teeFillers } from './tees.js';
import { baseBankHeight, cabinetReveals, growStandardFronts, isInsetStyle, resolveStyle, typeStandardReveals } from './styles.js';
import { wallViewForRun } from './wallSides.js';

/** splitRun with the same options RunGroup uses. */
export function layoutRun(room, wall, run, settings) {
  return splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
  });
}

/** Resolve matches in a layout copy, leaving the stored tree and its auto sizes intact. */
function resolveFaceMatches(face, height) {
  if (!face.children) return face;
  const children = face.children.map((child) => resolveFaceMatches(child, height));
  return face.match === 'base' || children.some((child, index) => child !== face.children[index])
    ? { ...face, size: face.match === 'base' ? height : face.size, children }
    : face;
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
  const frames = frameRegions(room, run, cells, settings);
  const { covers: teeCovers } = teeFillers(room, run, cells, settings);
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
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
    const capturedByBox = piece.columnId
      ? {
        left: byPanels.left
          || (columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6),
        right: byPanels.right || (columnCaptured.right
          && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6),
      }
      : columnCaptured;
    // Boxes either side of a T-filler are captured between fillers too (REV-005/006).
    const tCovers = teeCovers.get(piece.id) ?? null;
    const captured = {
      left: capturedByBox.left || tCovers?.left > 0,
      right: capturedByBox.right || tCovers?.right > 0,
    };
    const free = frames.freeSides.get(piece.id) ?? { left: false, right: false };
    const box = {
      ...piece,
      x: piece.x + (free.left ? overhang : 0),
      width: piece.width - (free.left ? overhang : 0) - (free.right ? overhang : 0),
    };
    const storedFace = item?.face ?? defaultFace(box.width, settings);
    const covered = coveredSides(cells.pieces, piece.id);
    const pairCovers = storedFace.type === 'pair_door' && (covered.left > 0 || covered.right > 0);
    const style = resolveStyle(settings, room, run, item);
    const runEdges = {
      top: Math.abs(piece.z + piece.height - run.z - run.height) <= 1e-6,
      bottom: Math.abs(piece.z - run.z) <= 1e-6,
    };
    const reveals = cabinetReveals({
      style,
      cabinetTypeId: run.cabinetTypeId,
      run,
      face: storedFace,
      captured,
      seams: frames.seamSides.get(piece.id),
      stacked: stackedSides(cells.pieces, piece.id, gapReach(cells.gaps)),
      covered: pairCovers ? { ...covered, left: 0, right: 0 } : covered,
      tCovers,
      runEdges,
      manual: item?.reveals ?? null,
      settings,
    });
    // A smaller top reveal than stone grows the standard drawer fronts, not the others (IN7.2).
    const topGrowth = !isInsetStyle(style) && run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      && (reveals.sources.top === 'manual' || (runEdges.top && ['style', 'rule:wood-top'].includes(reveals.sources.top)))
      ? typeStandardReveals(style, CABINET_TYPE_IDS.BASE, settings).top - reveals.values.top : 0;
    const matchedFace = resolveFaceMatches(storedFace, baseBankHeight(room, wall, style, settings));
    const face = growStandardFronts(matchedFace, topGrowth, style, settings);
    const resolved = cabinetFaces({ ...item, face }, box, run.cabinetTypeId, settings, reveals.values);
    const wallSides = Object.fromEntries(['left', 'right'].map((side) => {
      const anchor = run.anchors?.[side];
      const atEdge = side === 'left'
        ? Math.abs(piece.x - run.x) <= EPSILON
        : Math.abs(piece.x + piece.width - run.x - run.width) <= EPSILON;
      return [side, atEdge && (anchor === true || anchor?.to === 'wall')];
    }));
    const hinged = applyHinges(resolved.faces, hingeStops(cells.pieces, piece.id), covered, {
      wallSides,
      runCenter: run.x + run.width / 2,
    });
    const faces = hinged.faces.map((f) => {
      const partType = facePartType(f.type);
      if (partType === null) return f;
      const { style: doorStyle } = resolveDoorStyle(
        room, settings, partType,
        cabinetFaceLevels(room, wall, run, item, getFaceNode(face, f.path)),
      );
      const { thickness } = doorStyle;
      return Math.abs(thickness - teamDoorStyle(settings).thickness) > 1e-9
        ? { ...f, thickness }
        : f;
    });
    result.set(piece.id, {
      faces,
      warnings: [
        ...resolved.warnings,
        ...hinged.warnings,
        ...(pairCovers ? [{ code: 'pair-door-covers-panel', path: 'r' }] : []),
      ],
      style,
      reveals,
      box,
      openings: faceOpenings(face, faceArea(box, reveals.values), reveals.values),
    });
  }
  return result;
}
