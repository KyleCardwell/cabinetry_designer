import { panelOrientation } from './cells.js';

const EPS = 1e-6;

function isPanelLike(neighbor, piece) {
  return Boolean(neighbor) && (
    neighbor.kind === 'filler'
    || neighbor.kind === 'end_panel'
    || (panelOrientation(neighbor) === 'side' && neighbor.doors !== 'cover')
    || neighbor.depth > piece.depth + EPS
  );
}

function overlapsVertically(a, b) {
  return a.z < b.z + b.height - EPS && b.z < a.z + a.height - EPS;
}

/**
 * Whether each side of a cabinet piece is against a filler, an end panel or a deeper piece.
 * Uses the neighbor in its own run; at a run edge with no end piece, uses pieces of other
 * runs on the wall that touch that edge (within `tolerance`) and overlap it vertically.
 *
 * @returns {{left: boolean, right: boolean}}
 */
export function captureSides(runPieces, pieceId, otherPieces = [], tolerance = 1) {
  const index = runPieces.findIndex((candidate) => candidate.id === pieceId);
  if (index === -1) return { left: false, right: false };
  const piece = runPieces[index];
  const side = (neighbor, touches) => {
    if (neighbor) return isPanelLike(neighbor, piece);
    return otherPieces.some((candidate) => (
      touches(candidate)
      && overlapsVertically(candidate, piece)
      && isPanelLike(candidate, piece)
    ));
  };
  return {
    left: side(
      runPieces[index - 1],
      (candidate) => Math.abs(candidate.x + candidate.width - piece.x) <= tolerance,
    ),
    right: side(
      runPieces[index + 1],
      (candidate) => Math.abs(candidate.x - (piece.x + piece.width)) <= tolerance,
    ),
  };
}
