export const SEGMENT_EPSILON = 1e-6;

export function appendSegment(segments, start, end, kind, metadata = {}) {
  if (end - start <= SEGMENT_EPSILON) return;
  segments.push({ start, end, kind, ...metadata });
}

/** A face with any run on it, in either band (DM3). */
export function faceHasRuns(wall) {
  return (wall.runs ?? []).length > 0;
}
