import { DEFAULT_PREFS } from './constants.js';

/** The DXF's drawing scales (SPEC-43), as [plotScale, label]: plotScale is drawing inches per paper inch. */
export const PLOT_SCALES = [
  [12, '1" = 1\'-0"'],
  [16, '3/4" = 1\'-0"'],
  [24, '1/2" = 1\'-0"'],
  [32, '3/8" = 1\'-0"'],
  [48, '1/4" = 1\'-0"'],
];

export const PAPER_SIZES = [
  ['letter', 'Letter (8.5 × 11)'],
  ['ledger', 'Ledger (11 × 17)'],
  ['archD', 'Arch D (24 × 36)'],
];

/** The PDF paper setting; missing or unknown values use Arch D. */
export function paperSize(settings) {
  return PAPER_SIZES.some(([value]) => value === settings?.paperSize)
    ? settings.paperSize
    : DEFAULT_PREFS.paperSize;
}

/** The drawing scale (SPEC-43): settings.plotScale, else 24 (1/2" = 1'-0"). */
export function plotScale(settings) {
  return settings?.plotScale ?? DEFAULT_PREFS.plotScale;
}
