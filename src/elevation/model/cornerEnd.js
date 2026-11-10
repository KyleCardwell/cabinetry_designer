import { CABINET_TYPE_IDS } from './constants.js';

export const CORNER_KINDS = [90, 45];
export const RETURN_PIECES = ['auto', 'end_panel', 'filler', 'none'];

/** Replace an end with only the stored corner choices, defaulting missing parts. */
export function normalizeCornerEnd(end) {
  return {
    type: 'corner',
    width: null,
    corner: {
      kind: end.corner?.kind ?? 90,
      legB: end.corner?.legB ?? null,
      depthB: end.corner?.depthB ?? null,
      returnPiece: end.corner?.returnPiece ?? 'auto',
    },
  };
}

export function defaultLegA(run) {
  return run.cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 24 : 36;
}
