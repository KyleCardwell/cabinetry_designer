import { useLayoutEffect } from 'react';

const EDGE_MARGIN = 4;

function placeOnAxis(anchor, size, room, gap) {
  const after = anchor + gap;
  if (after + size <= room - EDGE_MARGIN) return after;
  const before = anchor - gap - size;
  if (before >= EDGE_MARGIN) return before;
  return Math.max(EDGE_MARGIN, Math.min(after, room - EDGE_MARGIN - size));
}

/**
 * Where a canvas pop-up goes so it stays inside its canvas: `gap` px below and right of the click, flipped to the
 * left / above when it would run past the right / bottom edge, else pushed in as far as it fits.
 */
export function menuPosition(anchor, menu, container, gap = 0) {
  return {
    left: placeOnAxis(anchor.x, menu.width, container.width, gap),
    top: placeOnAxis(anchor.y, menu.height, container.height, gap),
  };
}

/**
 * Keeps an absolutely positioned pop-up (`menuRef`) inside its offset parent (the canvas container), before paint.
 * The element's own `style` still carries the plain below-right position; this corrects it after each render.
 */
export function useMenuInCanvas(menuRef, anchor, gap = 0) {
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const container = menu?.offsetParent;
    if (!anchor || !menu || !container) return;
    const { left, top } = menuPosition(
      anchor,
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: container.clientWidth, height: container.clientHeight },
      gap,
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  });
}
