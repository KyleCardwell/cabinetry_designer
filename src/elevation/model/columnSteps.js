import { runItems } from './grid.js';
import { resolveTopSegments } from './topSegments.js';

/** Effective vertical offsets for root cabinet and nested-grid columns. */
export function columnSteps(run) {
  const steps = new Map();
  const segmentTops = new Map(resolveTopSegments(run).segments
    .filter(({ mode }) => mode === 'box')
    .flatMap(({ id: segmentId, drop, columnIds }) => columnIds.map((id) => (
      [id, { value: drop, source: 'segment', segmentId }]
    ))));
  for (const item of runItems(run)) {
    if (item.kind !== 'cabinet') continue;
    const offsets = {};
    for (const edge of ['top', 'bottom']) {
      const offset = item[edge];
      if (offset?.source === 'manual' && Number.isFinite(offset.value) && offset.value > 0) {
        offsets[edge] = offset;
      }
    }
    if (segmentTops.has(item.id)) offsets.top = segmentTops.get(item.id);
    if (Object.keys(offsets).length) steps.set(item.id, offsets);
  }
  return steps;
}
