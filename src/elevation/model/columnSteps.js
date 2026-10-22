import { runItems } from './grid.js';

/** Effective vertical offsets for root cabinet and nested-grid columns. */
export function columnSteps(run) {
  const steps = new Map();
  for (const item of runItems(run)) {
    if (item.kind !== 'cabinet') continue;
    const offsets = {};
    for (const edge of ['top', 'bottom']) {
      const offset = item[edge];
      if (offset?.source === 'manual' && Number.isFinite(offset.value) && offset.value > 0) {
        offsets[edge] = offset;
      }
    }
    if (Object.keys(offsets).length) steps.set(item.id, offsets);
  }
  return steps;
}
