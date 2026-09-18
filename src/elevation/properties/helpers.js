import { formatInches } from '../model/units.js';
import { tryPlaceRun } from '../model/room.js';

/** Format a resolved corner reserve for the run properties panel. */
export function formatCornerReserve(parts) {
  const resolved = `Reserve ${formatInches(parts.total)}`;
  if (parts.source === 'face') return `${resolved} · Face only`;
  if (parts.source === 'custom') return `${resolved} · Custom`;
  return `${resolved} (face ${formatInches(parts.face)} + back ${formatInches(parts.back)})`;
}

/** Format any horizontal wall overhang on a run. */
export function formatRunOverhang(run, wallLength) {
  const sides = [];
  const left = Math.max(0, -run.x);
  const right = Math.max(0, run.x + run.width - wallLength);
  if (left > 0) sides.push(`left ${formatInches(left)}`);
  if (right > 0) sides.push(`right ${formatInches(right)}`);
  return sides.length > 0 ? `Overhangs ${sides.join(' · ')}` : null;
}

/** Format a run warning that points at an opening. */
export function formatRunWarning(warning) {
  if (warning.code === 'blocks-opening') return `Blocks ${warning.label}`;
  if (warning.code === 'casing-clearance') {
    return `${warning.label} ${warning.side} clearance ${formatInches(warning.gap)}; ${formatInches(warning.required)} required`;
  }
  return warning.message ?? null;
}

/**
 * Build and validate a prospective partial update to a run.
 *
 * @param {object} room
 * @param {string} wallId
 * @param {object} run
 * @param {object} settings
 * @param {object} changes
 * @returns {{patchedRun: object, validation: {ok: boolean, reason: string|null}}}
 */
export function prepareRunUpdate(room, wallId, run, settings, changes) {
  const patchedRun = { ...run, ...changes };
  const roomWithoutRun = {
    ...room,
    walls: room.walls.map((wall) => (
      wall.id === wallId
        ? { ...wall, runs: wall.runs.filter((candidate) => candidate.id !== run.id) }
        : wall
    )),
  };
  const placement = tryPlaceRun(roomWithoutRun, wallId, patchedRun, settings);
  return {
    patchedRun,
    validation: { ok: placement.ok, reason: placement.reason },
  };
}

/**
 * Resolve a selected derived piece back to its stored item or run end.
 *
 * @param {object} run
 * @param {{pieces: object[]}} layout
 * @param {string|null} pieceId
 * @returns {{piece: object, item: object|null, side: 'left'|'right'|null}|null}
 */
export function resolveSelectedPiece(run, layout, pieceId) {
  if (!pieceId) return null;
  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return null;

  if (piece.role === 'item') {
    return {
      piece,
      item: run.items.find((candidate) => candidate.id === piece.id) ?? null,
      side: null,
    };
  }

  return {
    piece,
    item: null,
    side: piece.role === 'end-left' ? 'left' : 'right',
  };
}

/**
 * Return the last stored item in a run.
 *
 * @param {object} run
 * @returns {object|null}
 */
export function lastRunItem(run) {
  return run.items[run.items.length - 1] ?? null;
}

/**
 * Return the last cabinet item in a run.
 *
 * @param {object} run
 * @returns {object|null}
 */
export function lastCabinetItem(run) {
  for (let index = run.items.length - 1; index >= 0; index -= 1) {
    if (run.items[index].kind === 'cabinet') return run.items[index];
  }
  return null;
}
