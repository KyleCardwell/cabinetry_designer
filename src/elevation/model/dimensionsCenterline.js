import { runItems } from './grid.js';
import { openingGeometry } from './openings.js';
import { resolvePinTarget } from './room.js';

/** Height above the floor where centerline callouts are drawn. */
export const CENTERLINE_CALLOUT_Z = 40;

/** How far above an opening's jamb bottom a pin callout to that opening sits (SPEC-39.1). */
export const CENTERLINE_ABOVE_SILL = 6;

/**
 * A pinned cabinet's position callout (SPEC-12, SPEC-38.1): from the pin's datum (a wall end or an opening
 * edge) to the point the pin holds, its left edge, center or right edge.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = runItems(run).find((candidate) => candidate.id === piece.id);
    if (!item?.pin) return [];
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    if (!Number.isFinite(target)) return [];
    const datumX = item.pin.from === 'right'
      ? target + item.pin.value
      : target - item.pin.value;
    const { anchor } = item.pin;
    const opening = item.pin.from === 'opening'
      ? (wall.openings ?? []).find((candidate) => candidate.id === item.pin.openingId) ?? null
      : null;
    const jamb = opening ? openingGeometry(opening, wallLengthValue, settings).jamb : null;
    const x = anchor === 'left'
      ? piece.x
      : anchor === 'right' ? piece.x + piece.width : piece.x + piece.width / 2;
    return [{
      pieceId: piece.id,
      x,
      datumX,
      z: jamb ? jamb.z + Math.min(CENTERLINE_ABOVE_SILL, jamb.height / 2) : CENTERLINE_CALLOUT_Z,
      value: Math.abs(x - datumX),
      pieceBottom: piece.z,
      pieceTop: piece.z + piece.height,
      from: item.pin.from,
      anchor,
      ...(jamb ? { datumZ: jamb.z + jamb.height / 2 } : {}),
    }];
  });
}
