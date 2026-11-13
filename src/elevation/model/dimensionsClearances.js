import { DEFAULT_SETTINGS } from './constants.js';
import { SEGMENT_EPSILON } from './dimensionsShared.js';
import { wallLength } from './geometry.js';
import { openingGeometry } from './openings.js';
import { verticalStart } from './overlap.js';

/** Build casing-to-run (or casing-to-wall) clearance segments for every opening. */
export function openingClearances(room, wall, settings) {
  void room;
  const length = wallLength(wall);
  return (wall.openings ?? []).flatMap((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    const casing = geometry.casing ?? geometry.jamb;
    const casingRight = casing.x + casing.width;
    const compatible = wall.runs.filter((run) => (
      Math.min(run.z + run.height, geometry.jamb.z + geometry.jamb.height)
        - Math.max(verticalStart(run), geometry.jamb.z) > SEGMENT_EPSILON
    ));
    const leftRun = compatible
      .filter((run) => run.x + run.width <= casing.x + SEGMENT_EPSILON)
      .sort((a, b) => (b.x + b.width) - (a.x + a.width))[0] ?? null;
    const rightRun = compatible
      .filter((run) => run.x >= casingRight - SEGMENT_EPSILON)
      .sort((a, b) => a.x - b.x)[0] ?? null;
    const required = settings.casingClearance ?? DEFAULT_SETTINGS.casingClearance;
    const leftStart = leftRun ? leftRun.x + leftRun.width : 0;
    const rightEnd = rightRun ? rightRun.x : length;
    return [
      {
        openingId: opening.id,
        label: opening.label,
        side: 'left',
        start: leftStart,
        end: casing.x,
        targetRunId: leftRun?.id ?? null,
        required,
        violated: casing.x - leftStart < required - SEGMENT_EPSILON,
      },
      {
        openingId: opening.id,
        label: opening.label,
        side: 'right',
        start: casingRight,
        end: rightEnd,
        targetRunId: rightRun?.id ?? null,
        required,
        violated: rightEnd - casingRight < required - SEGMENT_EPSILON,
      },
    ];
  });
}

/**
 * The casing clearances as drawn inside the wall (SPEC-39.1): each openingClearances segment plus the
 * height `z` it sits at, the middle of where its run and the casing overlap vertically, or the
 * casing's middle when it runs to the wall end.
 */
export function clearanceCallouts(room, wall, settings) {
  const length = wallLength(wall);
  return openingClearances(room, wall, settings).map((segment) => {
    const opening = wall.openings.find((candidate) => candidate.id === segment.openingId);
    const geometry = openingGeometry(opening, length, settings);
    const casing = geometry.casing ?? geometry.jamb;
    const run = wall.runs.find((candidate) => candidate.id === segment.targetRunId) ?? null;
    const bottom = run ? Math.max(casing.z, verticalStart(run)) : casing.z;
    const top = run
      ? Math.min(casing.z + casing.height, run.z + run.height)
      : casing.z + casing.height;
    return { ...segment, z: (bottom + top) / 2 };
  });
}
