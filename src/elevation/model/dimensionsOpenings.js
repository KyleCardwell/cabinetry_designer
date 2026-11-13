import { SEGMENT_EPSILON, appendSegment, faceHasRuns } from './dimensionsShared.js';
import { wallLength } from './geometry.js';
import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { recessGeometry, recessesOn, uncoveredSpans } from './recesses.js';

/**
 * The elevation's wall row (SPEC-37.4, SPEC-38): every door and window by its own reference edges (jamb or
 * casing, per its measure mode), every wing wall landing on this face at its thickness, and every recess on
 * this face at its width, split around the openings inside it, with the gaps between them and to the wall's
 * ends. [] when there's nothing, and on a face with runs: the casing clearances and the plan locate the
 * openings there, and the run row locates the runs (DM3 §1.3, §1.6).
 */
export function openingChain(room, wall, settings) {
  if (faceHasRuns(wall)) return [];
  const length = wallLength(wall);
  const openings = (wall.openings ?? []).map((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    const reference = opening.measureMode === 'casing' && geometry.casing
      ? geometry.casing
      : geometry.jamb;
    const start = geometry.offsets.left[opening.measureMode].edge;
    return {
      start,
      end: start + reference.width,
      metadata: { kind: 'opening', openingId: opening.id, label: opening.label },
    };
  });
  const recesses = recessesOn(wall).flatMap((recess) => {
    const { x, width } = recessGeometry(recess, length, wall.height);
    const inside = openings.filter((range) => (
      range.start >= x - SEGMENT_EPSILON && range.end <= x + width + SEGMENT_EPSILON
    ));
    return uncoveredSpans(x, x + width, inside).map((span) => ({
      ...span,
      metadata: { kind: 'recess', recessId: recess.id, label: recess.label },
    }));
  });
  const ranges = [
    ...openings,
    ...recesses,
    ...landingsOn(room, wall).map(({ a, b, wallId }) => ({
      start: a,
      end: b,
      metadata: { kind: 'wall', wallId },
    })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  if (ranges.length === 0) return [];

  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.min(length, Math.max(cursor, range.start));
    const end = Math.min(length, Math.max(start, range.end));
    appendSegment(segments, cursor, start, 'gap');
    segments.push({ start, end, ...range.metadata });
    cursor = end;
  }
  appendSegment(segments, cursor, length, 'gap');
  return segments;
}

/** Build the vertical opening stack and full-wall dimension chains. */
export function verticalOpeningChain(wall, opening, wallLengthValue, settings) {
  const geometry = openingGeometry(opening, wallLengthValue, settings);
  const casing = geometry.casing ?? geometry.jamb;
  const casingTop = casing.z + casing.height;
  const inner = [];

  if (opening.kind === 'window') {
    appendSegment(inner, 0, casing.z, 'sill-below');
    appendSegment(inner, casing.z, geometry.jamb.z, 'casing');
  }
  appendSegment(inner, geometry.jamb.z, geometry.head, 'opening');
  appendSegment(inner, geometry.head, casingTop, 'casing');
  appendSegment(inner, casingTop, wall.height, 'above');

  return {
    inner,
    middle: [],
    outer: wall.height > SEGMENT_EPSILON
      ? [{ start: 0, end: wall.height, kind: 'wall' }]
      : [],
  };
}
