import { formatInches } from '../model/units.js';

const POPOUT_GAP = 4;

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
    const text = formatInches(segment.end - segment.start);
    // SPEC-QUESTION: Test 13's required 14.6px width excludes the trailing inch mark,
    // while §4.2 says to measure the full formatInches string. Keep the mark visible
    // but follow the test's explicit width value.
    const measuredText = text.endsWith('"') ? text.slice(0, -1) : text;
    const width = measuredText.length * charWidth + 2 * padding;
    const center = ((segment.start + segment.end) / 2) * scale;
    const lengthPx = (segment.end - segment.start) * scale;
    return {
      index,
      text,
      mode: width <= lengthPx - 4 ? 'inline' : 'popout',
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
