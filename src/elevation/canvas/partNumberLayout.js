export const PART_BADGE_FONT_SIZE = 15;
export const PART_BADGE_HEIGHT = 20;
/** px above the piece's vertical centre where a badge rests, clear of the width text. */
export const PART_BADGE_LIFT = 20;
/** px between lift levels. */
export const PART_BADGE_STEP = 23;

export function partBadgeWidth(text, { charWidth = 9, padding = 7, minWidth = 22 } = {}) {
  return Math.max(minWidth, text.length * charWidth + 2 * padding);
}

/** How many lift levels fit above the resting badge inside a box this tall on screen. */
export function partBadgeLevels(runHeightPx) {
  return Math.max(0, Math.min(3, Math.floor(
    (runHeightPx / 2 - PART_BADGE_LIFT - PART_BADGE_HEIGHT / 2 - 2) / PART_BADGE_STEP,
  )));
}

/**
 * Lay out one run's badges in screen space.
 * entries: [{ key, text, left, right }] in left-to-right order.
 */
export function layoutPartBadges(entries, { maxLevels = 3, gap = 3 } = {}) {
  const occupied = Array.from({ length: Math.max(0, maxLevels) }, () => -Infinity);
  return entries.map((entry) => {
    const width = partBadgeWidth(entry.text);
    const center = (entry.left + entry.right) / 2;
    const fits = width <= (entry.right - entry.left) - 2;
    if (fits || occupied.length === 0) {
      return { ...entry, width, center, level: 0, lifted: !fits };
    }
    const span = { left: center - width / 2, right: center + width / 2 };
    let index = occupied.findIndex((right) => span.left >= right + gap);
    if (index === -1) index = 0;
    occupied[index] = span.right;
    return { ...entry, width, center, level: index + 1, lifted: true };
  });
}
