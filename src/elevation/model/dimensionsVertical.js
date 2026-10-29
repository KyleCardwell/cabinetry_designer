import { CABINET_TYPE_IDS } from './constants.js';
import { SEGMENT_EPSILON, appendSegment } from './dimensionsShared.js';
import { runBottomParts } from './bottoms.js';
import { cellPieces } from './cells.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { frameEdgeTracks, frameRegions, regionOpenings } from './frames.js';
import { wallLength } from './geometry.js';
import { resolveProfile } from './profile.js';
import { soffitsOn } from './soffits.js';
import { stackOf } from './stacks.js';
import { frameDrop } from './styles.js';
import { teeFillers } from './tees.js';
import { isCountertop, runMoldings, runTop } from './tops.js';

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

  // Only runs reaching into this edge's half of the wall (SPEC-36.3.3): a run at the far end is the
  // other chain's, so a bare end of the wall gets a chain of its own.
  const half = wallLength(wall) / 2;
  const onSide = (run) => (edge === 'right'
    ? run.x + run.width > half + SEGMENT_EPSILON
    : run.x < half - SEGMENT_EPSILON);
  const edgeRun = edge === 'right' ? rightmost : leftmost;
  return {
    lowerRun: edgeRun(lowerRuns.filter(onSide)),
    upperRun: edgeRun(upperRuns.filter(onSide)),
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

/**
 * A run's box on the vertical chain split around the horizontal T-fillers in the column at the
 * chain's edge (SPEC-37): box | T | box, bottom to top. The box alone when there are none.
 */
function teeBoxSegments(run, cells, tees, edge) {
  const boxes = cells.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item');
  const outermost = edge === 'right'
    ? Math.max(...boxes.map((piece) => piece.x + piece.width))
    : Math.min(...boxes.map((piece) => piece.x));
  const edgeIds = new Set(boxes
    .filter((piece) => Math.abs((edge === 'right' ? piece.x + piece.width : piece.x) - outermost) <= SEGMENT_EPSILON)
    .map((piece) => piece.id));
  const segments = [];
  let cursor = run.z;
  const flats = tees
    .filter((tee) => tee.orientation === 'horizontal' && tee.boxIds.some((id) => edgeIds.has(id)))
    .sort((a, b) => a.z - b.z);
  for (const tee of flats) {
    appendSegment(segments, cursor, tee.z, 'box');
    appendSegment(segments, tee.z, tee.z + tee.height, 't-filler');
    cursor = tee.z + tee.height;
  }
  appendSegment(segments, cursor, run.z + run.height, 'box');
  return segments;
}

/** Keep the resolved edge column's box/frame span, with its offsets as separate steps. */
function edgeStepSegments(run, column, segments, drop = 0) {
  if (!column) return segments;
  const bottomUp = column.z - run.z;
  const top = column.z + column.height;
  const runTop = run.z + run.height;
  if (bottomUp <= SEGMENT_EPSILON && runTop - top <= SEGMENT_EPSILON) return segments;
  const bottom = bottomUp > SEGMENT_EPSILON
    ? column.z - drop : Math.min(run.z, segments[0].start);
  const result = [];
  appendSegment(result, run.z - drop, bottom, 'step');
  for (const { start, end, kind } of segments) {
    appendSegment(result, Math.max(start, bottom), Math.min(end, top), kind);
  }
  appendSegment(result, top, runTop, 'step');
  return result;
}

/**
 * A run's box on the vertical chain (SPEC-36.2.1). On a face frame run, the frame region nearest
 * the chain's edge is dimensioned rail | opening | rail up its outermost stack of openings, from the
 * frame's own bottom (below an upper's box when it drops), with any box above or below the frame.
 * Otherwise the box.
 */
function runBoxSegments(room, wall, run, settings, edge) {
  const box = [{ start: run.z, end: run.z + run.height, kind: 'box' }];
  const layout = layoutRun(room, wall, run, settings);
  // Root bounds include nested voids and only offsets accepted by the layout solver.
  const columns = layout.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item');
  const column = (edge === 'right' ? rightmost : leftmost)(columns);
  const cells = cellPieces(run, layout);
  const { regions } = frameRegions(room, run, cells, settings);
  if (regions.length === 0) return edgeStepSegments(run, column,
    teeBoxSegments(run, cells, teeFillers(room, run, cells, settings).tees, edge));
  const region = regions.reduce((best, candidate) => (edge === 'right'
    ? (candidate.x + candidate.width > best.x + best.width + SEGMENT_EPSILON ? candidate : best)
    : (candidate.x < best.x - SEGMENT_EPSILON ? candidate : best)));
  const openings = regionOpenings(region, runFaceLayouts(room, wall, run, settings, layout));
  const tracks = frameEdgeTracks(region, openings, edge);
  if (tracks.length === 0) return edgeStepSegments(run, column, box);
  return edgeStepSegments(run, column, [
    { start: run.z, end: region.z, kind: 'box' },
    ...tracks.map(({ start, end, kind }) => ({ start, end, kind })),
    { start: region.z + region.height, end: run.z + run.height, kind: 'box' },
  ].filter((segment) => segment.end - segment.start > SEGMENT_EPSILON), frameDrop(run, settings));
}

export function counterHeight(wall, run, profile) {
  if (run?.cabinetTypeId !== CABINET_TYPE_IDS.BASE) return [];
  const top = runTop(wall, run, profile);
  return [{
    start: 0,
    end: run.z + run.height + top.height,
    kind: 'counter-height',
  }];
}

/**
 * The soffit a vertical chain stops at (SPEC-36.3.2, 36.3.3): the lowest one over the column's runs,
 * or when none is over them (or there are no runs), the one nearest the chain's edge of the wall,
 * the lowest of those that tie.
 */
function columnSoffit(wall, runs, edge) {
  const soffits = soffitsOn(wall);
  const over = soffits.filter((soffit) => runs.some((run) => rangesOverlap(soffit, run)));
  if (over.length > 0) return [...over].sort((a, b) => a.bottom - b.bottom)[0];
  const length = wallLength(wall);
  const distance = (soffit) => (edge === 'right' ? length - (soffit.x + soffit.width) : soffit.x);
  return [...soffits].sort((a, b) => (
    Math.abs(distance(a) - distance(b)) > SEGMENT_EPSILON ? distance(a) - distance(b) : a.bottom - b.bottom
  ))[0] ?? null;
}

/** Where the open space at the top of a chain stops: a soffit's bottom above `cursor`, or null. */
function soffitBreak(wall, runs, cursor, edge) {
  const soffit = columnSoffit(wall, runs, edge);
  if (!soffit) return null;
  return soffit.bottom > cursor - SEGMENT_EPSILON && soffit.bottom < wall.height - SEGMENT_EPSILON
    ? soffit.bottom
    : null;
}

/** Height up to the highest molding actually drawn, from the box top. */
function drawnMoldingHeight(wall, run, profile, settings) {
  const drawn = runMoldings(wall, run, profile, settings);
  return Math.max(drawn.topMold ? profile.topMoldHeight : 0, drawn.crown ? profile.crownStackHeight : 0);
}

/** One chain up a joined stack, bottom to top: each run's parts below, box and top, with the gaps. */
export function stackChain(room, wall, runs, settings, edge = 'left') {
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
    const box = runBoxSegments(room, wall, run, settings, edge);
    append(parts.length > 0 ? parts.at(-1).z : box[0].start, index === 0 && lower ? 'toe-kick' : 'open');
    for (const part of [...parts].reverse()) append(part.z + part.height, 'bottom');
    for (const segment of box) append(segment.end, segment.kind);
    const top = runTop(wall, run, profile);
    append(run.z + run.height + (isCountertop(top.kind) ? top.height
      : drawnMoldingHeight(wall, run, profile, settings)), isCountertop(top.kind) ? 'countertop' : 'molding');
  });
  const soffit = soffitBreak(wall, runs, cursor, edge);
  if (soffit !== null) append(soffit, 'open');
  append(wall.height, soffit !== null ? 'soffit' : 'open');
  return {
    inner,
    middle: counterHeight(
      wall,
      runs.find((run) => run.cabinetTypeId === CABINET_TYPE_IDS.BASE),
      profile,
    ),
    outer: wall.height > SEGMENT_EPSILON ? [{ start: 0, end: wall.height, kind: 'wall' }] : [],
  };
}

/** Build the vertical cabinet stack and full-wall dimension chains. */
export function verticalChains(room, wall, { lowerRun, upperRun, stack = null }, settings, edge = 'left') {
  if (stack && stack.length > 1) return stackChain(room, wall, stack, settings, edge);
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
  const result = () => ({
    inner,
    middle: counterHeight(wall, lowerRun, wallProfile),
    outer,
  });
  const rememberBox = (run) => {
    const top = run.z + run.height;
    if (!highestBox || top >= highestBox.top - SEGMENT_EPSILON) {
      highestBox = { run, top };
    }
  };

  if (lowerRun) {
    const lowerBox = runBoxSegments(room, wall, lowerRun, settings, edge);
    append(0, lowerBox[0].start, 'toe-kick');
    let drawn = false;
    for (const segment of lowerBox) {
      drawn = append(segment.start, segment.end, segment.kind) || drawn;
    }
    if (drawn) rememberBox(lowerRun);
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
    const box = runBoxSegments(room, wall, upperRun, settings, edge);
    append(
      cursor,
      parts.length > 0 ? parts.at(-1).z : box[0].start,
      lowerRun?.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 'clearance' : 'open',
    );
    for (const part of [...parts].reverse()) append(part.z, part.z + part.height, 'bottom');
    let drawn = false;
    for (const segment of box) drawn = append(segment.start, segment.end, segment.kind) || drawn;
    if (drawn) rememberBox(upperRun);
  }

  if (highestBox) {
    const height = drawnMoldingHeight(wall, highestBox.run, wallProfile, settings);
    append(highestBox.top, highestBox.top + height, 'molding');
  }

  const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor, edge);
  if (soffit !== null) append(cursor, soffit, 'open');
  append(cursor, wall.height, soffit !== null ? 'soffit' : 'open');
  return result();
}
