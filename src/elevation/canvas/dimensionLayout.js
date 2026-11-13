import { formatDimension } from '../model/units.js';

const POPOUT_GAP = 4;
const MIN_LINE = 4;

/** Return the row offsets for an elevation dimension chain. */
export function dimensionRowOffsets(orientation, innerLevels = 0, hasMiddle = false, factor = 1) {
  if (orientation === 'vertical') {
    const inner = 24 * factor;
    const outer = (24 + 26 + innerLevels * 16) * factor;
    return hasMiddle
      ? { inner, middle: outer, outer: outer + 26 * factor }
      : { inner, outer };
  }
  return { inner: 20 * factor, outer: (20 + 22 + innerLevels * 14) * factor };
}

/**
 * Offsets for the below-wall row stack, wall-first: casing clearances, piece
 * widths, overall wall length, opening widths, then the elevation label.
 */
export function belowRowOffsets({
  clearances: clearanceLevels = 0,
  pieces: pieceLevels = 0,
  overall: overallLevels = 0,
  openings: openingLevels = 0,
  clearanceRow = true,
} = {}, factor = 1) {
  const clearances = 20 * factor;
  const pieces = clearanceRow ? clearances + (22 + clearanceLevels * 14) * factor : clearances;
  const overall = pieces + (22 + pieceLevels * 14) * factor;
  const openings = overall + (22 + overallLevels * 14) * factor;
  const label = openings + (22 + openingLevels * 14) * factor;
  return { clearances, pieces, overall, openings, label };
}

function overlaps(candidate, placed) {
  return candidate.left < placed.right + POPOUT_GAP
    && candidate.right + POPOUT_GAP > placed.left;
}

/** Lay out dimension labels along a row without allowing pop-outs to collide. */
export function layoutDimensionRow(segments, {
  scale,
  fontSize = 11,
  charWidth = 0.6 * fontSize,
  padding = 4,
  maxLevels = 2,
}) {
  const labels = segments.map((segment, index) => {
    const length = segment.end - segment.start;
    const text = segment.violated && Number.isFinite(segment.required)
      ? `${formatDimension(length)} (${formatDimension(segment.required)})`
      : formatDimension(length);
    const width = text.length * charWidth + 2 * padding;
    const center = ((segment.start + segment.end) / 2) * scale;
    const lengthPx = (segment.end - segment.start) * scale;
    return {
      index,
      text,
      mode: width + 2 * MIN_LINE <= lengthPx ? 'inline' : 'popout',
      level: 0,
      center,
      width,
    };
  });
  const occupied = Array.from({ length: maxLevels }, () => []);
  let levels = 0;

  labels
    .filter((label) => label.mode === 'popout')
    .sort((a, b) => a.center - b.center || a.index - b.index)
    .forEach((label) => {
      const candidate = {
        left: label.center - label.width / 2,
        right: label.center + label.width / 2,
      };
      const levelIndex = occupied.findIndex((row) => (
        row.every((placed) => !overlaps(candidate, placed))
      ));
      if (levelIndex === -1) {
        label.mode = 'hidden';
        return;
      }
      label.level = levelIndex + 1;
      occupied[levelIndex].push(candidate);
      levels = Math.max(levels, label.level);
    });

  return { labels, levels };
}
