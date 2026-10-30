import { runItems } from './grid.js';
import { findLine, lineX } from './layoutLines.js';
import { openingGeometry } from './openings.js';

/** Height above the floor where centerline callouts are drawn. */
const CENTERLINE_CALLOUT_Z = 40;

/** How far above an opening's jamb bottom a callout to that opening sits (SPEC-39.1). */
const CENTERLINE_ABOVE_SILL = 6;

/**
 * A placed column's position callout (SPEC-12, SPEC-38.1; LL4 from layout lines): from its datum to the
 * point it holds (left edge, centre or right edge). The datum is the window/door on the same line when
 * there is one (`from: 'opening'`), else the wall end the line is measured from.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = runItems(run).find((candidate) => candidate.id === piece.id);
    if (!item?.attach) return [];
    const line = findLine(wall, item.attach.lineId);
    if (!line) return [];
    const anchor = item.attach.at;
    const opening = (wall.openings ?? []).find((candidate) => candidate.attach?.lineId === line.id) ?? null;
    const datumX = opening
      ? lineX(line, wallLengthValue) + opening.attach.offset
      : line.from === 'right' ? wallLengthValue : 0;
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
      from: opening ? 'opening' : line.from,
      anchor,
      ...(jamb ? { datumZ: jamb.z + jamb.height / 2 } : {}),
    }];
  });
}
