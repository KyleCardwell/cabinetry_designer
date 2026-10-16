import { panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { doorProfileOffsets, inset, partProfileLines, stileFlat } from './doorProfileLines.js';
import { frontStackWarnings, partSizes } from './doorSizes.js';
import { cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle } from './doorStyleResolve.js';
import { defaultFace } from './faces.js';
import { getFaceNode } from './faceTree.js';
import { runItems } from './grid.js';
import { runScene } from './runScene.js';
import { wallViewForRun } from './wallSides.js';

/** Door details and pulls by default; style tags and swing marks off by default. */
export function doorDrawing(room) {
  return {
    details: room?.doorDetails !== false,
    tags: room?.doorStyleTags === true,
    swings: room?.swingMarks === true,
    pulls: room?.showPulls !== false,
  };
}

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

function splitIntervals(start, length, mids) {
  const cuts = [...new Set(mids.map(({ at }) => at)
    .filter((at) => at > 1e-6 && at < length - 1e-6))].sort((a, b) => a - b);
  const edges = [0, ...cuts, length];
  return edges.slice(1).map((end, index) => [start + edges[index], start + end]);
}

/**
 * Frame openings (5-piece) or door-edge regions (slabs with moldings) of one part,
 * in wall coordinates (SPEC-46.2, DOORS-PROFILES-PLAN §3.6).
 */
export function partDetail(style, design, rect, sizes, edgeOut = 0, moldings = []) {
  const core = inset(rect, edgeOut);
  const sizeRect = design.construction === 'slab' ? rect : core;
  const r = partSizes(style, design, { width: sizeRect.width, height: sizeRect.height, coreHeight: core.height, sizes });
  if (r.construction === 'slab' && !r.molding) return { ...r, core, openings: [] };

  if (r.construction === 'slab' && r.molding) {
    const rows = splitIntervals(rect.z, rect.height, r.midRails);
    const columns = splitIntervals(rect.x, rect.width, r.midStiles);
    const openings = rows.flatMap(([bottom, top]) => columns.map(([left, right]) => ({
      x: left, z: bottom, width: right - left, height: top - bottom,
    })));
    const extent = Math.max(0, ...moldings.map(({ offset, width }) => offset + width));
    const smallest = Math.min(...openings.map(({ width, height }) => Math.min(width, height)));
    const { minPanel, step } = style.shortFace;
    const allowed = Math.floor((smallest - minPanel) / 2 / step + 1e-9) * step;
    const shift = moldings.length && extent > allowed + 1e-6
      ? Math.max(0, Math.min(extent - allowed, ...moldings.map(({ offset }) => offset))) : 0;
    return {
      construction: r.construction, slab: r.slab, molding: r.molding, designId: r.designId, core, openings,
      moldings: moldings.map(({ index, offset }) => ({
        index, offset: offset - shift, typed: offset, shifted: shift > 0,
      })),
      sizes: { ...r, shift, minPanel, opening: {
        width: rect.width - 2 * (extent - shift), height: rect.height - 2 * (extent - shift),
      } },
    };
  }

  const opening = {
    x: core.x + r.stiles.left,
    z: core.z + r.rails.bottom,
    width: r.opening.width,
    height: r.opening.height,
  };
  const rows = remainingIntervals(opening.z, opening.z + opening.height, core.z, r.midRails);
  const columns = remainingIntervals(opening.x, opening.x + opening.width, core.x, r.midStiles);
  const openings = rows.flatMap(([bottom, top]) => columns.map(([left, right]) => ({
    x: left, z: bottom, width: right - left, height: top - bottom,
  })));
  return { construction: r.construction, core, openings, sizes: r };
}

/** Every face-on part's door detail, profile lines and warnings, in drawing order (SPEC-46.2, SPEC-50). */
export function runDoorDetails(room, wall, run, settings, scene = runScene(room, wall, run, settings)) {
  const levelsWall = wallViewForRun(wall, run);
  const parts = [];
  const warnings = [];
  const faceParts = new Map();
  const profiles = settings?.sectionProfiles ?? [];
  const offsetsByStyle = new Map();

  function addPart(key, kind, pieceId, path, rect, resolved, sizes, partType = 'panel', faceType = null) {
    const { style, design } = resolved;
    if (!offsetsByStyle.has(style)) {
      offsetsByStyle.set(style, doorProfileOffsets(style, design, profiles));
    }
    const offsets = offsetsByStyle.get(style);
    const detail = partDetail(style, design, rect, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
    const fit = partProfileLines(offsets, detail, rect);
    const { x, z, width, height } = rect;
    parts.push({
      key, kind, pieceId, path, styleId: style.id, label: style.label,
      ...(kind === 'face' ? { flat: stileFlat(offsets, detail), core: detail.core } : {}),
      style, design, partType, faceType, sizes: detail.sizes ?? detail,
      construction: detail.construction, x, z, width, height, openings: detail.openings,
      lines: fit.lines, miters: fit.miters, openingsShown: fit.openingsShown,
    });
    warnings.push(...resolved.warnings.map((warning) => ({ ...warning, pieceId, key })));
    warnings.push(...offsets.warnings.map((warning) => ({ ...warning, pieceId, key })));
    warnings.push(...fit.warnings.map((warning) => ({ ...warning, pieceId, key })));
    if (kind === 'face' && (detail.construction === 'five_piece' || (detail.construction === 'slab' && detail.molding))) {
      faceParts.get(pieceId).push({ path, ...detail.core, sizes: detail.sizes });
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
      addPart(key, 'face', pieceId, face.path, face, resolved, node?.sizes, partType, face.type);
    }
  }

  for (const piece of scene.drawnPieces) {
    if (piece.kind !== 'panel' || panelOrientation(piece) !== 'back') continue;
    const leaf = findLeaf(run.grid, piece.id);
    const resolved = resolveDoorStyle(
      room, settings, 'panel', panelLevels(room, levelsWall, run, leaf),
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
