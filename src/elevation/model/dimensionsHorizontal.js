import { CABINET_TYPE_IDS } from './constants.js';
import { SEGMENT_EPSILON, appendSegment, faceHasRuns } from './dimensionsShared.js';
import { cellPieces } from './cells.js';
import { cornerLap } from './cornerLaps.js';
import { cornerAt, cornerReserveParts } from './corners.js';
import { runFaceLayouts } from './faceLayouts.js';
import { frameRegions } from './frames.js';
import { wallFrame, wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { landingsOn } from './landings.js';
import { cornerShapes, profileReach } from './cornerParts.js';
import { resolveProfile } from './profile.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from './room.js';
import { splitRun } from './splitRun.js';
import { stackLeaders } from './stacks.js';
import { teeFillers } from './tees.js';
import { isCountertop, runTop } from './tops.js';
import { runBands, waterfallEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { topOverhangs } from './topOverhang.js';
import { wallBuiltEnds } from './wallEndPanels.js';

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

/** A neighbour run's reach past this face's end, from what cornerShapes draws (SPEC-43.4). */
function neighborSegments(room, wall, band, settings) {
  const inBand = band === 'lower'
    ? (id) => id === CABINET_TYPE_IDS.BASE || id === CABINET_TYPE_IDS.TALL
    : (id) => id === CABINET_TYPE_IDS.UPPER;
  return profileReach(room, wall, wall.side ?? 'front', settings)
    .filter((profile) => inBand(profile.cabinetTypeId))
    .map((profile) => ({
      start: profile.x,
      end: profile.x + profile.width,
      kind: 'neighbor',
      wallId: profile.wallId,
      neighborRunId: profile.runId,
    }));
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
 * A root column holding a void isn't one cabinet (FX3): the cabinet row shows its solid cells' widths
 * (and inside end panels') instead, a span only voids cover as a `gap`, and a seam between cells as the
 * usual gap. Each span
 * names the lowest solid cell over it, and the nested column track it matches (`trackId`), so the
 * canvas edits that track. Null for a column with no void or no solid cell.
 */
function voidColumnEntries(piece, cells, runId) {
  if (piece.role !== 'item') return null;
  const tracks = cells.grids.filter((grid) => grid.columnId === piece.id && grid.axis === 'col')
    .flatMap((grid) => grid.tracks);
  const leaves = cells.pieces.filter((leaf) => leaf.columnId === piece.id && leaf.role === 'item');
  if (!leaves.some((leaf) => leaf.kind === 'void')) return null;
  // An inside end panel beside the void counts like a cell.
  const panels = cells.pieces.filter((panel) => panel.role === 'inside'
    && panel.x >= piece.x - SEGMENT_EPSILON && panel.x + panel.width <= piece.x + piece.width + SEGMENT_EPSILON);
  const solid = [...leaves.filter((leaf) => leaf.kind !== 'void'), ...panels];
  if (solid.length === 0) return null;
  const covers = (leaf, start, end) => leaf.x <= start + SEGMENT_EPSILON
    && leaf.x + leaf.width >= end - SEGMENT_EPSILON;
  const bounds = [...new Set([piece.x, piece.x + piece.width,
    ...solid.flatMap((leaf) => [leaf.x, leaf.x + leaf.width])])].sort((a, b) => a - b);
  const entries = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const start = bounds[index];
    const end = bounds[index + 1];
    if (end - start <= SEGMENT_EPSILON) continue;
    const over = solid.filter((leaf) => covers(leaf, start, end)).sort((a, b) => a.z - b.z)[0];
    if (over) {
      const track = tracks.find((candidate) => Math.abs(candidate.start - start) <= SEGMENT_EPSILON
        && Math.abs(candidate.end - end) <= SEGMENT_EPSILON);
      entries.push({
        start, end, kind: 'piece', metadata: { runId, pieceId: over.id, ...(track ? { trackId: track.id } : {}) },
      });
    } else if (leaves.some((leaf) => leaf.kind === 'void' && covers(leaf, start, end))) {
      entries.push({ start, end, kind: 'gap', metadata: { runId } });
    }
  }
  return entries;
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
    const cellEntries = voidColumnEntries(piece, cells, run.id);
    if (cellEntries) {
      entries.push(...cellEntries);
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

/**
 * What a run's top adds past its ends on the overall row: a waterfall leg (its thickness) plus any side
 * overhang holding it off the run, or a typed side overhang that differs from the default and reaches
 * past a free end. Segments run left to right on each side.
 */
export function topEndSegments(room, wall, run, settings) {
  const none = { left: [], right: [] };
  const profile = resolveProfile(settings, room, wall);
  const top = runTop(wall, run, profile);
  if (!isCountertop(top.kind)) return none;
  const overhangs = topOverhangs(room, wall, run, settings);
  const waterfall = waterfallEnds(room, wall, run, settings);
  const typed = (side) => Number.isFinite(run.topOverhang?.[side]) && run.topOverhang[side] >= 0;
  const defaults = topOverhangs(room, wall, { ...run, topOverhang: undefined }, settings);
  let band;
  const countertop = () => {
    band ??= runBands(room, wall, run, settings, runScene(room, wall, run, settings)).countertop ?? null;
    return band;
  };
  const segments = (side) => {
    const s = side === 'left' ? -1 : 1;
    const edge = side === 'left' ? run.x : run.x + run.width;
    const past = overhangs[side];
    const metadata = { runId: run.id, side };
    const list = [];
    if (waterfall[side]) {
      const inner = edge + s * past;
      const outer = inner + s * top.height;
      list.push({ start: Math.min(inner, outer), end: Math.max(inner, outer), kind: 'waterfall', ...metadata });
      if (past > SEGMENT_EPSILON) {
        list.push({ start: Math.min(edge, inner), end: Math.max(edge, inner), kind: 'overhang', ...metadata });
      }
    } else if (typed(side) && past > SEGMENT_EPSILON
      && Math.abs(past - defaults[side]) > SEGMENT_EPSILON) {
      const rect = countertop();
      const reaches = rect && (side === 'left'
        ? rect.x < edge - SEGMENT_EPSILON
        : rect.x + rect.width > edge + SEGMENT_EPSILON);
      if (reaches) {
        const outer = edge + s * past;
        list.push({ start: Math.min(edge, outer), end: Math.max(edge, outer), kind: 'overhang', ...metadata });
      }
    }
    return list.sort((a, b) => a.start - b.start);
  };
  return { left: segments('left'), right: segments('right') };
}

/**
 * Neighbour cabinets returning into this face's inside corners in this band, in section (SPEC-42.2): from
 * the corner to the front of their faces.
 */
function cornerReturnSegments(room, wall, band, settings) {
  const inBand = band === 'lower'
    ? (id) => id === CABINET_TYPE_IDS.BASE || id === CABINET_TYPE_IDS.TALL
    : (id) => id === CABINET_TYPE_IDS.UPPER;
  return cornerShapes(room, wall, wall.side ?? 'front', settings)
    .filter((shape) => shape.kind === 'return' && shape.runId)
    .flatMap((shape) => {
      const run = room.walls.find((candidate) => candidate.id === shape.wallId)
        ?.runs?.find((candidate) => candidate.id === shape.runId);
      const sections = shape.parts.filter((part) => part.kind === 'section');
      if (!run || !inBand(run.cabinetTypeId) || sections.length === 0) return [];
      return [{
        start: Math.min(...sections.map((part) => part.x)),
        end: Math.max(...sections.map((part) => part.x + part.width)),
        kind: 'neighbor',
        wallId: shape.wallId,
        neighborRunId: shape.runId,
      }];
    });
}

/**
 * The depth of a neighbour's cabinet returning into this face's inside corner (Kyle 2026-10-16): the gap
 * at that end splits at the return's front, so the piece row reads its depth. With nothing else on the
 * row, the returns and the space between them make the row.
 */
function withCornerReturns(inner, returns, wallStart, wallEnd) {
  if (returns.length === 0) return inner;
  if (inner.length === 0) {
    const row = [];
    let cursor = wallStart;
    for (const segment of [...returns].sort((a, b) => a.start - b.start)) {
      if (segment.start > cursor + SEGMENT_EPSILON) row.push({ start: cursor, end: segment.start, kind: 'open' });
      row.push(segment);
      cursor = Math.max(cursor, segment.end);
    }
    if (wallEnd > cursor + SEGMENT_EPSILON) row.push({ start: cursor, end: wallEnd, kind: 'open' });
    return row;
  }
  const gaps = new Set(['open', 'corner-gap']);
  return inner.flatMap((segment) => {
    if (!gaps.has(segment.kind)) return [segment];
    const atStart = returns.find((ret) => Math.abs(ret.start - segment.start) <= SEGMENT_EPSILON
      && ret.end < segment.end - SEGMENT_EPSILON);
    const atEnd = returns.find((ret) => Math.abs(ret.end - segment.end) <= SEGMENT_EPSILON
      && ret.start > segment.start + SEGMENT_EPSILON);
    if (atStart) return [atStart, { ...segment, start: atStart.end }];
    if (atEnd) return [{ ...segment, end: atEnd.start }, atEnd];
    return [segment];
  });
}

/** The face's wall row ends, built end panels included (SPEC-36.2). */
function wallSpan(room, wall) {
  const frame = wallFrame(room, wall);
  const ends = wallBuiltEnds(wall);
  return { wallStart: 0 - ends[frame.leftEndpoint], wallEnd: frame.length + ends[frame.rightEndpoint] };
}

/**
 * The overall wall row below the elevation (DM3 §1.3): the wall length, built ends included, on a face with
 * any run; omitted when the lower run row is already one segment the full wall long, and on faces without
 * runs (their run row carries the wall length). `lowerOuter` saves recomputing the lower band's run row.
 */
export function wallRow(room, wall, settings, lowerOuter = null) {
  if (!faceHasRuns(wall)) return [];
  const { wallStart, wallEnd } = wallSpan(room, wall);
  if (wallEnd - wallStart <= SEGMENT_EPSILON) return [];
  const outer = lowerOuter ?? horizontalChains(room, wall, 'lower', settings).outer;
  if (outer.length === 1
    && Math.abs(outer[0].start - wallStart) <= SEGMENT_EPSILON
    && Math.abs(outer[0].end - wallEnd) <= SEGMENT_EPSILON) return [];
  return [{ start: wallStart, end: wallEnd, kind: 'wall' }];
}

/**
 * Build the inner piece chain and outer run chain for an elevation band (DM3). On a face with runs the inner
 * row is cabinet and part widths only (open gaps dropped, so it may have gaps), and the outer row merges runs
 * that touch into one segment; a band with no runs there leaves the wall length to the wall row.
 */
export function horizontalChains(room, wall, band, settings) {
  const chains = bandChains(room, wall, band, settings);
  if (!faceHasRuns(wall)) return chains;
  return { inner: chains.inner.filter((segment) => segment.kind !== 'open'), outer: chains.outer };
}

function bandChains(room, wall, band, settings) {
  const runs = runsForBand(wall, band);
  const neighbors = neighborSegments(room, wall, band, settings);
  const { wallStart, wallEnd } = wallSpan(room, wall);
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
    const left = outermost(neighbors, 'left', wallStart);
    const right = outermost(neighbors, 'right', wallEnd);
    const overall = !faceHasRuns(wall) && wallEnd - wallStart > SEGMENT_EPSILON
      ? [{ start: wallStart, end: wallEnd, kind: 'wall' }] : [];
    return {
      inner: withCornerReturns([left, right].filter(Boolean), cornerReturnSegments(room, wall, band, settings), wallStart, wallEnd),
      outer: [left, ...overall, right].filter(Boolean),
    };
  }

  const length = wallLength(wall);
  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];
  const topEnds = new Map(runs.map((run) => [run.id, topEndSegments(room, wall, run, settings)]));
  const runStart = (run) => topEnds.get(run.id).left[0]?.start ?? run.x;
  const runEnd = (run) => topEnds.get(run.id).right.at(-1)?.end ?? run.x + run.width;
  const rangeStart = Math.min(wallStart, firstRun.x, ...runs.map(runStart));
  const rangeEnd = Math.max(wallEnd, lastRun.x + lastRun.width, ...runs.map(runEnd));
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
    const lapAt = (side, cornerGap) => cornerGap
      && cornerLap(room, wall, run, side, settings)?.laps === true
      ? cornerReserveParts(room, wall, side, run, settings).lap : 0;
    const leftLap = lapAt('left', index === 0 && leftCornerGap);
    const rightLap = lapAt('right', index === runs.length - 1 && rightCornerGap);
    // Measure the visible filler/stile up to the neighbor's front, excluding the hidden lap.
    if (segments.length > 0) {
      if (leftLap) segments[0].start = run.x + leftLap;
      if (rightLap) segments[segments.length - 1].end = run.x + run.width - rightLap;
    }
    appendGap(
      inner,
      cursor,
      leftLap ? run.x + leftLap : Math.min(run.x, segments[0]?.start ?? run.x, runStart(run)),
      index === 0 && leftCornerGap ? 'corner-gap' : 'open',
      tallRanges,
    );
    inner.push(...segments);
    // The top's legs/overhangs are measured on the overall row; the piece row skips over them.
    cursor = rightLap ? run.x + run.width - rightLap
      : Math.max(run.x + run.width, segments[segments.length - 1]?.end ?? run.x + run.width, runEnd(run));
  });
  appendGap(
    inner,
    cursor,
    rangeEnd,
    rightCornerGap ? 'corner-gap' : 'open',
    tallRanges,
  );
  if (right) inner.push(right);

  // Runs that touch (top legs/overhangs included) are one cluster, one segment (DM3 §1.2).
  const clusters = [];
  runs.forEach((run, index) => {
    const start = index === 0 && leftCornerGap ? 0 : run.x;
    const end = index === runs.length - 1 && rightCornerGap
      ? length
      : run.x + run.width;
    const { left: before, right: after } = topEnds.get(run.id);
    const reachStart = Math.min(start, before[0]?.start ?? start);
    const reachEnd = Math.max(end, after.at(-1)?.end ?? end);
    const last = clusters.at(-1);
    if (last && Math.abs(reachStart - last.reachEnd) <= SEGMENT_EPSILON) {
      last.runs.push(run);
      last.end = end;
      last.after = after;
      last.reachEnd = reachEnd;
    } else {
      clusters.push({ runs: [run], start, end, before, after, reachStart, reachEnd });
    }
  });
  const outer = [];
  if (left) outer.push(left);
  cursor = rangeStart;
  for (const cluster of clusters) {
    const [first] = cluster.runs;
    const last = cluster.runs.at(-1);
    appendOpenGap(outer, cursor, cluster.reachStart, tallRanges);
    for (const segment of cluster.before) appendSegment(outer, segment.start, segment.end, segment.kind, { runId: first.id, side: segment.side });
    appendSegment(outer, cluster.start, cluster.end, 'run', { runId: first.id, runIds: cluster.runs.map((run) => run.id) });
    for (const segment of cluster.after) appendSegment(outer, segment.start, segment.end, segment.kind, { runId: last.id, side: segment.side });
    cursor = cluster.reachEnd;
  }
  appendOpenGap(outer, cursor, rangeEnd, tallRanges);
  if (right) outer.push(right);

  return { inner: withCornerReturns(inner, cornerReturnSegments(room, wall, band, settings), wallStart, wallEnd), outer };
}
