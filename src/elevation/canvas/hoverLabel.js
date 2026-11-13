import { useSyncExternalStore } from 'react';
import { formatDimension } from '../model/units.js';

// EC2: the hovered piece's size label lives in one top layer (above faces, part numbers and dimensions),
// so pieces only report what is hovered and the elevation canvas draws it last.
let current = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** `label`: { id, rect: screen rect, lines: string[], fontSize }. */
export function showHoverLabel(label) {
  current = label;
  notify();
}

/** Clears the label (only when it still belongs to `id`, if given). */
export function hideHoverLabel(id) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  notify();
}

export function currentHoverLabel() {
  return current;
}

export function useHoverLabel() {
  return useSyncExternalStore(subscribe, currentHoverLabel, () => null);
}

/** Box size for the hover label: `W × H`, with any run-flex width change after the width. */
export function pieceSizeText(piece) {
  const width = Number.isFinite(piece.absorbed)
    ? `${formatDimension(piece.width)} (${piece.absorbed >= 0 ? '+' : ''}${formatDimension(piece.absorbed)})`
    : formatDimension(piece.width);
  return `${width} × ${formatDimension(piece.height)}`;
}
