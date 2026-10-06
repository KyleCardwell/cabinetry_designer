import { horizontalChains, openingChain } from './dimensions.js';
import { plotScale } from './drawingScale.js';
import { resolveWall } from './room.js';
import { formatInches } from './units.js';
import { wallExtent } from './wallExtent.js';

/** Paper inches from the drawing to its first dimension row, and between rows (SPEC-43). */
export const DIMENSION_ROW_SPACING = 0.375;

const EPSILON = 1e-6;

/** The rows the DXF dimensions, nearest the drawing first on each side (the canvas's order, SPEC-43). */
const ROWS = [
  ['lower.inner', 'below'],
  ['lower.outer', 'below'],
  ['openings', 'below'],
  ['upper.inner', 'above'],
  ['upper.outer', 'above'],
];

/**
 * One wall face's horizontal dimensions as geometry draws them (SPEC-43): the canvas's chains (run
 * pieces and run overall below and above, the wall row of openings below), one record per segment.
 * Rows start 3/8" (paper) past everything drawn and stack 3/8" apart; an empty row takes no space.
 * `base` is where the extension lines start (the drawing's bottom or top), `at` the dimension line.
 */
export function elevationDimensions(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const lower = horizontalChains(room, view, 'lower', settings);
  const upper = horizontalChains(room, view, 'upper', settings);
  const chains = {
    'lower.inner': lower.inner,
    'lower.outer': lower.outer,
    openings: openingChain(room, view, settings),
    'upper.inner': upper.inner,
    'upper.outer': upper.outer,
  };
  const extent = wallExtent(room, view, settings);
  const step = DIMENSION_ROW_SPACING * plotScale(settings);
  const levels = { below: 0, above: 0 };
  const dimensions = [];
  for (const [row, where] of ROWS) {
    const segments = chains[row].filter((segment) => segment.end - segment.start > EPSILON);
    if (segments.length === 0) continue;
    levels[where] += 1;
    const base = where === 'below' ? extent.bottom : extent.top;
    const at = where === 'below' ? base - levels[where] * step : base + levels[where] * step;
    for (const segment of segments) {
      dimensions.push({
        row,
        kind: segment.kind,
        start: segment.start,
        end: segment.end,
        base,
        at,
        text: formatInches(segment.end - segment.start),
      });
    }
  }
  return dimensions;
}
