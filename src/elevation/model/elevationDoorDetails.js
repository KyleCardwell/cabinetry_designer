import { doorDrawing, runDoorDetails } from './doorDetails.js';
import { resolveWall } from './room.js';

/**
 * Each part's door detail on one wall face as geometry draws it (SPEC-46.4): openings when the room draws details,
 * the style label when it shows tags; keyed by the part's id in `elevationParts`.
 */
export function elevationDoorDetails(room, wall, side, settings, partIds = null) {
  const { details, tags } = doorDrawing(room);
  if (!details && !tags) return [];

  const view = resolveWall(room, wall, side);
  const result = [];
  for (const run of view.runs) {
    for (const part of runDoorDetails(room, view, run, settings).parts) {
      const { pieceId, path } = part;
      let partId = pieceId;
      if (part.kind === 'face') {
        const half = part.key.slice(`${pieceId}:${path}`.length + 1);
        partId = `${pieceId}:${path}${half}`;
      }
      if (partId === null || (partIds && !partIds.has(partId))) continue;

      const entry = { partId };
      if (details && part.openings.length) {
        entry.openings = part.openings.map(({ x, z, width, height }) => ({ x, z, width, height }));
      }
      if (tags) entry.tag = part.label;
      if (entry.openings || tags) result.push(entry);
    }
  }
  return result;
}
