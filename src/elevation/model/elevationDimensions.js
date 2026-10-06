import { horizontalChains, openingChain } from './dimensions.js';
import { plotScale } from './drawingScale.js';
import { resolveWall } from './room.js';
import { formatInches } from './units.js';
import { wallExtent } from './wallExtent.js';

/** Paper inches from the drawing to its first dimension row, and between rows (SPEC-43). */
export const DIMENSION_ROW_SPACING = 0.375;

/**
 * Paper inches (SPEC-43.1): the dimension text height and the gap around it. Geometry's FF dimstyle
 * uses the same two numbers (dimtxt, dimgap).
 */
export const DIMENSION_TEXT_HEIGHT = 0.09375;
export const DIMENSION_TEXT_GAP = 0.0625;

/** Arial Narrow's widest-case average character width as a share of the text height (SPEC-43.1). */
const CHARACTER_WIDTH = 0.5;

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
 * Where each label in a row goes (SPEC-43.1), in drawing inches. A label that fits between its ticks
 * (its estimated width plus a gap each side) stays on the line. One that doesn't moves outward, centred
 * on its segment, into the first level where it clears every label already there; levels are a text
 * height plus a gap apart. Below the wall, level 1 sits just under the line (the on-line text is above
 * it); above the wall, level 1 sits past the on-line text.
 */
function placeLabels(segments, at, outward, scale) {
  const height = DIMENSION_TEXT_HEIGHT * scale;
  const gap = DIMENSION_TEXT_GAP * scale;
  const step = height + gap;
  const first = (outward > 0 ? step : 0) + gap + height / 2;
  const levels = [];
  const placed = segments.map((segment) => {
    const text = formatInches(segment.end - segment.start);
    const width = text.length * CHARACTER_WIDTH * height;
    return { segment, text, width, fits: width + 2 * gap <= segment.end - segment.start + EPSILON };
  });
  for (const label of placed) {
    if (label.fits) continue;
    const center = (label.segment.start + label.segment.end) / 2;
    const left = center - label.width / 2;
    const right = center + label.width / 2;
    let level = levels.findIndex((taken) => taken.every((other) => (
      right + gap <= other.left + EPSILON || left >= other.right + gap - EPSILON
    )));
    if (level === -1) {
      levels.push([]);
      level = levels.length - 1;
    }
    levels[level].push({ left, right });
    label.textX = center;
    label.textZ = at + outward * (first + level * step);
  }
  return { placed, levels: levels.length, step };
}

/**
 * One wall face's horizontal dimensions as geometry draws them (SPEC-43): the canvas's chains (run
 * pieces and run overall below and above, the wall row of openings below), one record per segment.
 * Rows start 3/8" (paper) past everything drawn and stack 3/8" apart, plus room for any labels moved
 * off the line (SPEC-43.1); an empty row takes no space. `base` is where the extension lines start (the
 * drawing's bottom or top), `at` the dimension line, `textX`/`textZ` a moved label's middle.
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
  const scale = plotScale(settings);
  const spacing = DIMENSION_ROW_SPACING * scale;
  const next = { below: extent.bottom - spacing, above: extent.top + spacing };
  const dimensions = [];
  for (const [row, where] of ROWS) {
    const segments = chains[row].filter((segment) => segment.end - segment.start > EPSILON);
    if (segments.length === 0) continue;
    const outward = where === 'below' ? -1 : 1;
    const base = where === 'below' ? extent.bottom : extent.top;
    const at = next[where];
    const { placed, levels, step } = placeLabels(segments, at, outward, scale);
    for (const { segment, text, textX, textZ } of placed) {
      dimensions.push({
        row,
        kind: segment.kind,
        start: segment.start,
        end: segment.end,
        base,
        at,
        text,
        ...(textX === undefined ? {} : { textX, textZ }),
      });
    }
    next[where] = at + outward * (spacing + levels * step);
  }
  return dimensions;
}
