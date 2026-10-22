import { runItems } from './grid.js';
import { isCountertop, isStoneTop } from './tops.js';

/** Root columns between the selected ids, inclusive and in run order. */
export function topSegmentRange(run, segment) {
  const items = runItems(run);
  const from = items.findIndex(({ id }) => id === segment.from);
  const to = items.findIndex(({ id }) => id === segment.to);
  return from < 0 || to < 0 ? null : items.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Active segments in stored order; ignored segments keep their stored references. */
export function resolveTopSegments(run, topKind = isStoneTop(run) ? 'stone' : run.top) {
  const segments = [];
  const warnings = [];
  const covered = new Set();
  const warn = (code, segmentId, message) => warnings.push({ code, segmentId, message });
  for (const segment of run.topSegments ?? []) {
    if (!isCountertop(topKind)) {
      warn('top-segment-no-countertop', segment.id, 'This run has no countertop.');
      continue;
    }
    const range = topSegmentRange(run, segment);
    if (!range) {
      warn('top-segment-orphaned', segment.id, 'A selected cabinet is missing.');
      continue;
    }
    const columnIds = range.map(({ id }) => id);
    if (columnIds.some((id) => covered.has(id))) {
      warn('top-segment-overlap', segment.id, 'Overlaps another top segment.');
      continue;
    }
    columnIds.forEach((id) => covered.add(id));
    segments.push({ ...segment, columnIds });
  }
  return { segments, warnings };
}
