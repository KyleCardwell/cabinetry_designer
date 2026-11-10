import { blindEntries } from './blind.js';
import { blindCellWidths, cellPieces, floatingShelfLayout, panelOrientation, shelfParts } from './cells.js';
import { cornerEnd } from './cornerEnd.js';
import { extendPieces } from './extensions.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { frameRegions } from './frames.js';
import { endPieceBottom, resolveStyle } from './styles.js';
import { openBelowDrops, teeFillers } from './tees.js';
import { formatInches } from './units.js';
import { miteredSpan, panelRunMiters } from './wallEndPanels.js';

const PANEL_LABELS = { side: 'Side', top: 'Top', back: 'Back' };

/**
 * Everything RunGroup draws for a run, derived once (SPEC-39.1): the layout, cells, faces, frames,
 * blind panels and the pieces as drawn (T-fillers, extensions and end drops applied). The canvas
 * draws from it and the click picker hit-tests it, so the two can't disagree.
 */
export function runScene(room, wall, run, settings) {
  const result = layoutRun(room, wall, run, settings);
  const cells = cellPieces(run, result);
  const faceLayouts = runFaceLayouts(room, wall, run, settings, result);
  const frames = frameRegions(room, run, cells, settings);
  const framedIds = new Set(frames.regions.flatMap((region) => region.cabinetIds));
  const hiddenIds = new Set(frames.regions.flatMap((region) => region.fillerIds));
  const ghostIds = new Set(frames.regions.flatMap((region) => region.panelIds));
  const blind = blindEntries(room, wall, run, settings, result);
  const subLabels = new Map();
  for (const piece of cells.pieces) {
    if (piece.kind === 'void') subLabels.set(piece.id, 'Open');
    if (piece.kind === 'panel') subLabels.set(piece.id, `${PANEL_LABELS[panelOrientation(piece)]} panel`);
    if (piece.kind === 'shelves') {
      const { count } = floatingShelfLayout(piece, settings);
      subLabels.set(piece.id, `${count} ${count === 1 ? 'shelf' : 'shelves'}${piece.shelves.back ? ' + back' : ''}`);
    }
  }
  for (const entry of blind.entries) {
    if (!entry.unsized) subLabels.set(entry.pieceId, `Blind ${formatInches(entry.boxWidth)}`);
    for (const [id, width] of blindCellWidths(cells.pieces, result.pieces, [entry])) {
      subLabels.set(id, `Blind ${formatInches(width)}`);
    }
    if (entry.panel && entry.endPieceId) {
      subLabels.set(entry.endPieceId, `Panel ${formatInches(entry.panel.width)}`);
    }
  }
  const cornerPanels = [];
  for (const [columnId, entry] of faceLayouts) {
    if (!entry.corner) continue;
    const { side, kind } = entry.corner;
    const { returnSide, legA, depthB } = cornerEnd(room, wall, run, side, settings, result);
    subLabels.set(columnId, `Corner ${kind}`);
    if (returnSide.type === 'end_panel') {
      const piece = result.pieces.find((candidate) => candidate.id === columnId);
      cornerPanels.push({
        key: `corner-panel:${side}`, side,
        x: piece.x + (side === 'right' ? legA - depthB : 0),
        width: depthB, columnId,
      });
    }
  }
  const panels = blind.entries.filter((entry) => entry.panel).map((entry) => ({
    key: `panel:${entry.side}`,
    x: entry.panel.x,
    width: entry.panel.width,
  }));
  const panelPieceIds = new Set(blind.entries
    .filter((entry) => entry.panel && entry.endPieceId)
    .map((entry) => entry.endPieceId));
  const panelBySide = { left: null, right: null };
  for (const entry of blind.entries) {
    if (entry.panel) panelBySide[entry.side] = entry.panel;
  }
  const endBottom = endPieceBottom(run, resolveStyle(settings, room, run), settings);
  const { drop } = endBottom;
  const openDrop = openBelowDrops(room, run, cells, settings);
  const shelves = cells.pieces.flatMap((piece) => shelfParts(piece, settings));
  const { tees, ells } = teeFillers(room, run, cells, settings);
  const endTees = new Map([
    ...tees.filter((tee) => tee.end).map((tee) => [tee.pieceId, tee]),
    ...ells.map((ell) => [ell.pieceId, ell]),
  ]);
  const seamTees = tees.filter((tee) => !tee.end).map((tee) => ({
    id: tee.id, kind: 'filler', role: 'tee', x: tee.x, z: tee.z, width: tee.width, height: tee.height,
  }));
  const miters = panelRunMiters(room, wall, run, settings);
  const base = cells.pieces.map((piece) => {
    const tee = endTees.get(piece.id);
    // A back panel mitered into a wall end panel runs over it (SPEC-43).
    const shaped = tee ? { ...piece, x: tee.x, width: tee.width } : { ...piece, ...miteredSpan(piece, run, miters) };
    const runEnd = piece.role === 'end-left' || piece.role === 'end-right';
    const pieceDrop = Math.max(drop, runEnd ? openDrop(piece) : 0);
    const dropped = pieceDrop > 0 && !shaped.inside
      && (shaped.kind === 'filler' || shaped.kind === 'end_panel')
      ? { ...shaped, z: shaped.z - pieceDrop, height: shaped.height + pieceDrop }
      : shaped;
    return panelPieceIds.has(piece.id)
      ? { ...dropped, kind: 'end_panel' }
      : dropped;
  });
  const drawnPieces = [
    ...extendPieces(wall, run, base).pieces.sort((a, b) => endTees.has(a.id) - endTees.has(b.id)),
    ...seamTees,
  ];
  return {
    result, cells, faceLayouts, frames, framedIds, hiddenIds, ghostIds, blind, subLabels,
    panels, cornerPanels, panelPieceIds, panelBySide, endBottom, shelves, tees, ells, drawnPieces,
  };
}
