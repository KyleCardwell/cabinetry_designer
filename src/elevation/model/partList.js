import { withBuildCache } from './buildCache.js';
import { combinedElevationPayload } from './combinedPayload.js';
import { drawingElevationFaces, facePayload } from './drawingPayload.js';
import { paperSize, plotScale } from './drawingScale.js';
import { numberItems } from './partNumbers.js';
import { planDimensions } from './planDimensions.js';
import { planMarks } from './planMarks.js';
import { furnitureBaseGroups } from './furnitureBaseGroups.js';
import { roomParts } from './parts.js';
import { planParts, planShapes } from './planParts.js';
import { woodTopGroups } from './woodTopGroups.js';

const MOLDINGS = { toe_kick: 'molding:toeKick', top_mold: 'molding:topMold', crown: 'molding:crown' };
const OWN_BAND = /^(countertop|furniture_base)(:\d+)?$|^top-/;

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

/** Shop items, numbering and complete drawing records for a synced room, with ownership tags. */
export function roomPartList(room, settings) {
  return withBuildCache(() => {
    const items = roomParts(room, settings);
    const numbers = numberItems(room, items);
    const index = itemIndex(items, {
      furnitureBases: furnitureBaseGroups(room, settings), woodTops: woodTopGroups(room, settings),
    });
    const tag = (piece) => ({ ...piece, itemKey: pieceItemKey(piece, index) });
    const shapes = planShapes(room, settings);
    const drawings = Array.from(drawingElevationFaces(room), ({ key, letter, wall, side, combined }) => {
      if (combined) {
        return combinedElevationPayload(room, combined, settings, (faceWall, faceSide, options) =>
          facePayload(room, faceWall, faceSide, key, letter, settings, options, numbers.byKey));
      }
      return facePayload(room, wall, side, key, letter, settings, undefined, numbers.byKey);
    });

    const elevations = drawings.map((drawing) => ({ ...drawing, parts: drawing.parts.map(tag) }));
    return {
      items,
      numbers,
      elevations,
      plotScale: plotScale(settings),
      paperSize: paperSize(settings),
      plan: {
        parts: planParts(room, settings).map(tag),
        dimensions: planDimensions(room, settings),
        marks: planMarks(room, settings),
        ...(shapes.length ? { shapes } : {}),
      },
    };
  });
}
