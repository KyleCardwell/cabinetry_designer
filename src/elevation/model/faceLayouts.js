import { captureSides } from './capture.js';
import { cellCaptureSides, cellPieces, coveredSides, EPSILON, gapReach, hingeStops, openBelow, stackedSides } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerReturnPoint } from './corners.js';
import { cabinetFaceLevels, faceEdgeProfiled, facePartType, resolveDoorStyle } from './doorStyleResolve.js';
import { teamDoorStyle } from './doorStyles.js';
import { applyHinges, cabinetFaces, defaultFace, faceArea, flipHinges } from './faces.js';
import { faceOutline, getFaceNode } from './faceTree.js';
import { faceOpenings, frameRegions } from './frames.js';
import { runItems } from './grid.js';
import { splitOptionsForRun } from './placement.js';
import { splitRun } from './splitRun.js';
import { columnOverlaps, resolveTopSegments } from './topSegments.js';
import { teeFillers } from './tees.js';
import { baseBankHeight, cabinetReveals, growStandardFronts, isInsetStyle, resolveStyle, standardDrawerHeight, typeStandardReveals } from './styles.js';
import { wallViewForRun } from './wallSides.js';

/** splitRun with the same options RunGroup uses. */
export function layoutRun(room, wall, run, settings) {
  return splitRun(run, settings, splitOptionsForRun(room, wall, run, settings));
}

/** Resolve matches in a layout copy, leaving the stored tree and its auto sizes intact. */
function resolveFaceMatches(face, match, height) {
  const children = face.children?.map((child) => resolveFaceMatches(child, match, height));
  return face.match === match || children?.some((child, index) => child !== face.children[index])
    ? { ...face, size: face.match === match ? height : face.size, ...(children ? { children } : {}) }
    : face;
}

/** Shared true-size face layout for an owner cabinet and its return leg. */
function layoutCabinetFace({
  room, wall, run, settings, item, box, style, reveals, storedFace, runEdges,
  stops, covered, hingeContext, layoutFace = null, extraWarnings = [],
}) {
  // An inherited B tree already carries A's resolved matches and front growth.
  let face = layoutFace;
  if (!face) {
    // A smaller top reveal than stone grows the standard drawer fronts, not the others (IN7.2).
    const topGrowth = !isInsetStyle(style) && run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      && (reveals.sources.top === 'manual' || (runEdges.top && ['style', 'rule:wood-top'].includes(reveals.sources.top)))
      ? typeStandardReveals(style, CABINET_TYPE_IDS.BASE, settings).top - reveals.values.top : 0;
    const matchedFace = resolveFaceMatches(storedFace, 'base', baseBankHeight(room, wall, style, settings));
    face = growStandardFronts(resolveFaceMatches(matchedFace, 'standard', standardDrawerHeight(style, settings)), topGrowth);
  }
  let resolved = cabinetFaces({ ...item, face }, box, run.cabinetTypeId, settings, reveals.values);
  if (isInsetStyle(style)) {
    reveals.values.squarePaths = new Set(resolved.faces.filter((rect) => !faceEdgeProfiled(
      room, wall, run, item, getFaceNode(face, rect.path), rect, settings,
    )).map(({ path }) => path));
    resolved = cabinetFaces({ ...item, face }, box, run.cabinetTypeId, settings, reveals.values);
  }
  const hinged = applyHinges(resolved.faces, stops, covered, hingeContext);
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
  return {
    faces,
    warnings: [
      ...resolved.warnings,
      ...hinged.warnings,
      ...extraWarnings,
    ],
    reveals,
    box,
    // The tree as laid out: matched groups and grown standard fronts carry their real sizes (IN7.2/IN7.3).
    layoutFace: face,
    openings: faceOpenings(face, faceArea(box, reveals.values), reveals.values),
  };
}

/**
 * Faces, effective style and reveals for every cabinet piece in a run, keyed by piece id.
 * `run` may be a preview copy; the wall's other runs supply cross-run neighbors.
 * A frame context reuses the exact cells and side rules while deriving notch opening spans.
 */
export function layoutFaces(room, wall, run, settings, layout, frameContext) {
  wall = wallViewForRun(wall, run);
  const otherPieces = wall.runs
    .filter((other) => other.id !== run.id)
    .flatMap((other) => cellPieces(other, layoutRun(room, wall, other, settings)).pieces);
  const tolerance = settings.adjacentRunGap ?? DEFAULT_SETTINGS.adjacentRunGap;
  const result = new Map();
  const topKinds = new Map(resolveTopSegments(run).segments.flatMap(({ kind, columnIds }) => (
    columnIds.map((id) => [id, kind])
  )));
  const overlaps = columnOverlaps(run);
  const cells = frameContext?.cells ?? cellPieces(run, layout);
  const frames = frameContext?.frames ?? frameRegions(room, run, cells, settings);
  const { covers: teeCovers } = teeFillers(room, run, cells, settings);
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const corners = ['left', 'right'].map((side) => run.ends?.[side]?.type === 'corner'
    ? cornerEnd(room, wall, run, side, settings, layout) : null);
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
      : { left: columnCaptured.left || byPanels.left, right: columnCaptured.right || byPanels.right };
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
    const corner = corners.find((end) => end?.active && end.shape && end.columnId === piece.id
      && !piece.columnId);
    const style = resolveStyle(settings, room, run, item);
    const cornerLayout = corner?.faceLayout ?? null;
    let squash = null;
    if (corner) {
      const faceX = corner.kind === 45 ? cornerLayout.feet.a[0] : corner.legA;
      const pivot = piece.x + (corner.side === 'left' ? faceX : corner.legA - faceX);
      box.width = corner.kind === 45 ? cornerLayout.span : corner.shape.shown.a;
      box.x = pivot - (corner.side === 'left' ? box.width : 0);
      if (corner.kind === 45) squash = {
        pivot, k: corner.shape.shown.a / corner.shape.trueWidth,
      };
    }
    const storedFace = item?.face ?? defaultFace(box.width, settings);
    const covered = coveredSides(cells.pieces, piece.id);
    const pairCovers = storedFace.type === 'pair_door' && (covered.left > 0 || covered.right > 0);
    const runEdges = {
      top: Math.abs(piece.z + piece.height - column.z - column.height) <= 1e-6,
      bottom: Math.abs(piece.z - column.z) <= 1e-6,
    };
    const reveals = cabinetReveals({
      style,
      profiled: true,
      cabinetTypeId: run.cabinetTypeId,
      run,
      topKind: topKinds.get(column.id),
      topOverlap: overlaps.get(column.id)?.value,
      face: storedFace,
      captured,
      seams: frames.seamSides.get(piece.id),
      stacked: stackedSides(cells.pieces, piece.id, gapReach(cells.gaps ?? [])),
      openBelow: openBelow(cells.pieces, piece.id, gapReach(cells.gaps ?? [])),
      covered: pairCovers ? { ...covered, left: 0, right: 0 } : covered,
      tCovers,
      runEdges,
      manual: item?.reveals ?? null,
      settings,
    });
    if (corner) {
      const sides = corner.kind === 45 ? ['left', 'right'] : [corner.side];
      const reveal = corner.kind === 45 ? cornerLayout.reveal : cornerLayout.a.cornerReveal;
      for (const side of sides) {
        if (reveal !== null && reveals.sources[side] !== 'manual') {
          reveals.values[side] = reveal;
          reveals.sources[side] = 'rule:corner';
        }
      }
    }
    const wallSides = Object.fromEntries(['left', 'right'].map((side) => {
      const anchor = run.anchors?.[side];
      const atEdge = side === 'left'
        ? Math.abs(piece.x - run.x) <= EPSILON
        : Math.abs(piece.x + piece.width - run.x - run.width) <= EPSILON;
      return [side, atEdge && (anchor === true || anchor?.to === 'wall')];
    }));
    if (corner) wallSides[corner.side] = false;
    const entry = layoutCabinetFace({
      room, wall, run, settings, item, box, style, reveals, storedFace, runEdges,
      stops: hingeStops(cells.pieces, piece.id), covered,
      hingeContext: {
        wallSides,
        // Prefer the edge away from the corner over the nearer run end.
        runCenter: corner ? box.x + (corner.side === 'right' ? box.width : 0) : run.x + run.width / 2,
      },
      extraWarnings: pairCovers ? [{ code: 'pair-door-covers-panel', path: 'r' }] : [],
    });
    entry.style = style;
    if (corner) {
      entry.squash = squash;
      entry.corner = { side: corner.side, kind: corner.kind };
      const point = cornerReturnPoint(room, wall, run, corner.side);
      if (point) {
        let legB = null;
        let returnSquash = null;
        if (corner.kind === 90) {
          const boxB = {
            ...box,
            x: Math.min(point.at + point.dir * corner.depthA, point.at + point.dir * corner.legB),
            width: corner.legB - corner.depthA,
          };
          const farA = corner.side === 'left' ? 'right' : 'left';
          const cornerB = point.dir === 1 ? 'left' : 'right';
          const farB = point.dir === 1 ? 'right' : 'left';
          const revealsB = { values: { ...reveals.values }, sources: { ...reveals.sources } };
          delete revealsB.values.squarePaths;
          revealsB.values[farB] = reveals.values[farA];
          revealsB.sources[farB] = reveals.sources[farA];
          revealsB.values[cornerB] = cornerLayout.b.cornerReveal ?? reveals.values[farA];
          revealsB.sources[cornerB] = cornerLayout.b.cornerReveal === null
            ? reveals.sources[farA] : 'rule:corner';
          const faceB = run.ends[corner.side].corner?.legBFace;
          const tree = faceB ? { type: faceB } : flipHinges(entry.layoutFace);
          legB = layoutCabinetFace({
            room, wall, run, settings, item, box: boxB, style, reveals: revealsB,
            storedFace: tree, layoutFace: tree, runEdges,
            stops: { left: false, right: false }, covered: { left: 0, right: 0 },
            hingeContext: { wallSides: { left: false, right: false },
              runCenter: boxB.x + (point.dir === -1 ? boxB.width : 0) },
          });
        } else {
          returnSquash = {
            from: squash.pivot,
            pivot: point.at + point.dir * cornerLayout.feet.a[1],
            k: corner.shape.shown.b / corner.shape.trueWidth,
          };
        }
        entry.cornerReturn = { ...point, legB, squash: returnSquash };
      }
    }
    result.set(piece.id, entry);
  }
  return result;
}

function storedFaceFor(run, piece) {
  return (piece.columnId ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id))?.face;
}

/** Height of the contiguous drawer/false-front bank touching the top of a root stack. */
function topDrawerBankHeight(face, faces) {
  if (face?.direction !== 'vertical') return null;
  const isFront = (node) => node.type ? ['drawer_front', 'false_front'].includes(node.type)
    : node.children.every(isFront);
  const paths = [];
  for (const [index, child] of face.children.entries()) {
    if (!isFront(child)) break;
    paths.push(`r.${index}`);
  }
  const bank = faces.filter(({ path }) => paths.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)));
  return bank.length ? Math.max(...bank.map(({ z, height }) => z + height))
    - Math.min(...bank.map(({ z }) => z)) : null;
}

/** Shared face warnings compare resolved base fronts on this wall face with each matched group. */
export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(room, wall, run, settings)) {
  wall = wallViewForRun(wall, run);
  const result = layoutFaces(room, wall, run, settings, layout);
  let baseHeights;
  for (const entry of result.values()) {
    const storedFace = storedFaceFor(run, entry.box);
    const matches = storedFace ? faceOutline(storedFace).filter(({ node }) => node.match === 'base') : [];
    if (!matches.length) continue;
    baseHeights ??= [...new Set(wall.runs.filter((other) => other.cabinetTypeId === CABINET_TYPE_IDS.BASE)
      .flatMap((base) => [...layoutFaces(room, wall, base, settings, layoutRun(room, wall, base, settings)).values()]
        .map((entry) => topDrawerBankHeight(storedFaceFor(base, entry.box), entry.faces)))
      .filter((height) => height !== null))];
    const matchedHeight = baseBankHeight(room, wall, entry.style, settings);
    for (const { path } of matches) {
      for (const baseHeight of baseHeights) {
        if (Math.abs(baseHeight - matchedHeight) > 1 / 32 + EPSILON) {
          entry.warnings.push({ code: 'drawer-stack-base-mismatch', path, baseHeight, matchedHeight });
        }
      }
    }
  }
  return result;
}
