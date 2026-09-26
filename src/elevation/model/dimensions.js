import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { runBottomParts } from './bottoms.js';
import { cornerAt } from './corners.js';
import { wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { landingsOn } from './landings.js';
import { neighborProfiles } from './neighborProfiles.js';
import { openingGeometry } from './openings.js';
import { verticalStart } from './overlap.js';
import { resolveProfile } from './profile.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
  resolvePinTarget,
} from './room.js';
import { splitRun } from './splitRun.js';
import { stackOf } from './stacks.js';
import { isCountertop, runTop } from './tops.js';

const SEGMENT_EPSILON = 1e-6;

function appendSegment(segments, start, end, kind, metadata = {}) {
  if (end - start <= SEGMENT_EPSILON) return;
  segments.push({ start, end, kind, ...metadata });
}

function appendOpenGap(segments, start, end, tallRanges) {
  if (end - start <= SEGMENT_EPSILON) return;
  if (tallRanges.length === 0) {
    appendSegment(segments, start, end, 'open');
    return;
  }

  let cursor = start;
  for (const range of tallRanges) {
    const overlapStart = Math.max(cursor, start, range.start);
    const overlapEnd = Math.min(end, range.end);
    if (overlapEnd - overlapStart <= SEGMENT_EPSILON) continue;
    appendSegment(segments, cursor, overlapStart, 'open');
    appendSegment(
      segments,
      overlapStart,
      overlapEnd,
      range.kind,
      range.kind === 'wall' ? { wallId: range.wallId } : { runId: range.runId },
    );
    cursor = overlapEnd;
  }
  appendSegment(segments, cursor, end, 'open');
}

function appendGap(segments, start, end, kind, tallRanges) {
  if (kind === 'corner-gap') {
    appendSegment(segments, start, end, kind);
  } else {
    appendOpenGap(segments, start, end, tallRanges);
  }
}

function runsForBand(wall, band) {
  const matches = band === 'lower'
    ? (run) => (
      run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    )
    : (run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  return wall.runs.filter(matches).sort((a, b) => a.x - b.x);
}

function neighborSegments(room, wall, band, settings) {
  const inBand = band === 'lower'
    ? (id) => id === CABINET_TYPE_IDS.BASE || id === CABINET_TYPE_IDS.TALL
    : (id) => id === CABINET_TYPE_IDS.UPPER;
  return neighborProfiles(room, wall, settings)
    .filter((profile) => inBand(profile.cabinetTypeId))
    .map((profile) => ({
      start: profile.x,
      end: profile.x + profile.width,
      kind: 'neighbor',
      wallId: profile.wallId,
      neighborRunId: profile.runId,
    }));
}

/** Build a full-wall horizontal chain using each opening's stored reference edges. */
export function openingChain(room, wall, settings) {
  void room;
  if ((wall.openings ?? []).length === 0) return [];
  const length = wallLength(wall);
  const ranges = wall.openings.map((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    const reference = opening.measureMode === 'casing' && geometry.casing
      ? geometry.casing
      : geometry.jamb;
    const start = geometry.offsets.left[opening.measureMode].edge;
    return {
      start,
      end: start + reference.width,
      openingId: opening.id,
      label: opening.label,
    };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.min(length, Math.max(cursor, range.start));
    const end = Math.min(length, Math.max(start, range.end));
    appendSegment(segments, cursor, start, 'gap');
    segments.push({
      start,
      end,
      kind: 'opening',
      openingId: range.openingId,
      label: range.label,
    });
    cursor = end;
  }
  appendSegment(segments, cursor, length, 'gap');
  return segments;
}

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

/** Build the inner piece chain and outer run chain for an elevation band. */
export function horizontalChains(room, wall, band, settings) {
  const runs = runsForBand(wall, band);
  const neighbors = neighborSegments(room, wall, band, settings);
  const outermost = (segments, side, limit) => {
    const reaching = side === 'left'
      ? segments.filter((segment) => segment.start < limit - SEGMENT_EPSILON)
      : segments.filter((segment) => segment.end > limit + SEGMENT_EPSILON);
    if (reaching.length === 0) return null;
    const furthest = side === 'left'
      ? reaching.reduce((a, b) => (b.start < a.start ? b : a))
      : reaching.reduce((a, b) => (b.end > a.end ? b : a));
    return side === 'left'
      ? { ...furthest, end: limit }
      : { ...furthest, start: limit };
  };
  if (runs.length === 0) {
    const length = wallLength(wall);
    const left = outermost(neighbors, 'left', 0);
    const right = outermost(neighbors, 'right', length);
    const wallRow = length > SEGMENT_EPSILON ? [{ start: 0, end: length, kind: 'wall' }] : [];
    return {
      inner: [left, right].filter(Boolean),
      outer: [left, ...wallRow, right].filter(Boolean),
    };
  }

  const length = wallLength(wall);
  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];
  const rangeStart = Math.min(0, firstRun.x);
  const rangeEnd = Math.max(length, lastRun.x + lastRun.width);
  const left = outermost(neighbors, 'left', rangeStart);
  const right = outermost(neighbors, 'right', rangeEnd);
  const leftCornerGap = Boolean(
    firstRun.anchors?.left === true
    && cornerAt(room, wall, 'left').type === 'inside',
  );
  const rightCornerGap = Boolean(
    lastRun.anchors?.right === true
    && cornerAt(room, wall, 'right').type === 'inside',
  );
  const tallRanges = [
    ...(band === 'upper'
      ? wall.runs
      .filter((run) => run.cabinetTypeId === CABINET_TYPE_IDS.TALL)
      .map((run) => ({
        start: run.x,
        end: run.x + run.width,
        runId: run.id,
        kind: 'tall-span',
      }))
      : []),
    ...landingsOn(room, wall).map(({ a, b, wallId }) => ({
      start: a,
      end: b,
      wallId,
      kind: 'wall',
    })),
  ].sort((a, b) => a.start - b.start);

  const inner = [];
  if (left) inner.push(left);
  let cursor = rangeStart;
  runs.forEach((run, index) => {
    appendGap(
      inner,
      cursor,
      run.x,
      index === 0 && leftCornerGap ? 'corner-gap' : 'open',
      tallRanges,
    );
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, length, settings),
    });
    for (const piece of layout.pieces) {
      appendSegment(inner, piece.x, piece.x + piece.width, 'piece', {
        runId: run.id,
        pieceId: piece.id,
        ...(runItems(run).find((item) => item.id === piece.id)?.pin
          ? { pinned: true }
          : {}),
      });
    }
    cursor = run.x + run.width;
  });
  appendGap(
    inner,
    cursor,
    rangeEnd,
    rightCornerGap ? 'corner-gap' : 'open',
    tallRanges,
  );
  if (right) inner.push(right);

  const outer = [];
  if (left) outer.push(left);
  cursor = rangeStart;
  runs.forEach((run, index) => {
    const start = index === 0 && leftCornerGap ? 0 : run.x;
    const end = index === runs.length - 1 && rightCornerGap
      ? length
      : run.x + run.width;
    appendOpenGap(outer, cursor, start, tallRanges);
    appendSegment(outer, start, end, 'run', { runId: run.id });
    cursor = end;
  });
  appendOpenGap(outer, cursor, rangeEnd, tallRanges);
  if (right) outer.push(right);

  return { inner, outer };
}

function rangesOverlap(a, b) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
    > SEGMENT_EPSILON;
}

function leftmost(runs) {
  return runs.reduce((result, run) => (
    !result || run.x < result.x ? run : result
  ), null);
}

function rightmost(runs) {
  return runs.reduce((result, run) => (
    !result || run.x + run.width > result.x + result.width ? run : result
  ), null);
}

export function nearerEdge(center, wallLengthValue) {
  return center * 2 <= wallLengthValue ? 'left' : 'right';
}

/** Height above the floor where centerline callouts are drawn. */
export const CENTERLINE_CALLOUT_Z = 40;

/**
 * Describe the centerline dimension for every center-pinned item in a run:
 * the datum it is measured from, the piece centerline, and the measured distance.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = runItems(run).find((candidate) => candidate.id === piece.id);
    if (item?.pin?.anchor !== 'center') return [];
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    if (!Number.isFinite(target)) return [];
    const datumX = item.pin.from === 'right'
      ? target + item.pin.value
      : target - item.pin.value;
    const x = piece.x + piece.width / 2;
    return [{
      pieceId: piece.id,
      x,
      datumX,
      z: CENTERLINE_CALLOUT_Z,
      value: Math.abs(x - datumX),
      pieceBottom: piece.z,
      pieceTop: piece.z + piece.height,
      from: item.pin.from,
    }];
  });
}

/** Choose the lower and upper runs represented by the vertical dimension column. */
function pickColumnPair(wall, selectedRunId, edge = 'left') {
  const lowerRuns = wall.runs.filter((run) => (
    run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
  ));
  const upperRuns = wall.runs.filter(
    (run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER,
  );
  const selected = wall.runs.find((run) => run.id === selectedRunId);
  const selectedOnEdge = selected
    && nearerEdge(selected.x + selected.width / 2, wallLength(wall)) === edge;

  if (selectedOnEdge && selected.cabinetTypeId === CABINET_TYPE_IDS.TALL) {
    return { lowerRun: selected, upperRun: null };
  }
  if (selectedOnEdge && selected.cabinetTypeId === CABINET_TYPE_IDS.BASE) {
    return {
      lowerRun: selected,
      upperRun: upperRuns.find((run) => rangesOverlap(selected, run)) ?? null,
    };
  }
  if (selectedOnEdge && selected.cabinetTypeId === CABINET_TYPE_IDS.UPPER) {
    return {
      lowerRun: lowerRuns.find((run) => rangesOverlap(selected, run)) ?? null,
      upperRun: selected,
    };
  }

  const edgeRun = edge === 'right' ? rightmost : leftmost;
  return {
    lowerRun: edgeRun(lowerRuns),
    upperRun: edgeRun(upperRuns),
  };
}

/** Choose the runs the vertical dimension column measures; a joined stack comes back as `stack`. */
export function pickColumnRuns(wall, selectedRunId, edge = 'left') {
  const column = pickColumnPair(wall, selectedRunId, edge);
  const seed = [column.lowerRun, column.upperRun].find((run) => run?.id === selectedRunId)
    ?? column.lowerRun
    ?? column.upperRun;
  const stack = seed ? stackOf(wall, seed.id) : [];
  return stack.length > 1 ? { ...column, stack } : column;
}

/** One chain up a joined stack, bottom to top: each run's parts below, box and top, with the gaps. */
export function stackChain(room, wall, runs, settings) {
  const profile = resolveProfile(settings, room, wall);
  const inner = [];
  let cursor = 0;
  const append = (end, kind) => {
    if (end - cursor <= SEGMENT_EPSILON) return;
    appendSegment(inner, cursor, end, kind);
    cursor = end;
  };
  [...runs].sort((a, b) => a.z - b.z).forEach((run, index) => {
    const parts = runBottomParts(run);
    const lower = run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL;
    append(parts.length > 0 ? parts.at(-1).z : run.z, index === 0 && lower ? 'toe-kick' : 'open');
    for (const part of [...parts].reverse()) append(part.z + part.height, 'bottom');
    append(run.z + run.height, 'box');
    const top = runTop(wall, run, profile);
    append(run.z + run.height + top.height, isCountertop(top.kind) ? 'countertop' : 'molding');
  });
  append(wall.height, 'open');
  return {
    inner,
    outer: wall.height > SEGMENT_EPSILON ? [{ start: 0, end: wall.height, kind: 'wall' }] : [],
  };
}

/** Build the vertical cabinet stack and full-wall dimension chains. */
export function verticalChains(room, wall, { lowerRun, upperRun, stack = null }, settings) {
  if (stack && stack.length > 1) return stackChain(room, wall, stack, settings);
  const inner = [];
  const outer = wall.height > SEGMENT_EPSILON
    ? [{ start: 0, end: wall.height, kind: 'wall' }]
    : [];
  const wallProfile = resolveProfile(settings, room, wall);
  let cursor = 0;
  let highestBox = null;

  const append = (start, end, kind) => {
    const nextStart = Math.max(0, cursor, start);
    if (end - nextStart <= SEGMENT_EPSILON) return false;
    appendSegment(inner, nextStart, end, kind);
    cursor = end;
    return true;
  };
  const result = () => ({ inner, outer });
  const rememberBox = (run) => {
    const top = run.z + run.height;
    if (!highestBox || top >= highestBox.top - SEGMENT_EPSILON) {
      highestBox = { run, top };
    }
  };

  if (lowerRun) {
    append(0, lowerRun.z, 'toe-kick');
    if (append(lowerRun.z, lowerRun.z + lowerRun.height, 'box')) {
      rememberBox(lowerRun);
    }
    const lowerTop = runTop(wall, lowerRun, wallProfile);
    if (isCountertop(lowerTop.kind)) {
      append(
        lowerRun.z + lowerRun.height,
        lowerRun.z + lowerRun.height + lowerTop.height,
        'countertop',
      );
    }
  }

  if (upperRun) {
    const parts = runBottomParts(upperRun);
    append(
      cursor,
      parts.length > 0 ? parts.at(-1).z : upperRun.z,
      lowerRun?.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 'clearance' : 'open',
    );
    for (const part of [...parts].reverse()) append(part.z, part.z + part.height, 'bottom');
    if (append(upperRun.z, upperRun.z + upperRun.height, 'box')) {
      rememberBox(upperRun);
    }
  }

  if (highestBox) {
    const top = runTop(wall, highestBox.run, wallProfile);
    if (top.kind === 'crown' || top.kind === 'topMold') {
      append(highestBox.top, highestBox.top + top.height, 'molding');
    }
  }

  append(cursor, wall.height, 'open');
  return result();
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
    outer: wall.height > SEGMENT_EPSILON
      ? [{ start: 0, end: wall.height, kind: 'wall' }]
      : [],
  };
}
