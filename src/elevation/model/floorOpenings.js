import { panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';

const EPSILON = 1e-6;

function neighbourKind(piece) {
  if (piece.kind === 'end_panel'
    || (piece.kind === 'panel' && panelOrientation(piece) === 'side')) return 'panel';
  return piece.kind === 'cabinet' ? 'cabinet' : null;
}

/** Floor-level voids and back panels, with the pieces touching each side at the bottom. */
export function floorOpenings(run, cells) {
  const bottom = cells.pieces.filter((piece) => Math.abs(piece.z - run.z) <= EPSILON);
  return bottom.filter((piece) => piece.kind === 'void'
    || (piece.kind === 'panel' && panelOrientation(piece) === 'back'))
    .sort((a, b) => a.x - b.x)
    .map((piece) => ({
      pieceId: piece.id,
      x: piece.x,
      width: piece.width,
      baseUnder: Boolean(run.grid && findLeaf(run.grid, piece.id)?.baseUnder === true),
      left: neighbourKind(bottom.find((candidate) => candidate !== piece
        && Math.abs(candidate.x + candidate.width - piece.x) <= EPSILON) ?? {}),
      right: neighbourKind(bottom.find((candidate) => candidate !== piece
        && Math.abs(candidate.x - piece.x - piece.width) <= EPSILON) ?? {}),
    }));
}
