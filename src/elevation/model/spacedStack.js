const EPSILON = 1e-9;

/** Stack item bottoms at absolute heights, sharing every unpicked gap equally. */
export function spacedStack({ floor, ceiling, heights, bottom = null, top = null }) {
  if (heights.length === 0) return { positions: [], gap: null, warnings: [] };
  const warnings = [];
  const equalGaps = heights.length - 1 + (bottom === null ? 1 : 0) + (top === null ? 1 : 0);
  const gap = equalGaps > 0
    ? ((top ?? ceiling) - (bottom ?? floor) - heights.reduce((sum, height) => sum + height, 0)) / equalGaps
    : null;
  if (equalGaps === 0) warnings.push({ code: 'stack-top-ignored' });
  if (gap !== null && gap < 0) warnings.push({ code: 'stack-doesnt-fit' });
  let cursor = bottom ?? floor + gap;
  const positions = heights.map((height) => {
    const position = cursor;
    cursor += height + (gap ?? 0);
    return position;
  });
  return { positions, gap, warnings };
}

/** Most items meeting the minimum clear gap; keep min even when none fit. */
export function autoStackCount({ floor, ceiling, height, bottom = null, top = null, minClear, min, max }) {
  for (let count = max; count >= min; count -= 1) {
    if (count === 1 && bottom !== null && top !== null) {
      if (bottom + height <= ceiling + EPSILON) return count;
    } else {
      const { gap } = spacedStack({ floor, ceiling, heights: Array(count).fill(height), bottom, top });
      if (gap !== null && gap + EPSILON >= minClear) return count;
    }
  }
  return min;
}
