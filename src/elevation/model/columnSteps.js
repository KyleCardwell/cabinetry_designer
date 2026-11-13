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

/** Internal step sides between neighbouring root boxes, using only offsets accepted by the solver. */
export function runStepSides(run, layout) {
  const boxes = new Map(layout.pieces.filter(({ kind, role }) => kind === 'cabinet' && role === 'item')
    .map((piece) => [piece.id, piece]));
  const columns = runItems(run).map(({ id }) => boxes.get(id));
  const sides = [];
  for (let index = 1; index < columns.length; index += 1) {
    const left = columns[index - 1];
    const right = columns[index];
    if (!left || !right) continue;
    for (const edge of ['top', 'bottom']) {
      const a = left.z + (edge === 'top' ? left.height : 0);
      const b = right.z + (edge === 'top' ? right.height : 0);
      if (Math.abs(a - b) <= 1e-6) continue;
      // Point into the shorter box's side of the boundary, including a raised bottom.
      const direction = (edge === 'top' ? a > b : a < b) ? 1 : -1;
      sides.push({ x: direction === 1 ? left.x + left.width : right.x,
        edge, start: Math.min(a, b), end: Math.max(a, b), direction });
    }
  }
  return sides;
}
