import { CABINET_TYPE_IDS } from './constants.js';
import { planClearances } from './clearances.js';
import { frontDepth } from './corners.js';
import { plotScale } from './drawingScale.js';
import { DIMENSION_ROW_SPACING, placeLabels } from './elevationDimensions.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { planTopOverhangs } from './planTops.js';
import { projectionDepthX, projectionTightSides, recessesOn } from './recesses.js';
import { formatInches } from './units.js';
import { wallFaceSegments } from './wallFaceRow.js';
import { wallBuiltEnds, wallEndPanelPolygon, wallEndPanels } from './wallEndPanels.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

/** The elevation marker's circle and flag on paper (SPEC-45.1); geometry draws them the same size. */
export const PLAN_MARKER_RADIUS = 0.25;
export const PLAN_MARKER_FLAG = 0.1875;
/** Drawing inches from a face's deepest run to its marker (the canvas's MARKER_CLEARANCE). */
export const PLAN_MARKER_CLEARANCE = 6;

const EPSILON = 1e-6;
const up = (point) => [point.x + 0, 0 - point.y];

/** How far a recess at least as deep as the wall bumps it out (PlanWallShape's bumpOut). */
function bumpOut(wall, side) {
  return Math.max(0, ...recessesOn(wall, side)
    .filter((recess) => recess.kind !== 'projection' && recess.depth >= wall.thickness - EPSILON)
    .map((recess) => recess.depth));
}

function deepestRun(wall, side, settings) {
  return Math.max(0, ...(wall.runs ?? [])
    .filter((run) => wallSideOf(run) === side)
    .map((run) => frontDepth(run, settings)));
}

/** The deepest run on a face, measured from that face's wall line. */
export function planSideReach(room, wall, side, settings) {
  return deepestRun(wall, side, settings);
}

/**
 * One row's records (SPEC-45): `base(u)` is the canvas point on the row's base line at `u`, `outward` the
 * way the row moves out, `at` how far out its dimension line is. Records read left to right or bottom to
 * top, with `offset` signed to start→end's left; text that doesn't fit moves out as in the elevations.
 */
function rowRecords(row, segments, base, outward, at, scale) {
  const a = up(base(segments[0].start));
  const b = up(base(segments[segments.length - 1].end));
  const forward = b[0] - a[0] > EPSILON || (Math.abs(b[0] - a[0]) <= EPSILON && b[1] > a[1]);
  const dx = forward ? b[0] - a[0] : a[0] - b[0];
  const dy = forward ? b[1] - a[1] : a[1] - b[1];
  const sign = -dy * outward.x + dx * -outward.y > 0 ? 1 : -1;
  const { placed, levels, step } = placeLabels(segments, at, +1, scale);
  const records = placed.map(({ segment, text, along, across }) => {
    const one = up(base(segment.start));
    const two = up(base(segment.end));
    return {
      row,
      kind: segment.kind,
      start: forward ? one : two,
      end: forward ? two : one,
      offset: sign * at + 0,
      text,
      ...(along === undefined ? {} : {
        textAt: up({ x: base(along).x + outward.x * across, y: base(along).y + outward.y * across }),
      }),
    };
  });
  return { records, levels, step };
}

const DEPTH_LANES = {
  [CABINET_TYPE_IDS.BASE]: 0,
  [CABINET_TYPE_IDS.UPPER]: -1,
  [CABINET_TYPE_IDS.TALL]: 1,
};
/** Paper inches: a lane's shift off the run's middle, and the least room kept at a run's ends (SPEC-45.2). */
export const DEPTH_LANE_SHIFT = 0.375;
export const DEPTH_MARGIN = 0.25;

/** A run's depth from its plane to its front, across the run in its type's lane (SPEC-45.2). */
function depthRecords(room, wall, run, settings) {
  const scale = plotScale(settings);
  const frame = wallSideFrame(room, wall, wallSideOf(run));
  const back = run._plane?.offset ?? 0;
  const depth = frontDepth(run, settings) - back;
  if (depth <= EPSILON || run.width <= EPSILON) return [];
  const lane = DEPTH_LANES[run.cabinetTypeId] ?? 0;
  const margin = Math.min(run.width / 2, DEPTH_MARGIN * scale);
  const x = Math.max(run.x + margin, Math.min(run.x + run.width - margin,
    run.x + run.width / 2 + lane * DEPTH_LANE_SHIFT * scale));
  const side = lane < 0 ? -1 : 1;
  const base = (t) => elevationToPlan(frame, x, back + t);
  const outward = { x: frame.r.x * side, y: frame.r.y * side };
  return rowRecords('depth', [{ start: 0, end: depth, kind: 'depth' }], base, outward, 0, scale).records;
}

/** A projection's depth from the face it stands on, across it (Kyle 2026-10-16). */
function projectionDepthRecords(room, wall, recess, settings) {
  if (recess.kind !== 'projection' || recess.depth <= EPSILON) return [];
  const frame = wallSideFrame(room, wall, wallSideOf(recess));
  const tight = projectionTightSides(room, wall, recess, frame.length);
  const x = projectionDepthX(recess, frame.length, wall.height, tight);
  const base = (t) => elevationToPlan(frame, x, t);
  return rowRecords('depth', [{ start: 0, end: recess.depth, kind: 'depth' }], base, frame.r, 0, plotScale(settings))
    .records;
}

/** Rows on each physical side and the next row's distance from that side's wall face. */
export function planWallRows(room, wall, settings) {
  const scale = plotScale(settings);
  const spacing = DIMENSION_ROW_SPACING * scale;
  const layout = [];
  const frame = wallFrame(room, wall);
  if (frame.length <= EPSILON) return [];
  const ends = wallBuiltEnds(wall);
  const exterior = { x: -frame.n.x, y: -frame.n.y };
  const outside = wall.thickness
    + Math.max(bumpOut(wall, 'front'), planSideReach(room, wall, 'back', settings));
  const front = (u) => ({
    x: frame.leftPoint.x + frame.r.x * u + exterior.x * outside,
    y: frame.leftPoint.y + frame.r.y * u + exterior.y * outside,
  });
  const back = wallSideFrame(room, wall, 'back');
  const inside = wall.thickness
    + Math.max(bumpOut(wall, 'back'), planSideReach(room, wall, 'front', settings));
  const backBase = (u) => ({
    x: back.leftPoint.x + back.r.x * u + frame.n.x * inside,
    y: back.leftPoint.y + back.r.y * u + frame.n.y * inside,
  });
  const sides = [
    ['back', outside - wall.thickness, exterior, [
      ['front', wallFaceSegments(room, wall, 'front', settings), front],
      ['wall', [{ start: 0 - ends[frame.leftEndpoint], end: frame.length + ends[frame.rightEndpoint], kind: 'wall' }], front],
    ]],
    ['front', inside - wall.thickness, frame.n, [['back', wallFaceSegments(room, wall, 'back', settings), backBase]]],
  ];
  for (const [side, reach, outward, rows] of sides) {
    const records = [];
    let at = spacing;
    for (const [row, all, base] of rows) {
      const segments = all.filter((segment) => segment.end - segment.start > EPSILON);
      if (segments.length === 0) continue;
      const result = rowRecords(row, segments, base, outward, at, scale);
      records.push(...result.records);
      at += spacing + result.levels * result.step;
    }
    layout.push({ side, records, nextAt: records.length > 0 ? reach + at : null });
  }
  return layout;
}

/** Across each wall end panel, on a line one row spacing beyond its outer edge. */
export function planThroughDimensions(room, wall, settings) {
  const scale = plotScale(settings);
  const frame = wallFrame(room, wall);
  const panels = wallEndPanels(room, wall, settings);
  const total = (panel) => wall.thickness + panel.back.depth + panel.front.depth;
  const start = panels.find((panel) => panel.endpoint === 'start');
  return panels.flatMap((panel) => {
    if (panel.endpoint === 'end' && start && Math.abs(total(start) - total(panel)) <= 1 / 32) return [];
    const left = panel.front.side === 'left';
    const xs = wallEndPanelPolygon(room, wall, panel).map((point) => (
      (point.x - frame.leftPoint.x) * frame.r.x + (point.y - frame.leftPoint.y) * frame.r.y
    ));
    const x = (left ? Math.min(...xs) : Math.max(...xs))
      + (left ? -1 : 1) * DIMENSION_ROW_SPACING * scale;
    const base = (depth) => elevationToPlan(frame, x, depth);
    return rowRecords('through', [{
      start: -(wall.thickness + panel.back.depth), end: panel.front.depth,
      // Dimension text omits the inch mark, as do the other rows and the DM1 anchor.
      kind: 'through', text: formatInches(total(panel)).replace(/"$/, ''),
    }], base, frame.r, 0, scale).records;
  });
}

/**
 * The plan's dimensions for the DXF (SPEC-45): aligned, in plan inches with y up, reading from the bottom
 * or the right. Per wall, outside it, the front face row then the overall length, 3/8" (paper) apart past
 * the wall, its bump-out and the runs behind it; a back face row on the room side. Then each panel's through
 * depth, each run's depth by type lane, each projection's depth, and the island and aisle clearances.
 */
export function planDimensions(room, settings) {
  const scale = plotScale(settings);
  const records = [];
  for (const wall of room.walls) {
    for (const { records: rows } of planWallRows(room, wall, settings)) records.push(...rows);
    records.push(...planThroughDimensions(room, wall, settings));
  }
  for (const wall of room.walls) {
    for (const run of wall.runs ?? []) records.push(...depthRecords(room, wall, run, settings));
    for (const recess of wall.recesses ?? []) records.push(...projectionDepthRecords(room, wall, recess, settings));
  }
  for (const { wallId, edge, value, from, to } of planTopOverhangs(room, settings)) {
    const wall = room.walls.find(({ id }) => id === wallId);
    const frame = wallSideFrame(room, wall, 'front');
    const base = (t) => elevationToPlan(frame,
      from[0] + (to[0] - from[0]) * t / value,
      from[1] + (to[1] - from[1]) * t / value);
    const outward = edge === 'front' || edge === 'back' ? frame.r : frame.n;
    records.push(...rowRecords('overhang', [{ start: 0, end: value, kind: 'overhang' }],
      base, outward, 0, scale).records);
  }
  for (const { kind, from, to, length } of planClearances(room, settings)) {
    if (length <= EPSILON) continue;
    const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const base = (t) => ({ x: from.x + unit.x * t, y: from.y + unit.y * t });
    const outward = { x: -unit.y, y: unit.x };
    records.push(...rowRecords('clearance', [{ start: 0, end: length, kind }], base, outward, 0, scale).records);
  }
  return records;
}
