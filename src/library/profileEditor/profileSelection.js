import { moveProfilePoints } from '../../elevation/model/profileEditing.js';

export const selectedPointIds = (selection) => selection?.kind === 'point' ? [selection.id]
  : selection?.kind === 'points' ? selection.ids : [];

export function pointSelection(ids) {
  const unique = [...new Set(ids)];
  return unique.length > 1 ? { kind: 'points', ids: unique }
    : unique.length === 1 ? { kind: 'point', id: unique[0] } : null;
}

export function togglePointSelection(selection, id) {
  const ids = selectedPointIds(selection);
  return pointSelection(ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]);
}

export function pointSelectionKey(event, { profile, selection, grid, onSelect, onApply }) {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'a') {
    event.preventDefault();
    onSelect(pointSelection(Object.keys(profile?.geometry.points ?? {})));
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const ids = selectedPointIds(selection);
  const direction = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] }[key];
  if (direction && ids.length) {
    event.preventDefault();
    onApply(moveProfilePoints(profile, ids, direction.map((value) => value * (event.shiftKey ? 1 : grid))),
      'That move would make an arc impossible.');
    return true;
  }
  if (selection?.kind === 'points' && (key === 'delete' || key === 'backspace')) {
    event.preventDefault();
    return true;
  }
  return false;
}
