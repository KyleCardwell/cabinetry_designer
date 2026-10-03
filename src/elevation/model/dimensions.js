import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { runBottomParts } from './bottoms.js';
import { cellPieces } from './cells.js';
import { cornerAt } from './corners.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { frameEdgeTracks, frameRegions, regionOpenings } from './frames.js';
import { wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { landingsOn } from './landings.js';
import { neighborProfiles } from './neighborProfiles.js';
import { openingGeometry } from './openings.js';
import { verticalStart } from './overlap.js';
import { resolveProfile } from './profile.js';
import { recessGeometry, recessesOn, uncoveredSpans } from './recesses.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
  resolvePinTarget,
} from './room.js';
import { soffitsOn } from './soffits.js';
import { splitRun } from './splitRun.js';
import { stackLeaders, stackOf } from './stacks.js';
import { teeFillers } from './tees.js';
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

/**
 * The runs a band's horizontal chains measure, left to right. A run stacked on or under another run
 * in the same band is left out: its stack's vertical chain measures it (SPEC-38.5).
 */
function runsForBand(wall, band) {
  const matches = band === 'lower'
    ? (run) => (
      run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    )
    : (run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const inBand = wall.runs.filter(matches);
  const ids = new Set(inBand.map((run) => run.id));
  return inBand
    .filter((run) => !stackLeaders(run).some((id) => ids.has(id)))
    .sort((a, b) => a.x - b.x);
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

/**
 * The elevation's wall row (SPEC-37.4, SPEC-38): every door and window by its own reference edges (jamb or
 * casing, per its measure mode), every wing wall landing on this face at its thickness, and every recess on
 * this face at its width, split around the openings inside it, with the gaps between them and to the wall's
 * ends. Shown with or without cabinets; [] when there's nothing.
 */
export function openingChain(room, wall, settings) {
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

/** A face frame region along its bottom row of openings: frame | opening | frame … (SPEC-36). */
function regionSegments(region, pieces, faceLayouts, runId) {
  const boxes = pieces.filter((piece) => region.cabinetIds.includes(piece.id));
  const bottom = Math.min(...boxes.map((piece) => piece.z));
  const openings = boxes
    .filter((piece) => Math.abs(piece.z - bottom) <= SEGMENT_EPSILON)
    .flatMap((piece) => {
      const own = faceLayouts.get(piece.id)?.openings ?? [];
      const low = Math.min(...own.map((opening) => opening.z));
      return own
        .filter((opening) => Math.abs(opening.z - low) <= SEGMENT_EPSILON)
        .map((opening) => ({ ...opening, pieceId: piece.id }));
    })
    .sort((a, b) => a.x - b.x);
  const segments = [];
  let cursor = region.x;
  for (const opening of openings) {
    if (opening.x < cursor - SEGMENT_EPSILON) continue;
    appendSegment(segments, cursor, opening.x, 'frame', { runId });
    appendSegment(segments, opening.x, opening.x + opening.width, 'frame-opening', {
      runId,
      pieceId: opening.pieceId,
    });
    cursor = opening.x + opening.width;
  }
  appendSegment(segments, cursor, region.x + region.width, 'frame', { runId });
  return segments;
}

/**
 * A run's segments on the inner chain: its pieces, a gap between boxes as its own segment, and each
 * face frame region as stile and opening segments in place of the pieces it covers (SPEC-36). A
 * T-filler is its own `t-filler` segment, and the boxes it covers show what's left of them (SPEC-37).
 */
function runInnerSegments(room, wall, run, settings, layout) {
  const cells = cellPieces(run, layout);
  const { regions } = frameRegions(room, run, cells, settings);
  const { tees, covers, ells } = teeFillers(room, run, cells, settings);
  const faceLayouts = regions.length > 0 ? runFaceLayouts(room, wall, run, settings, layout) : null;
  const regionOf = (piece) => regions.find((region) => piece.x >= region.x - SEGMENT_EPSILON
    && piece.x + piece.width <= region.x + region.width + SEGMENT_EPSILON);
  const endTees = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.id, tee]));
  const endElls = new Map(ells.map((ell) => [ell.pieceId, ell]));
  // What a T covers along a piece's left and right edges, from the boxes that reach those edges.
  const coverAt = (piece, side) => Math.max(0, ...cells.pieces
    .filter((box) => (box.id === piece.id || box.columnId === piece.id) && covers.has(box.id))
    .filter((box) => Math.abs((side === 'left' ? box.x : box.x + box.width)
      - (side === 'left' ? piece.x : piece.x + piece.width)) <= SEGMENT_EPSILON)
    .map((box) => covers.get(box.id)[side]));
  const entries = [];
  const drawn = new Set();
  for (const piece of layout.pieces) {
    const region = regionOf(piece);
    if (region) {
      if (drawn.has(region.id)) continue;
      drawn.add(region.id);
      for (const { start, end, kind, ...metadata } of regionSegments(region, cells.pieces, faceLayouts, run.id)) {
        entries.push({ start, end, kind, metadata });
      }
      continue;
    }
    const ell = endElls.get(piece.id);
    if (ell) {
      entries.push({
        start: ell.x, end: ell.x + ell.width, kind: 'piece', metadata: { runId: run.id, pieceId: piece.id },
      });
      continue;
    }
    const tee = endTees.get(piece.id);
    if (tee) {
      entries.push({
        start: tee.x, end: tee.x + tee.width, kind: 't-filler', metadata: { runId: run.id, pieceId: tee.id },
      });
      continue;
    }
    entries.push({
      start: piece.x + coverAt(piece, 'left'),
      end: piece.x + piece.width - coverAt(piece, 'right'),
      kind: 'piece',
      metadata: {
        runId: run.id,
        pieceId: piece.id,
        ...(runItems(run).find((item) => item.id === piece.id)?.pin ? { pinned: true } : {}),
      },
    });
  }
  const seams = new Map(tees
    .filter((tee) => tee.orientation === 'vertical' && !tee.end)
    .map((tee) => [`${tee.x}:${tee.width}`, tee]));
  for (const tee of seams.values()) {
    entries.push({
      start: tee.x, end: tee.x + tee.width, kind: 't-filler', metadata: { runId: run.id, pieceId: tee.id },
    });
  }
  entries.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = null;
  for (const { start, end, kind, metadata } of entries) {
    if (cursor !== null && start - cursor > SEGMENT_EPSILON) {
      appendSegment(segments, cursor, start, 'gap', { runId: run.id });
    }
    appendSegment(segments, start, end, kind, metadata);
    cursor = end;
  }
  return segments;
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
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, length, settings),
    });
    // A frame over a wall end panel starts before the run (SPEC-36.2).
    const segments = runInnerSegments(room, wall, run, settings, layout);
    appendGap(
      inner,
      cursor,
      Math.min(run.x, segments[0]?.start ?? run.x),
      index === 0 && leftCornerGap ? 'corner-gap' : 'open',
      tallRanges,
    );
    inner.push(...segments);
    cursor = Math.max(run.x + run.width, segments[segments.length - 1]?.end ?? run.x + run.width);
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

/** How far above an opening's jamb bottom a pin callout to that opening sits (SPEC-39.1). */
export const CENTERLINE_ABOVE_SILL = 6;

/**
 * A pinned cabinet's position callout (SPEC-12, SPEC-38.1): from the pin's datum (a wall end or an opening
 * edge) to the point the pin holds, its left edge, center or right edge.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = runItems(run).find((candidate) => candidate.id === piece.id);
    if (!item?.pin) return [];
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    if (!Number.isFinite(target)) return [];
    const datumX = item.pin.from === 'right'
      ? target + item.pin.value
      : target - item.pin.value;
    const { anchor } = item.pin;
    const opening = item.pin.from === 'opening'
      ? (wall.openings ?? []).find((candidate) => candidate.id === item.pin.openingId) ?? null
      : null;
    const jamb = opening ? openingGeometry(opening, wallLengthValue, settings).jamb : null;
    const x = anchor === 'left'
      ? piece.x
      : anchor === 'right' ? piece.x + piece.width : piece.x + piece.width / 2;
    return [{
      pieceId: piece.id,
      x,
      datumX,
      z: jamb ? jamb.z + Math.min(CENTERLINE_ABOVE_SILL, jamb.height / 2) : CENTERLINE_CALLOUT_Z,
      value: Math.abs(x - datumX),
      pieceBottom: piece.z,
      pieceTop: piece.z + piece.height,
      from: item.pin.from,
      anchor,
      ...(jamb ? { datumZ: jamb.z + jamb.height / 2 } : {}),
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

/**
 * A run's box on the vertical chain (SPEC-36.2.1). On a face frame run, the frame region nearest
 * the chain's edge is dimensioned rail | opening | rail up its outermost stack of openings, from the
 * frame's own bottom (below an upper's box when it drops), with any box above or below the frame.
 * Otherwise the box.
 */
function runBoxSegments(room, wall, run, settings, edge) {
  const box = [{ start: run.z, end: run.z + run.height, kind: 'box' }];
  const layout = layoutRun(room, wall, run, settings);
  const cells = cellPieces(run, layout);
  const { regions } = frameRegions(room, run, cells, settings);
  if (regions.length === 0) return teeBoxSegments(run, cells, teeFillers(room, run, cells, settings).tees, edge);
  const region = regions.reduce((best, candidate) => (edge === 'right'
    ? (candidate.x + candidate.width > best.x + best.width + SEGMENT_EPSILON ? candidate : best)
    : (candidate.x < best.x - SEGMENT_EPSILON ? candidate : best)));
  const openings = regionOpenings(region, runFaceLayouts(room, wall, run, settings, layout));
  const tracks = frameEdgeTracks(region, openings, edge);
  if (tracks.length === 0) return box;
  return [
    { start: run.z, end: region.z, kind: 'box' },
    ...tracks.map(({ start, end, kind }) => ({ start, end, kind })),
    { start: region.z + region.height, end: run.z + run.height, kind: 'box' },
  ].filter((segment) => segment.end - segment.start > SEGMENT_EPSILON);
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
    append(run.z + run.height + top.height, isCountertop(top.kind) ? 'countertop' : 'molding');
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
    const top = runTop(wall, highestBox.run, wallProfile);
    if (top.kind === 'crown' || top.kind === 'topMold') {
      append(highestBox.top, highestBox.top + top.height, 'molding');
    }
  }

  const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor, edge);
  if (soffit !== null) append(cursor, soffit, 'open');
  append(cursor, wall.height, soffit !== null ? 'soffit' : 'open');
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
    middle: [],
    outer: wall.height > SEGMENT_EPSILON
      ? [{ start: 0, end: wall.height, kind: 'wall' }]
      : [],
  };
}
