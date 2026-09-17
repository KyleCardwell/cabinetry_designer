import { CABINET_TYPE_IDS } from './constants.js';
import { cornerAt } from './corners.js';
import { wallLength } from './geometry.js';
import { moldingStack, resolveProfile } from './profile.js';
import { endCornerAnglesForRun, endMinWidthsForRun } from './room.js';
import { splitRun } from './splitRun.js';

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
    appendSegment(segments, overlapStart, overlapEnd, 'tall-span', {
      runId: range.runId,
    });
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

/** Build the inner piece chain and outer run chain for an elevation band. */
export function horizontalChains(room, wall, band, settings) {
  const runs = runsForBand(wall, band);
  if (runs.length === 0) return { inner: [], outer: [] };

  const length = wallLength(wall);
  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];
  const rangeStart = Math.min(0, firstRun.x);
  const rangeEnd = Math.max(length, lastRun.x + lastRun.width);
  const leftCornerGap = Boolean(
    firstRun.anchors?.left
    && cornerAt(room, wall, 'left').type === 'inside',
  );
  const rightCornerGap = Boolean(
    lastRun.anchors?.right
    && cornerAt(room, wall, 'right').type === 'inside',
  );
  const tallRanges = band === 'upper'
    ? wall.runs
      .filter((run) => run.cabinetTypeId === CABINET_TYPE_IDS.TALL)
      .map((run) => ({ start: run.x, end: run.x + run.width, runId: run.id }))
      .sort((a, b) => a.start - b.start)
    : [];

  const inner = [];
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
    });
    for (const piece of layout.pieces) {
      appendSegment(inner, piece.x, piece.x + piece.width, 'piece', {
        runId: run.id,
        pieceId: piece.id,
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

  const outer = [];
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

/** Choose the lower and upper runs represented by the vertical dimension column. */
export function pickColumnRuns(wall, selectedRunId) {
  const lowerRuns = wall.runs.filter((run) => (
    run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
  ));
  const upperRuns = wall.runs.filter(
    (run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER,
  );
  const selected = wall.runs.find((run) => run.id === selectedRunId);

  if (selected?.cabinetTypeId === CABINET_TYPE_IDS.TALL) {
    return { lowerRun: selected, upperRun: null };
  }
  if (selected?.cabinetTypeId === CABINET_TYPE_IDS.BASE) {
    return {
      lowerRun: selected,
      upperRun: upperRuns.find((run) => rangesOverlap(selected, run)) ?? null,
    };
  }
  if (selected?.cabinetTypeId === CABINET_TYPE_IDS.UPPER) {
    return {
      lowerRun: lowerRuns.find((run) => rangesOverlap(selected, run)) ?? null,
      upperRun: selected,
    };
  }

  return {
    lowerRun: leftmost(lowerRuns),
    upperRun: leftmost(upperRuns),
  };
}

function profileForRun(profile, run) {
  return resolveProfile(
    { defaultProfile: profile },
    null,
    { profile: run?.overrides },
  );
}

/** Build the vertical cabinet stack and full-wall dimension chains. */
export function verticalChains(room, wall, { lowerRun, upperRun }, settings) {
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
    if (lowerRun.cabinetTypeId === CABINET_TYPE_IDS.BASE) {
      const countertopThickness = profileForRun(wallProfile, lowerRun)
        .countertopThickness;
      append(
        lowerRun.z + lowerRun.height,
        lowerRun.z + lowerRun.height + countertopThickness,
        'countertop',
      );
    }
  }

  if (upperRun) {
    append(
      cursor,
      upperRun.z,
      lowerRun?.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 'clearance' : 'open',
    );
    if (append(upperRun.z, upperRun.z + upperRun.height, 'box')) {
      rememberBox(upperRun);
    }
  }

  if (
    highestBox
    && highestBox.run.heightMode === 'auto'
    && (
      highestBox.run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
      || highestBox.run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    )
  ) {
    const stack = moldingStack(profileForRun(wallProfile, highestBox.run));
    append(highestBox.top, highestBox.top + stack, 'molding');
  }

  append(cursor, wall.height, 'open');
  return result();
}
