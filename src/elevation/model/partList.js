import { withBuildCache } from './buildCache.js';
import { combinedElevationPayload } from './combinedPayload.js';
import { drawingElevationFaces, faceDrawing } from './drawingPayload.js';
import { furnitureBaseGroups } from './furnitureBaseGroups.js';
import { roomParts } from './parts.js';
import { planParts } from './planParts.js';
import { woodTopGroups } from './woodTopGroups.js';

const MOLDINGS = { toe_kick: 'molding:toeKick', top_mold: 'molding:topMold', crown: 'molding:crown' };
const OWN_BAND = /^(countertop|furniture_base)(:\d+)?$|^top-/;
const DRAWINGS = ['doorDetails', 'swingMarks', 'pulls', 'interiors', 'shapes', 'glassMarks'];

/**
 * Index once per list. `bands` maps each drawn furniture base / wood top band id to its group's
 * item, since one run can carry several (N2). A band seen from another face (corner or profile
 * view) has its own id and falls back to its run's group only when the run has exactly one;
 * a run's own band that no group lists stays untagged.
 */
export function itemIndex(items, { furnitureBases = [], woodTops = [] } = {}) {
  const exact = new Map(items.map((item) => [item.key, item]));
  const bands = new Map();
  for (const group of furnitureBases) {
    for (const bandId of group.bandIds ?? []) bands.set(bandId, group.key);
  }
  for (const group of woodTops) {
    for (const { bandId } of group.bandRefs ?? []) bands.set(bandId, group.key);
  }
  const byRun = { furniture_base: new Map(), wood_top: new Map() };
  for (const item of items) {
    const runs = byRun[item.kind];
    if (!runs) continue;
    for (const runId of item.runIds) runs.set(runId, runs.has(runId) ? null : item.key);
  }
  return { exact, bands, byRun };
}

/** First matching ownership rule, with longest colon-delimited item prefix winning. */
export function pieceItemKey(piece, index) {
  const molding = MOLDINGS[piece.kind];
  if (molding) return index.exact.has(molding) ? molding : null;
  if (piece.kind === 'furniture_base' || piece.kind === 'countertop') {
    const kind = piece.kind === 'countertop' ? 'wood_top' : 'furniture_base';
    const owner = index.bands.get(piece.id);
    if (owner !== undefined) return index.exact.has(owner) ? owner : null;
    // The run's own band that no group lists isn't ordered (e.g. a stone top beside a wood segment).
    // Waterfall legs and other views of the band still fall back to the run.
    const own = String(piece.id).slice(String(piece.runId).length + 1);
    if (String(piece.id).startsWith(`${piece.runId}:`) && OWN_BAND.test(own)) return null;
    return index.byRun[kind].get(piece.runId) ?? null;
  }
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
    const index = itemIndex(items, {
      furnitureBases: furnitureBaseGroups(room, settings), woodTops: woodTopGroups(room, settings),
    });
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
