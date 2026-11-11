import { panelMaterial } from './constants.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerReturnLegs } from './cornerLegs.js';
import { doorDrawing } from './doorDetails.js';
import { teamDoorStyle } from './doorStyles.js';
import { runFillerThickness } from './planPieces.js';
import { pullOutlines } from './pullLayouts.js';
import { runSwingMarks } from './swingMarks.js';
import { wallViewForRun } from './wallSides.js';

const rect = ({ x, z, width, height }) => ({ x, z, width, height });

/** Return-wall corner legs in geometry's payload shapes, with their own part ids. */
export function cornerLegPayload(room, view, settings) {
  const result = { parts: [], doorDetails: [], swingMarks: [], pulls: [] };
  const drawing = doorDrawing(room);
  for (const leg of cornerReturnLegs(room, view, settings)) {
    const ownerWall = room.walls.find(({ id }) => id === leg.ownerWallId);
    const run = ownerWall.runs.find(({ id }) => id === leg.runId);
    const ownerView = wallViewForRun(ownerWall, run);
    const { depthB, offsetB } = cornerEnd(room, ownerView, run, leg.side, settings);
    const parts = [{
      id: leg.key, kind: 'cabinet', runId: run.id, ...leg.rect,
      back: 0, front: depthB, coversBoxEdges: false,
    }];
    if (leg.returnPanel) {
      const filler = leg.returnPanel.type === 'filler';
      parts.push({
        id: `${leg.key}:panel`, kind: leg.returnPanel.type, runId: run.id, ...rect(leg.returnPanel),
        back: filler ? depthB - runFillerThickness(room, ownerView, run, settings) : 0,
        front: depthB, coversBoxEdges: filler,
      });
    }
    if (leg.frame) {
      parts.push({
        id: `${leg.key}:frame`, kind: 'frame', runId: run.id, ...rect(leg.frame),
        back: depthB, front: depthB + offsetB, coversBoxEdges: true, holes: leg.frame.openings,
      });
    }
    for (const face of leg.faceLayout.faces) {
      if (face.type === 'open') continue;
      const thickness = face.thickness ?? teamDoorStyle(settings).thickness;
      parts.push({
        id: `${leg.key}:${face.path}${face.half ?? ''}`, kind: 'face', runId: run.id, ...rect(face),
        back: depthB + offsetB - thickness, front: depthB + offsetB, coversBoxEdges: true,
      });
    }
    result.parts.push(...parts);
    const partIds = new Set(parts.map(({ id }) => id));
    const rePrefix = (partId) => leg.key + partId.slice(leg.columnId.length);
    for (const part of leg.doorDetails.parts) {
      const half = part.key.slice(`${part.pieceId}:${part.path}`.length + 1);
      const partId = rePrefix(part.kind === 'face'
        ? `${part.pieceId}:${part.path}${half}` : part.pieceId);
      if (!partIds.has(partId)) continue;
      const entry = { partId };
      const seeThrough = part.kind === 'face' && part.construction === 'five_piece'
        && panelMaterial(part.panelMaterial)?.seeThrough;
      if (drawing.details && !seeThrough && part.openingsShown && part.openings.length) {
        entry.openings = part.openings.map(rect);
      }
      if (drawing.details && part.lines.length) entry.profileLines = part.lines.map(rect);
      if (drawing.details && part.miters.length) {
        entry.miters = part.miters.map(({ x1, z1, x2, z2 }) => ({ x1, z1, x2, z2 }));
      }
      if (drawing.tags) entry.tag = part.label;
      if (entry.openings || entry.profileLines || entry.miters || drawing.tags) result.doorDetails.push(entry);
    }
    if (drawing.swings) {
      for (const { partId, lines } of runSwingMarks(new Map([[leg.columnId, leg.faceLayout]]))) {
        const id = rePrefix(partId);
        if (partIds.has(id)) result.swingMarks.push({ partId: id, lines });
      }
    }
    if (drawing.pulls) {
      for (const pull of leg.pulls) {
        const partId = rePrefix(pull.partId);
        if (partIds.has(partId)) result.pulls.push({ partId, outlines: pullOutlines(pull) });
      }
    }
  }
  return result;
}
