import {
  centerlineMarkers, clearanceCallouts, horizontalChains, openingChain, pickColumnRuns, verticalChains,
} from './dimensions.js';
import { plotScale } from './drawingScale.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
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

/** Paper inches inside a cell grid's left or bottom edge for its chain (SPEC-43.3). */
const CELL_CHAIN_INSET = 0.25;

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
 * Where each label in a row or column goes (SPEC-43.1, 43.2), along and across the line in drawing
 * inches. A label that fits between its ticks (its estimated width plus a gap each side) stays on the
 * line. One that doesn't moves outward, centred
 * on its segment, into the first level where it clears every label already there; levels are a text
 * height plus a gap apart. When the on-line text is outward, level 1 sits past it; otherwise level 1
 * sits just past the line. By default the on-line text is outward above the wall, inward below it.
 */
function placeLabels(segments, at, outward, scale, textOutward = outward > 0) {
  const height = DIMENSION_TEXT_HEIGHT * scale;
  const gap = DIMENSION_TEXT_GAP * scale;
  const step = height + gap;
  const first = (textOutward ? step : 0) + gap + height / 2;
  const levels = [];
  const placed = segments.map((segment) => {
    const text = segment.text ?? formatInches(segment.end - segment.start);
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
    label.along = center;
    label.across = at + outward * (first + level * step);
  }
  return { placed, levels: levels.length, step };
}

/** Map labels along/across a dimension line to drawing coordinates in either orientation. */
function labelRecords(placed, row, base, at, vertical) {
  return placed.map(({ segment, text, along, across }) => ({
    row,
    ...(vertical ? { orientation: 'vertical' } : {}),
    kind: segment.kind,
    start: segment.start,
    end: segment.end,
    base,
    at,
    text,
    ...(along === undefined ? {} : {
      textX: vertical ? across : along,
      textZ: vertical ? along : across,
    }),
  }));
}

/**
 * One wall face's horizontal rows (SPEC-43), then vertical columns at both edges (SPEC-43.2): the
 * canvas's chains, one record per segment. Vertical records have `orientation: 'vertical'`; each
 * edge's columns are inner, middle, outer, bottom to top. Inner or middle columns repeating the
 * outer column's single wall-height segment are skipped.
 * Rows and columns start 3/8" (paper) past everything drawn and stack 3/8" apart, plus room for any
 * labels moved off the line (SPEC-43.1); an empty chain takes no space. `base` is where the extension
 * lines start (the drawing's bottom/top or left/right edge), `at` the dimension line, `textX`/`textZ`
 * a moved label's middle in drawing coordinates.
 * Cell chains sit 1/4" (paper) inside the column's left or bottom edge, with no extension lines (SPEC-43.3).
 * Then casing clearances to a run and pin callouts sit inside the wall at their own height (SPEC-43.3).
 * A pin's extension lines start at its datum's and its cabinet's own points.
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
    for (const { segment, text, along, across } of placed) {
      dimensions.push({
        row,
        kind: segment.kind,
        start: segment.start,
        end: segment.end,
        base,
        at,
        text,
        ...(along === undefined ? {} : { textX: along, textZ: across }),
      });
    }
    next[where] = at + outward * (spacing + levels * step);
  }
  for (const edge of ['left', 'right']) {
    const columns = verticalChains(room, view, pickColumnRuns(view, null, edge), settings, edge);
    const base = extent[edge];
    const outward = edge === 'left' ? -1 : 1;
    let at = base + outward * spacing;
    for (const column of ['inner', 'middle', 'outer']) {
      const chain = columns[column];
      if (column !== 'outer' && chain.length === 1 && columns.outer.length === 1
        && Math.abs(chain[0].start - columns.outer[0].start) <= EPSILON
        && Math.abs(chain[0].end - columns.outer[0].end) <= EPSILON) continue;
      const segments = chain.filter((segment) => segment.end - segment.start > EPSILON);
      if (segments.length === 0) continue;
      const { placed, levels, step } = placeLabels(segments, at, outward, scale, edge === 'left');
      dimensions.push(...labelRecords(placed, `${edge}.${column}`, base, at, true));
      at += outward * (spacing + levels * step);
    }
  }
  const scenes = view.runs.map((run) => ({ run, scene: runScene(room, view, run, settings) }));
  for (const { scene } of scenes) {
    const { cells } = scene;
    for (const grid of cells.grids) {
      const vertical = grid.axis === 'row';
      const segments = grid.tracks
        .filter((track) => track.end - track.start > EPSILON)
        .sort((a, b) => a.start - b.start)
        .map(({ start, end }) => ({ kind: 'cell', start, end }));
      const at = (vertical ? grid.x : grid.z) + CELL_CHAIN_INSET * scale;
      const { placed } = placeLabels(segments, at, +1, scale, !vertical);
      dimensions.push(...labelRecords(placed, 'cells', at, at, vertical));
    }
  }
  for (const { start, end, targetRunId, z } of clearanceCallouts(room, view, settings)) {
    if (targetRunId === null || end - start <= EPSILON) continue;
    const segment = { kind: 'clearance', start, end };
    const { placed } = placeLabels([segment], z, +1, scale);
    dimensions.push(...labelRecords(placed, 'clearances', z, z, false));
  }
  for (const { run, scene } of scenes) {
    for (const marker of centerlineMarkers(run, scene.result.pieces, view, view.length, settings)) {
      const { x, datumX, z, value, pieceBottom, pieceTop, anchor, datumZ } = marker;
      if (value <= EPSILON) continue;
      const datumBase = datumZ ?? z;
      const cabinetBase = Math.max(pieceBottom, Math.min(pieceTop, z));
      const segment = {
        kind: 'pin',
        start: Math.min(x, datumX),
        end: Math.max(x, datumX),
        text: anchor === 'center' ? `CL ${formatInches(value)}` : formatInches(value),
      };
      const { placed } = placeLabels([segment], z, +1, scale);
      const [record] = labelRecords(placed, 'pins', z, z, false);
      dimensions.push({
        ...record,
        startBase: x <= datumX ? cabinetBase : datumBase,
        endBase: x <= datumX ? datumBase : cabinetBase,
      });
    }
  }
  return dimensions;
}
