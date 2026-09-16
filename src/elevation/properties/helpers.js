import { validateRunPlacement } from '../model/overlap.js';

/**
 * Build and validate a prospective partial update to a run.
 *
 * @param {object} wall
 * @param {object} run
 * @param {object} settings
 * @param {object} changes
 * @returns {{patchedRun: object, validation: {ok: boolean, reason: string|null}}}
 */
export function prepareRunUpdate(wall, run, settings, changes) {
  const patchedRun = { ...run, ...changes };
  return {
    patchedRun,
    validation: validateRunPlacement(wall, patchedRun, settings),
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
