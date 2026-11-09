import { panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';

const EPSILON = 1e-6;

function neighbourKind(piece) {
  if (piece.kind === 'end_panel'
    || (piece.kind === 'panel' && panelOrientation(piece) === 'side')) return 'panel';
  return piece.kind === 'cabinet' ? 'cabinet' : null;
}

/** A run-end filler or end panel that stops above the floor (DR2 "match the cabinets"), or null. */
function raisedEnd(run, cells, side) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  return cells.pieces.find((piece) => (piece.kind === 'filler' || piece.kind === 'end_panel')
    && piece.z > run.z + EPSILON
    && Math.abs((side === 'left' ? piece.x : piece.x + piece.width) - edge) <= EPSILON) ?? null;
}

/**
 * Floor-level voids and back panels, with the pieces touching each side at the bottom. A raised end piece
 * beside one joins it: nothing stands on the floor there, so no base runs under it (DR5).
 */
export function floorOpenings(run, cells) {
  const openings = bottomOpenings(run, cells);
  const left = raisedEnd(run, cells, 'left');
  const first = left && openings.find(({ x }) => Math.abs(x - left.x - left.width) <= EPSILON);
  if (first) Object.assign(first, { x: left.x, width: first.width + left.width, left: null });
  const right = raisedEnd(run, cells, 'right');
  const last = right && openings.find(({ x, width }) => Math.abs(x + width - right.x) <= EPSILON);
  if (last) Object.assign(last, { width: last.width + right.width, right: null });
  return openings;
}

/**
 * Whether a floor opening reaches this side of the run, with only the run's end piece (if any) between,
 * so the run's floor base stops short of that side. `onFloor`: that end piece is drawn down to the floor.
 * `scene` is runScene's.
 */
export function floorEndOpen(run, scene, side) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  const atEdge = (piece) => (piece.kind === 'filler' || piece.kind === 'end_panel')
    && Math.abs((side === 'left' ? piece.x : piece.x + piece.width) - edge) <= EPSILON;
  const cell = scene.cells.pieces.find(atEdge);
  const inner = cell ? (side === 'left' ? cell.x + cell.width : cell.x) : edge;
  const open = floorOpenings(run, scene.cells).some((opening) => !opening.baseUnder && (side === 'left'
    ? opening.x <= inner + EPSILON : opening.x + opening.width >= inner - EPSILON));
  const drawn = scene.drawnPieces.find(atEdge);
  return { open, onFloor: Boolean(drawn && drawn.z <= EPSILON) };
}

function bottomOpenings(run, cells) {
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
