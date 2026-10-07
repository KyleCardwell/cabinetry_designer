import { panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { frontStackWarnings, partSizes } from './doorSizes.js';
import { cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle } from './doorStyleResolve.js';
import { defaultFace } from './faces.js';
import { getFaceNode } from './faceTree.js';
import { runItems } from './grid.js';
import { runScene } from './runScene.js';
import { wallViewForRun } from './wallSides.js';

function remainingIntervals(start, end, origin, mids) {
  const cuts = mids.map(({ at, width }) => [
    Math.max(start, origin + at - width / 2),
    Math.min(end, origin + at + width / 2),
  ]).filter(([low, high]) => high > low).sort(([a], [b]) => a - b);
  const intervals = [];
  let cursor = start;
  for (const [low, high] of cuts) {
    if (low - cursor > 1e-6) intervals.push([cursor, low]);
    cursor = Math.max(cursor, high);
  }
  if (end - cursor > 1e-6) intervals.push([cursor, end]);
  return intervals;
}

/**
 * Frame openings (5-piece) or molding rectangles (Slab AM) of one part,
 * in wall coordinates (SPEC-46.2, DOORS-PROFILES-PLAN §3.6).
 */
export function partDetail(style, design, rect, sizes) {
  const r = partSizes(style, design, { width: rect.width, height: rect.height, sizes });
  if (r.construction === 'slab') return { ...r, openings: [] };

  const opening = {
    x: rect.x + r.stiles.left,
    z: rect.z + r.rails.bottom,
    width: r.opening.width,
    height: r.opening.height,
  };
  const rows = remainingIntervals(opening.z, opening.z + opening.height, rect.z, r.midRails);
  const columns = remainingIntervals(opening.x, opening.x + opening.width, rect.x, r.midStiles);
  const openings = rows.flatMap(([bottom, top]) => columns.map(([left, right]) => ({
    x: left, z: bottom, width: right - left, height: top - bottom,
  })));
  return { construction: r.construction, openings, sizes: r };
}

/** Every face-on part's door detail and warnings, in drawing order (SPEC-46.2). */
export function runDoorDetails(room, wall, run, settings, scene = runScene(room, wall, run, settings)) {
  const levelsWall = wallViewForRun(wall, run);
  const parts = [];
  const warnings = [];
  const faceParts = new Map();

  function addPart(key, kind, pieceId, path, rect, resolved, sizes) {
    const { style, design } = resolved;
    const detail = partDetail(style, design, rect, sizes);
    const { x, z, width, height } = rect;
    parts.push({
      key, kind, pieceId, path, styleId: style.id, label: style.label,
      construction: detail.construction, x, z, width, height, openings: detail.openings,
    });
    warnings.push(...resolved.warnings.map((warning) => ({ ...warning, pieceId, key })));
    if (kind === 'face' && detail.construction !== 'slab') {
      faceParts.get(pieceId).push({ path, x, z, width, height, sizes: detail.sizes });
    }
  }

  for (const [pieceId, layout] of scene.faceLayouts) {
    faceParts.set(pieceId, []);
    const item = layout.box.columnId
      ? findLeaf(run.grid, pieceId)
      : runItems(run).find((candidate) => candidate.id === pieceId);
    for (const face of layout.faces) {
      const partType = facePartType(face.type);
      if (partType === null) continue;
      const node = getFaceNode(item?.face ?? defaultFace(layout.box.width, settings), face.path);
      const resolved = resolveDoorStyle(
        room, settings, partType, cabinetFaceLevels(room, levelsWall, run, item, node),
      );
      const key = `${pieceId}:${face.path}${face.half ? `:${face.half}` : ''}`;
      addPart(key, 'face', pieceId, face.path, face, resolved, node?.sizes);
    }
  }

  for (const piece of scene.drawnPieces) {
    if (piece.kind !== 'panel' || panelOrientation(piece) !== 'back') continue;
    const leaf = findLeaf(run.grid, piece.id);
    const resolved = resolveDoorStyle(
      room, settings, 'panel', panelLevels(room, levelsWall, run, leaf, { sheet: true }),
    );
    addPart(`panel:${piece.id}`, 'panelCell', piece.id, null, piece, resolved, leaf?.sizes);
  }

  for (const entry of scene.blind.entries) {
    if (!entry.panel) continue;
    const rect = { x: entry.panel.x, z: run.z, width: entry.panel.width, height: run.height };
    const part = run.ends?.[entry.side] ?? null;
    const resolved = resolveDoorStyle(
      room, settings, 'panel', panelLevels(room, levelsWall, run, part),
    );
    addPart(`blind:${entry.side}`, 'blindPanel', entry.endPieceId, null, rect, resolved, part?.sizes);
  }

  for (const [pieceId, fronts] of faceParts) {
    const seen = new Set();
    for (const { code, path, below } of frontStackWarnings(fronts)) {
      const pair = `${path}:${below}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      warnings.push({ code, pieceId, path, below });
    }
  }
  return { parts, warnings };
}
