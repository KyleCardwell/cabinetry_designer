import { blindEntries } from './blind.js';
import { blindCellWidths, cellPieces, floatingShelfLayout, panelOrientation, shelfParts } from './cells.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerFrame } from './cornerFrame.js';
import { squashRect } from './cornerSquash.js';
import { extendRunPieces } from './extensions.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { frameRegions } from './frames.js';
import { endPieceBottom, resolveStyle } from './styles.js';
import { teeFillers } from './tees.js';
import { formatInches } from './units.js';
import { miteredSpan, panelRunMiters } from './wallEndPanels.js';

const PANEL_LABELS = { side: 'Side', top: 'Top', back: 'Back' };

/** Project frames for drawing, badges and picking, retaining true member sizes on the frame itself. */
function cornerFrameView(frame, corner, entry, returning = false) {
  const { z, height } = frame.frame;
  if (frame.kind === 45) {
    const width = frame.diagonal.frontWidth;
    const x = entry.squash.pivot - (corner.dir === 1 ? width : 0);
    const squash = returning ? entry.cornerReturn.squash : entry.squash;
    return {
      ...squashRect({ x, width, z, height }, squash),
      members: frame.members.map((member) => squashRect(member, squash)),
      openings: frame.diagonal.openings.map(({ p0, p1, z, height }) => squashRect({
        x: entry.squash.pivot + (corner.dir === 1 ? -p1 : p0),
        width: p1 - p0, z, height,
      }, squash)),
    };
  }
  const members = frame.members.filter(({ side }) => side === (returning ? 'B' : 'A'))
    .map((member) => {
      if (!returning) return member;
      const p0 = corner.dir === 1 ? member.x - corner.cornerX
        : corner.cornerX - member.x - member.width;
      const { at, dir } = entry.cornerReturn;
      return { ...member, x: Math.min(at + dir * p0, at + dir * (p0 + member.width)) };
    });
  const leg = frame.legs[returning ? 1 : 0];
  const { at, dir } = returning ? entry.cornerReturn : { at: corner.cornerX, dir: corner.dir };
  return {
    x: Math.min(at + dir * leg.x0, at + dir * leg.x1), width: leg.x1 - leg.x0, z, height, members,
    openings: leg.openings.map(({ p0, p1, z, height }) => ({
      x: Math.min(at + dir * p0, at + dir * p1), width: p1 - p0, z, height,
    })),
  };
}

/**
 * Everything RunGroup draws for a run, derived once (SPEC-39.1): the layout, cells, faces, frames,
 * blind panels and the pieces as drawn (T-fillers, extensions and end drops applied). The canvas
 * draws from it and the click picker hit-tests it, so the two can't disagree.
 */
export function runScene(room, wall, run, settings) {
  const result = layoutRun(room, wall, run, settings);
  const cells = cellPieces(run, result);
  const faceLayouts = runFaceLayouts(room, wall, run, settings, result);
  const frames = frameRegions(room, run, cells, settings, faceLayouts);
  const cornerFrames = [];
  frames.cornerFrames = cornerFrames;
  const framedIds = new Set(frames.regions.flatMap((region) => region.cabinetIds));
  const hiddenIds = new Set(frames.regions.flatMap((region) => region.fillerIds));
  const ghostIds = new Set(frames.regions.flatMap((region) => [
    ...region.panelIds, ...(region.legButts ?? []).flatMap((butt) => butt.panelId ?? []),
  ]));
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
    const corner = cornerEnd(room, wall, run, side, settings, result);
    const { returnSide, legA, depthB } = corner;
    const frame = cornerFrame(room, wall, run, side, settings, result, faceLayouts);
    if (frame) cornerFrames.push({
      ...frame,
      owner: cornerFrameView(frame, corner, entry),
      ...(entry.cornerReturn ? { return: cornerFrameView(frame, corner, entry, true) } : {}),
    });
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
    return shaped;
  });
  const drawnPieces = [
    ...extendRunPieces(room, wall, run, cells, settings, base).pieces
      .map((piece) => panelPieceIds.has(piece.id) ? { ...piece, kind: 'end_panel' } : piece)
      .sort((a, b) => endTees.has(a.id) - endTees.has(b.id)),
    ...seamTees,
  ];
  return {
    result, cells, faceLayouts, frames, framedIds, hiddenIds, ghostIds, blind, subLabels,
    panels, cornerPanels, cornerFrames, panelPieceIds, panelBySide, endBottom, shelves, tees, ells, drawnPieces,
  };
}
