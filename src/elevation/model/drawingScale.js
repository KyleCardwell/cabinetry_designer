import { DEFAULT_SETTINGS } from './constants.js';

/** The DXF's drawing scales (SPEC-43), as [plotScale, label]: plotScale is drawing inches per paper inch. */
export const PLOT_SCALES = [
  [12, '1" = 1\'-0"'],
  [16, '3/4" = 1\'-0"'],
  [24, '1/2" = 1\'-0"'],
  [32, '3/8" = 1\'-0"'],
  [48, '1/4" = 1\'-0"'],
];

/** The drawing scale (SPEC-43): settings.plotScale, else 24 (1/2" = 1'-0"). */
export function plotScale(settings) {
  return settings?.plotScale ?? DEFAULT_SETTINGS.plotScale;
}
