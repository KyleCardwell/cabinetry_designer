import { panelOrientation } from './cells.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { wallLength } from './geometry.js';
import { verticalStart } from './overlap.js';
import { soffitsOn } from './soffits.js';
import { wallSideOf } from './wallSides.js';

/** Where a filler or panel can extend to, per direction (SPEC-35.3). */
export const EXTEND_TARGETS = {
  up: ['ceiling', 'run', 'by'],
  down: ['floor', 'run', 'by'],
  left: ['wall', 'run', 'by'],
  right: ['wall', 'run', 'by'],
};

/** Directions in the order they are applied. */
export const EXTEND_DIRECTIONS = ['up', 'down', 'left', 'right'];

const TARGET_KEYS = {
  floor: ['to'],
  ceiling: ['to'],
  wall: ['to'],
  run: ['to', 'runId'],
  by: ['to', 'amount'],
};

const EPSILON = 1e-6;

/** Whether a value is a valid extension target for one direction. */
export function isExtendTarget(direction, target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
  if (!EXTEND_TARGETS[direction]?.includes(target.to)) return false;
  if (Object.keys(target).some((key) => !TARGET_KEYS[target.to].includes(key))) return false;
  if (target.to === 'run') return typeof target.runId === 'string';
  if (target.to === 'by') {
    return typeof target.amount === 'number' && Number.isFinite(target.amount) && target.amount > 0;
  }
  return true;
}

/** Whether a stored `extend` is valid: undefined, or one or more valid directions. */
export function isExtend(extend) {
  if (extend === undefined) return true;
  if (!extend || typeof extend !== 'object' || Array.isArray(extend)) return false;
  const entries = Object.entries(extend);
  return entries.length > 0
    && entries.every(([direction, target]) => isExtendTarget(direction, target));
}

/** The directions a piece can extend: along its length. */
export function extendDirections(piece) {
  if (piece?.kind === 'end_panel' || piece?.kind === 'filler') return ['up', 'down'];
  const orientation = panelOrientation(piece);
  if (orientation === 'side') return ['up', 'down'];
  if (orientation === 'top') return ['left', 'right'];
  return [];
}

/** The lowest soffit bottom over a piece on its run's side of the wall, else the wall height. */
function ceilingOver(wall, run, piece) {
  const right = piece.x + piece.width;
  const bottoms = soffitsOn(wall, wallSideOf(run))
    .filter((soffit) => Math.min(right, soffit.x + soffit.width) - Math.max(piece.x, soffit.x) > EPSILON)
    .map((soffit) => soffit.bottom);
  return bottoms.length > 0 ? Math.min(...bottoms) : wall.height;
}

/**
 * Where an extension reaches: a z for up/down, an x for left/right. Null when its target run is gone.
 */
export function extensionEdge(wall, run, piece, direction, target) {
  if (target.to === 'by') {
    if (direction === 'down') return piece.z - target.amount;
    if (direction === 'up') return piece.z + piece.height + target.amount;
    if (direction === 'left') return piece.x - target.amount;
    return piece.x + piece.width + target.amount;
  }
  if (target.to === 'floor') return 0;
  if (target.to === 'ceiling') return ceilingOver(wall, run, piece);
  if (target.to === 'wall') return direction === 'left' ? 0 : wallLength(wall);
  const other = (wall.runs ?? []).find((candidate) => candidate.id === target.runId
    && candidate.id !== run.id
    && wallSideOf(candidate) === wallSideOf(run));
  if (!other) return null;
  if (direction === 'down') return other.z;
  if (direction === 'up') return other.z + other.height;
  if (direction === 'left') return other.x;
  return other.x + other.width;
}

function onRunEdge(run, piece, direction) {
  if (direction === 'down') return piece.z <= run.z + EPSILON;
  if (direction === 'up') return piece.z + piece.height >= run.z + run.height - EPSILON;
  if (direction === 'left') return piece.x <= run.x + EPSILON;
  return piece.x + piece.width >= run.x + run.width - EPSILON;
}

/** The piece grown to an edge, or null when the edge isn't past the piece. */
function grow(piece, direction, edge) {
  if (direction === 'down') {
    return edge < piece.z - EPSILON
      ? { ...piece, z: edge, height: piece.z + piece.height - edge }
      : null;
  }
  if (direction === 'up') {
    return edge > piece.z + piece.height + EPSILON ? { ...piece, height: edge - piece.z } : null;
  }
  if (direction === 'left') {
    return edge < piece.x - EPSILON
      ? { ...piece, x: edge, width: piece.x + piece.width - edge }
      : null;
  }
  return edge > piece.x + piece.width + EPSILON ? { ...piece, width: edge - piece.x } : null;
}

const WARNINGS = {
  'extend-blocked': (direction) => `Can't extend ${direction} from here: only along the piece, from the run's edge.`,
  'extend-target-missing': () => 'The run this piece extends to is gone.',
  'extend-short': (direction) => `Extending ${direction} doesn't reach past this piece.`,
};

function extendWarning(code, piece, direction) {
  return { code, pieceId: piece.id, direction, message: WARNINGS[code](direction) };
}

/**
 * Grow every piece that has an `extend` past its run's edge (SPEC-35.3). A piece grows only along
 * its length, only from the run's edge, and never shrinks. A grown piece lists its directions in
 * `extended`; every other piece is returned as is.
 */
export function extendPieces(wall, run, pieces) {
  const warnings = [];
  const next = pieces.map((piece) => {
    if (!piece.extend) return piece;
    const allowed = extendDirections(piece);
    const extended = [];
    let current = piece;
    for (const direction of EXTEND_DIRECTIONS) {
      const target = piece.extend[direction];
      if (!target) continue;
      if (!allowed.includes(direction) || !onRunEdge(run, piece, direction)) {
        warnings.push(extendWarning('extend-blocked', piece, direction));
        continue;
      }
      const edge = extensionEdge(wall, run, current, direction, target);
      if (edge === null) {
        warnings.push(extendWarning('extend-target-missing', piece, direction));
        continue;
      }
      const grown = grow(current, direction, edge);
      if (!grown) {
        warnings.push(extendWarning('extend-short', piece, direction));
        continue;
      }
      current = grown;
      extended.push(direction);
    }
    return extended.length > 0 ? { ...current, extended } : piece;
  });
  return { pieces: next, warnings };
}

/** The extended end piece on one side of a run, or null when that end does not extend. */
export function extendedEndPiece(wall, run, side, settings = DEFAULT_SETTINGS) {
  const end = run.ends?.[side];
  if (!end?.extend || (end.type !== 'end_panel' && end.type !== 'filler')) return null;
  const width = end.width ?? (end.type === 'end_panel'
    ? settings.endPanelThickness
    : settings.fillerMinWidth);
  const z = verticalStart(run, settings);
  const piece = {
    id: `${run.id}:${side}`,
    kind: end.type,
    x: side === 'left' ? run.x : run.x + run.width - width,
    z,
    width,
    height: run.z + run.height - z,
    depth: run.depth,
    extend: end.extend,
  };
  const extended = extendPieces(wall, run, [piece]).pieces[0];
  return extended.extended ? extended : null;
}

/** Signed inset to an extended end piece's inside face when it reaches a follower's box. */
export function followInset(wall, leader, follower, side, settings = DEFAULT_SETTINGS) {
  const piece = extendedEndPiece(wall, leader, side, settings);
  if (!piece) return 0;
  const overlaps = piece.z < follower.z + follower.height - EPSILON
    && piece.z + piece.height > follower.z + EPSILON;
  if (!overlaps) return 0;
  return side === 'left' ? piece.width : -piece.width;
}

/** Whether a same-edge follower's whole box height is covered by the leader's extension. */
export function extensionCoversEnd(wall, run, side, settings = DEFAULT_SETTINGS) {
  const anchor = run.anchors?.[side];
  if (anchor?.side !== side) return false;
  const leader = (wall.runs ?? []).find((candidate) => candidate.id === anchor.runId);
  const piece = leader && extendedEndPiece(wall, leader, side, settings);
  return !!piece
    && piece.z <= run.z + EPSILON
    && piece.z + piece.height >= run.z + run.height - EPSILON;
}
