import { panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { doorProfileOffsets, inset, partProfileLines, stileFlat } from './doorProfileLines.js';
import { frontStackWarnings, midDefaults, partSizes } from './doorSizes.js';
import { cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle } from './doorStyleResolve.js';
import { frontDepth, runBackOffset } from './corners.js';
import { defaultFace } from './faces.js';
import { getFaceNode } from './faceTree.js';
import { resolveMidLayout } from './midLayout.js';
import { runItems } from './grid.js';
import { isJoinedEnd } from './panelThickness.js';
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

/**
 * Frame openings (5-piece) or door-edge regions (slabs with moldings) of one part,
 * in wall coordinates (SPEC-46.2, DOORS-PROFILES-PLAN §3.6).
 */
export function partDetail(style, design, rect, sizes, edgeOut = 0, moldings = [], offsets, { mirror } = {}) {
  const core = inset(rect, edgeOut);
  const sizeRect = design.construction === 'slab' ? rect : core;
  const r = partSizes(style, design, { width: sizeRect.width, height: sizeRect.height, coreHeight: core.height, sizes },
    midDefaults(style, design, offsets), { mirror });
  const layoutWarnings = r.layoutWarnings ?? [];
  if (r.construction === 'slab' && !r.molding) return { ...r, core, openings: [], layoutWarnings };
  const origin = r.construction === 'slab' ? rect : core;
  const openings = r.panels.map(({ x, z, width, height }) => ({
    x: origin.x + x, z: origin.z + z, width, height,
  }));

  if (r.construction === 'slab' && r.molding) {
    // MD5 (SPEC-MR4): no real mid on a slab; the gap between molding rectangles equals the edge flat F.
    const extent = Math.max(0, ...moldings.map(({ offset, width }) => offset + width));
    const typedFlat = moldings.length ? Math.max(0, Math.min(...moldings.map(({ offset }) => offset))) : 0;
    const local = { x: 0, z: 0, width: rect.width, height: rect.height };
    const resolveSlab = (flat) => {
      const area = inset(local, flat);
      const layout = resolveMidLayout(slabLayout(sizes?.layout), area,
        { rail: flat, stile: flat, over: 0, source: { rail: 'flat', stile: 'flat' } }, { mirror });
      const regions = layout.panels.map((panel) => inset(panel, -flat))
        .map(({ x, z, width, height }) => ({ x: rect.x + x, z: rect.z + z, width, height }));
      return { area, layout, regions };
    };
    const smallestOf = ({ regions }) => Math.min(...regions.map(({ width, height }) => Math.min(width, height)));
    let slab = resolveSlab(typedFlat);
    const { minPanel, step } = style.shortFace;
    const allowed = Math.floor((smallestOf(slab) - minPanel) / 2 / step + 1e-9) * step;
    let shift = moldings.length && extent > allowed + 1e-6
      ? Math.max(0, Math.min(extent - allowed, typedFlat)) : 0;
    if (shift > 0) {
      slab = resolveSlab(typedFlat - shift);
      // A smaller flat also narrows every gap, so with mids the panels can still come up short: step out further.
      while (slab.layout.mids.length && shift < typedFlat - 1e-9
        && smallestOf(slab) - 2 * (extent - shift) < minPanel - 1e-6) {
        shift = Math.min(typedFlat, shift + step);
        slab = resolveSlab(typedFlat - shift);
      }
    }
    const { area, layout } = slab;
    return {
      construction: r.construction, slab: r.slab, molding: r.molding, designId: r.designId, core,
      openings: slab.regions, layoutWarnings: layout.warnings,
      moldings: moldings.map(({ index, offset }) => ({
        index, offset: offset - shift, typed: offset, shifted: shift > 0,
      })),
      sizes: { ...r, shift, minPanel, area,
        midRails: layout.mids.filter(({ kind }) => kind === 'rail'),
        midStiles: layout.mids.filter(({ kind }) => kind === 'stile'),
        panels: layout.panels,
        layoutWarnings: layout.warnings,
        opening: {
          width: rect.width - 2 * (extent - shift), height: rect.height - 2 * (extent - shift),
        } },
    };
  }

  return { construction: r.construction, core, openings, sizes: r, layoutWarnings };
}

/** A slab layout without typed mid widths (MD5: every gap is the edge flat). */
function slabLayout(node) {
  return node?.split ? { ...node, mids: undefined, children: node.children.map(slabLayout) } : node;
}

/** A part's openings (partDetail) and its profile lines and miters, as face-on parts and end views draw them. */
function detailWithLines(offsets, style, design, rect, sizes, panel, options) {
  const detail = partDetail(style, design, rect, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied, offsets, options);
  return { detail, fit: partProfileLines(offsets, detail, rect, { panel }) };
}

/**
 * A run end panel's door detail at true size in its own frame (SPEC-DM8): x runs 0 … width across the panel as seen
 * standing outside facing it (a left end panel's back edge is at 0, a right end panel's front edge), z as in the
 * elevation. Null when that end isn't an end panel or its style is sheet.
 */
export function runEndPanelDetail(room, wall, run, end, settings, scene = runScene(room, wall, run, settings)) {
  const stored = run.ends?.[end];
  if (stored?.type !== 'end_panel') return null;
  const panel = scene.drawnPieces.find(({ id, kind }) => id === `${run.id}:${end}` && kind === 'end_panel');
  if (!panel) return null;
  const { style, design } = resolveDoorStyle(room, settings, 'panel',
    panelLevels(room, wallViewForRun(wall, run), run, stored, { sheet: isJoinedEnd(run, end) }));
  if (style.id === 'sheet') return null;
  const width = frontDepth(run, settings) - runBackOffset(run);
  if (!(width > 0) || !(panel.height > 0)) return null;
  const rect = { x: 0, z: panel.z, width, height: panel.height };
  const offsets = doorProfileOffsets(style, design, settings?.sectionProfiles ?? []);
  const { detail, fit } = detailWithLines(offsets, style, design, rect, stored.sizes, true);
  return {
    width, z: panel.z, height: panel.height, openings: detail.openings,
    lines: fit.lines, miters: fit.miters, openingsShown: fit.openingsShown,
  };
}

/**
 * Place a panel-frame detail on the wall (SPEC-DM8): `xAt(u)` maps the panel's x to wall x (either direction),
 * then rectangles and miters are cut to the drawn range [xMin, xMax]. Null when nothing is left.
 */
export function placePanelDetail(detail, xAt, [xMin, xMax]) {
  const EPS = 1e-6;
  const rect = ({ x, z, width, height }) => {
    const ends = [xAt(x), xAt(x + width)];
    const left = Math.max(Math.min(...ends), xMin);
    const right = Math.min(Math.max(...ends), xMax);
    return right - left > EPS ? { x: left, z, width: right - left, height } : null;
  };
  const openings = detail.openingsShown === false ? [] : detail.openings.map(rect).filter(Boolean);
  const profileLines = detail.lines.map(rect).filter(Boolean);
  const miters = (detail.miters ?? []).flatMap(({ x1, z1, x2, z2 }) => {
    let a = { x: xAt(x1), z: z1 };
    let b = { x: xAt(x2), z: z2 };
    if (a.x > b.x) [a, b] = [b, a];
    if (b.x - a.x <= EPS) return a.x >= xMin - EPS && a.x <= xMax + EPS ? [{ x1: a.x, z1: a.z, x2: b.x, z2: b.z }] : [];
    const low = Math.max(a.x, xMin);
    const high = Math.min(b.x, xMax);
    if (high - low <= EPS) return [];
    const at = (x) => a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    return [{ x1: low, z1: at(low), x2: high, z2: at(high) }];
  });
  if (!openings.length && !profileLines.length && !miters.length) return null;
  return { openings, profileLines, miters };
}

/** Every face-on part's door detail, profile lines and warnings, in drawing order (SPEC-46.2, SPEC-50). */
export function runDoorDetails(room, wall, run, settings, scene = runScene(room, wall, run, settings)) {
  const levelsWall = wallViewForRun(wall, run);
  const parts = [];
  const warnings = [];
  const faceParts = new Map();
  const profiles = settings?.sectionProfiles ?? [];
  const offsetsByStyle = new Map();

  function addPart(key, kind, pieceId, path, rect, resolved, sizes, partType = 'panel', faceType = null, panelMaterial = null) {
    const { style, design } = resolved;
    if (!offsetsByStyle.has(style)) {
      offsetsByStyle.set(style, doorProfileOffsets(style, design, profiles));
    }
    const offsets = offsetsByStyle.get(style);
    const { detail, fit } = detailWithLines(offsets, style, design, rect, sizes, !panelMaterial,
      { mirror: kind === 'face' && rect.half === 'right' });
    const { x, z, width, height } = rect;
    parts.push({
      key, kind, pieceId, path, styleId: style.id, label: style.label,
      ...(kind === 'face' ? { flat: stileFlat(offsets, detail), core: detail.core } : {}),
      style, design, partType, faceType, sizes: detail.sizes ?? detail,
      ...(panelMaterial ? { panelMaterial } : {}),
      construction: detail.construction, x, z, width, height, openings: detail.openings,
      lines: fit.lines, miters: fit.miters, openingsShown: fit.openingsShown,
    });
    warnings.push(...resolved.warnings.map((warning) => ({ ...warning, pieceId, key })));
    warnings.push(...offsets.warnings.map((warning) => ({ ...warning, pieceId, key })));
    warnings.push(...fit.warnings.map((warning) => ({ ...warning, pieceId, key })));
    warnings.push(...detail.layoutWarnings.map((warning) => ({ ...warning, pieceId, key })));
    if (panelMaterial && detail.construction !== 'five_piece') {
      warnings.push({ code: 'panel-material-needs-frame', pieceId, key });
    }
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
      addPart(key, 'face', pieceId, face.path, face, resolved, node?.sizes, partType, face.type, face.panelMaterial);
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
