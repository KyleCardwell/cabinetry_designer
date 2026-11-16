import { withBuildCache } from './buildCache.js';
import { combinedElevationPayload } from './combinedPayload.js';
import { drawingElevationFaces, faceDrawing } from './drawingPayload.js';
import { roomParts } from './parts.js';
import { planParts } from './planParts.js';

const MOLDINGS = { toe_kick: 'molding:toeKick', top_mold: 'molding:topMold', crown: 'molding:crown' };
const DRAWINGS = ['doorDetails', 'swingMarks', 'pulls', 'interiors', 'shapes', 'glassMarks'];

/** Index once per list; run membership keeps the first item in numbering order. */
export function itemIndex(items) {
  const exact = new Map(items.map((item) => [item.key, item]));
  const byRun = { furniture_base: new Map(), wood_top: new Map() };
  for (const item of items) {
    const runs = byRun[item.kind];
    if (!runs) continue;
    for (const runId of item.runIds) {
      if (!runs.has(runId)) runs.set(runId, item.key);
    }
  }
  return { exact, byRun };
}

/** First matching ownership rule, with longest colon-delimited item prefix winning. */
export function pieceItemKey(piece, index) {
  const molding = MOLDINGS[piece.kind];
  if (molding) return index.exact.has(molding) ? molding : null;
  if (piece.kind === 'furniture_base') return index.byRun.furniture_base.get(piece.runId) ?? null;
  if (piece.kind === 'countertop') return index.byRun.wood_top.get(piece.runId) ?? null;
  if (index.exact.has(piece.id)) return piece.id;
  if (typeof piece.id !== 'string') return null;
  for (let end = piece.id.lastIndexOf(':'); end >= 0; end = piece.id.lastIndexOf(':', end - 1)) {
    const key = piece.id.slice(0, end);
    if (index.exact.has(key)) return key;
    if (end === 0) break;
  }
  return null;
}

/** Shop items and the geometry drawn for a synced room, without annotations. */
export function roomPartList(room, settings) {
  return withBuildCache(() => {
    const items = roomParts(room, settings);
    const index = itemIndex(items);
    const tag = (piece) => ({ ...piece, itemKey: pieceItemKey(piece, index) });
    const elevations = Array.from(drawingElevationFaces(room), ({ key, letter, wall, side, combined }) => {
      const buildFace = (faceWall, faceSide, options) => {
        const { view, ...drawing } = faceDrawing(room, faceWall, faceSide, settings, options);
        return {
          key, letter, wallId: faceWall.id, side: faceSide,
          length: view.length, height: faceWall.height, ...drawing,
        };
      };
      const drawing = combined
        ? combinedElevationPayload(room, combined, settings, buildFace)
        : buildFace(wall, side);
      return {
        key, letter, wallId: drawing.wallId, side: drawing.side,
        length: drawing.length, height: drawing.height,
        pieces: drawing.parts.map(tag),
        drawings: Object.fromEntries(DRAWINGS.map((name) => [name, drawing[name] ?? []])),
      };
    });
    return { items, elevations, plan: { pieces: planParts(room, settings).map(tag) } };
  });
}
