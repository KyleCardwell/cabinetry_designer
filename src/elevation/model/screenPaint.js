import { activeBuildCache, withBuildCache } from './buildCache.js';
import { faceDrawing } from './drawingPayload.js';
import { furnitureBaseGroups } from './furnitureBaseGroups.js';
import { itemIndex, pieceItemKey } from './partList.js';
import { roomParts } from './parts.js';
import { woodTopGroups } from './woodTopGroups.js';

/** The stored wall face's drawing record, with the room part list's ownership tags. */
export function screenFace(room, wall, side, settings, options) {
  return withBuildCache(() => {
    const index = activeBuildCache.byRoom('screenItemIndex', room, settings, () => itemIndex(
      roomParts(room, settings), {
        furnitureBases: furnitureBaseGroups(room, settings),
        woodTops: woodTopGroups(room, settings),
      },
    ));
    const drawing = faceDrawing(room, wall, side, settings, options);
    return {
      ...drawing,
      parts: drawing.parts.map((part) => ({ ...part, itemKey: pieceItemKey(part, index) })),
    };
  }, room);
}

function byPartId(entries) {
  const groups = new Map();
  for (const entry of entries ?? []) {
    if (!groups.has(entry.partId)) groups.set(entry.partId, []);
    groups.get(entry.partId).push(entry);
  }
  return groups;
}

/** Stable back-to-front paint order; each part carries the details it can cover or expose. */
export function paintEntries(drawing, { doorsOff = false, runIds = null } = {}) {
  const parts = drawing.parts
    .filter((part) => runIds === null || runIds.has(part.runId))
    .filter((part) => !doorsOff || part.kind !== 'face');
  const details = new Map((drawing.doorDetails ?? []).map((entry) => [entry.partId, entry]));
  const pulls = byPartId(drawing.pulls);
  const swings = byPartId(drawing.swingMarks);
  const legs = byPartId((drawing.shapes ?? []).filter(({ kind }) => kind === 'leg'));
  return parts.flatMap((part) => {
    const slices = part.strips?.length
      ? part.strips.map(({ z1, z2, front }) => ({ clip: { z1, z2 }, front }))
      : [{ clip: null, front: part.front }];
    const deepest = slices.reduce((a, b) => b.front > a.front ? b : a);
    return slices.map((slice) => ({
      part,
      ...slice,
      doorDetail: slice === deepest ? details.get(part.id) ?? null : null,
      pulls: slice === deepest ? pulls.get(part.id) ?? [] : [],
      swingMarks: slice === deepest ? swings.get(part.id) ?? [] : [],
      legLoops: slice === deepest ? (legs.get(part.id) ?? []).flatMap(({ loops }) => loops) : [],
    }));
  }).sort((a, b) => a.front - b.front);
}
