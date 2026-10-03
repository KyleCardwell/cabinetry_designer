import { v4 as uuid } from 'uuid';
import { runBackOffset } from './corners.js';
import { clamp, wallLength } from './geometry.js';
import { verticalStart } from './overlap.js';
import { positionReadouts, startFromReadout, stretchedStart } from './positions.js';
import { roundTo } from './units.js';
import { wallSideOf } from './wallSides.js';

/** SPEC-38: a recess is cut back into a wall face; a projection is built out from it. */
export const RECESS_KINDS = ['recess', 'projection'];
/** What runs on a recess put under its top when it stops below the ceiling, as under a soffit. */
export const RECESS_MOLDINGS = ['crown', 'topMold', 'none'];
/** A new recess: 36" wide, 12" deep, floor to ceiling. */
export const DEFAULT_RECESS = { width: 36, depth: 12 };
export const MIN_RECESS_WIDTH = 1;
export const RECESS_PLACEMENT_MESSAGES = {
  'recess-too-small': 'A recess needs a width, a depth and some height.',
  'recess-out-of-bounds': 'A recess has to stay inside the wall.',
  'recess-overlap': "Recesses can't overlap.",
};

const EPSILON = 1e-6;

function kindOf(recess) {
  return recess.kind === 'projection' ? 'projection' : 'recess';
}

/** The recesses and projections on one face: a side view's own face, or a wall and a side. */
export function recessesOn(wallOrView, side = wallOrView.side ?? 'front') {
  const wall = wallOrView.sideSource ?? wallOrView;
  return (wall.recesses ?? []).filter((recess) => wallSideOf(recess) === side);
}

/**
 * Where a recess sits on its face: x, width, bottom, top (the wall height when it goes up to the ceiling),
 * depth, its plane as a plan offset from the face (−depth for a recess, +depth for a projection), and its
 * four position readouts.
 */
export function recessGeometry(recess, length, height) {
  const x = startFromReadout(
    recess.offsetFrom,
    recess.offsetAnchor ?? 'edge',
    recess.offset,
    recess.width,
    length,
  );
  const top = recess.height === null || recess.height === undefined
    ? height
    : recess.bottom + recess.height;
  return {
    x,
    width: recess.width,
    bottom: recess.bottom,
    top,
    depth: recess.depth,
    plane: kindOf(recess) === 'projection' ? recess.depth : -recess.depth,
    offsets: positionReadouts(x, recess.width, length),
  };
}

/** A new recess centered on x, measured from the left end, numbered R1, R2… (P1, P2… for projections). */
export function createRecess({ kind = 'recess', x }, { room, wall }) {
  const length = wallLength(wall);
  const width = Math.min(DEFAULT_RECESS.width, length);
  const left = clamp(roundTo(x - width / 2, 0.5), 0, length - width);
  const count = (room?.walls ?? []).reduce((total, candidate) => (
    total + (candidate.recesses ?? []).filter((recess) => kindOf(recess) === kind).length
  ), 0);
  return {
    id: uuid(),
    kind,
    label: `${kind === 'projection' ? 'P' : 'R'}${count + 1}`,
    wallSide: wall.side ?? 'front',
    offsetFrom: 'left',
    offsetAnchor: 'edge',
    offset: left,
    width,
    bottom: 0,
    height: null,
    depth: DEFAULT_RECESS.depth,
    molding: 'crown',
  };
}

/** Size, wall bounds, and no overlap with another recess on the same face (stacked ones are fine). */
export function validateRecessPlacement(view, recess) {
  const length = wallLength(view);
  const geometry = recessGeometry(recess, length, view.height);
  if (!(geometry.width >= MIN_RECESS_WIDTH) || !(geometry.depth > 0)
    || geometry.bottom < -EPSILON || !(geometry.top > geometry.bottom + EPSILON)) {
    return { ok: false, reason: 'recess-too-small' };
  }
  if (geometry.x < -EPSILON || geometry.x + geometry.width > length + EPSILON
    || geometry.top > view.height + EPSILON) {
    return { ok: false, reason: 'recess-out-of-bounds' };
  }
  const overlaps = recessesOn(view, wallSideOf(recess)).some((other) => {
    if (other.id === recess.id) return false;
    const rect = recessGeometry(other, length, view.height);
    const across = Math.min(geometry.x + geometry.width, rect.x + rect.width) - Math.max(geometry.x, rect.x);
    const up = Math.min(geometry.top, rect.top) - Math.max(geometry.bottom, rect.bottom);
    return across > EPSILON && up > EPSILON;
  });
  return overlaps
    ? { ok: false, reason: 'recess-overlap' }
    : { ok: true, reason: null };
}

/** A new width, growing 'left', 'right' or 'both'; the offset stays in the recess's own terms. */
export function resizeRecess(recess, width, grow, length) {
  if (!Number.isFinite(width) || width <= 0) return recess;
  const { x } = recessGeometry(recess, length, 0);
  const nextX = stretchedStart(x, recess.width, width, grow);
  return {
    ...recess,
    width,
    offset: positionReadouts(nextX, width, length)[recess.offsetFrom][recess.offsetAnchor ?? 'edge'],
  };
}

/** The plane a run sits on (SPEC-38): its recess, resolved, or null on the wall face. */
export function runPlane(wall, run) {
  if (!run.recessId) return null;
  const recess = recessesOn(wall, wallSideOf(run)).find((candidate) => candidate.id === run.recessId);
  if (!recess) return null;
  const geometry = recessGeometry(recess, wallLength(wall), wall.height);
  return {
    recessId: recess.id,
    kind: kindOf(recess),
    label: recess.label,
    x: geometry.x,
    width: geometry.width,
    bottom: geometry.bottom,
    top: geometry.top,
    depth: geometry.depth,
    offset: geometry.plane,
    molding: recess.molding ?? 'crown',
  };
}

/** A run with its derived `_plane` (never saved); the same run when there's nothing to change. */
export function withRunPlane(wall, run) {
  const plane = runPlane(wall, run);
  if (plane) return { ...run, _plane: plane };
  if (run._plane === undefined) return run;
  const { _plane, ...rest } = run;
  void _plane;
  return rest;
}

/**
 * The corner a run end anchored to a recess makes (SPEC-38 §1): 'inside' where the run meets the recess's
 * side (inside a recess, or beside a projection), 'outside' where it ends at its edge (beside a recess, or
 * on a projection's face). Always square. Null when the end isn't anchored to a recess on this face.
 */
export function recessCorner(wall, run, side) {
  const anchor = run.anchors?.[side];
  if (anchor?.to !== 'recess') return null;
  const recess = recessesOn(wall, wallSideOf(run)).find((candidate) => candidate.id === anchor.recessId);
  if (!recess) return null;
  const onPlane = run.recessId === recess.id;
  const inside = onPlane === (kindOf(recess) === 'recess');
  return { type: inside ? 'inside' : 'outside', angle: 90, recess };
}

/**
 * The end a recess anchor starts with: a filler at an inside corner, unless the run's box stands out past
 * the corner's wall (past the face for a recess, past the projection's face beside one); else an end panel.
 */
export function recessEndType(wall, run, side) {
  const corner = recessCorner(wall, run, side);
  if (corner?.type !== 'inside') return 'end_panel';
  const reach = kindOf(corner.recess) === 'recess' ? 0 : corner.recess.depth;
  const boxFront = runBackOffset(withRunPlane(wall, run)) + run.depth;
  return boxFront > reach + EPSILON ? 'end_panel' : 'filler';
}

/** Resolve a recess anchor to a wall-local x on a side view; null when the recess is gone. */
export function recessAnchorDatum(view, anchor, side) {
  const recess = recessesOn(view).find((candidate) => candidate.id === anchor.recessId);
  if (!recess) return null;
  const { x, width } = recessGeometry(recess, wallLength(view), view.height);
  const edge = anchor.edge === 'left' ? x : x + width;
  const offset = anchor.offset ?? 0;
  return side === 'left' ? edge + offset : edge - offset;
}

/** Every recess edge on a side view, for snapping: { value, recessId, edge }. */
export function recessEdges(view) {
  const length = wallLength(view);
  return recessesOn(view).flatMap((recess) => {
    const { x, width } = recessGeometry(recess, length, view.height);
    return [
      { value: x, recessId: recess.id, edge: 'left' },
      { value: x + width, recessId: recess.id, edge: 'right' },
    ];
  });
}

/** The first recess (of `kinds`) on a side view whose rectangle holds a span, within a tolerance. */
export function recessForSpan(view, span, tolerance = 0, kinds = RECESS_KINDS) {
  const length = wallLength(view);
  return recessesOn(view).find((recess) => {
    if (!kinds.includes(kindOf(recess))) return false;
    const rect = recessGeometry(recess, length, view.height);
    return span.left >= rect.x - tolerance - EPSILON
      && span.right <= rect.x + rect.width + tolerance + EPSILON
      && span.bottom >= rect.bottom - tolerance - EPSILON
      && span.top <= rect.top + tolerance + EPSILON;
  }) ?? null;
}

/** A synced run's recess warnings (SPEC-38 §1): past its recess, or into a projection from the face. */
export function recessWarnings(wall, run) {
  const warnings = [];
  const plane = run._plane;
  if (plane && (run.x < plane.x - EPSILON
    || run.x + run.width > plane.x + plane.width + EPSILON
    || verticalStart(run) < plane.bottom - EPSILON
    || run.z + run.height > plane.top + EPSILON)) {
    warnings.push({ code: 'recess-overflow', recessId: plane.recessId, label: plane.label });
  }
  const length = wallLength(wall);
  for (const recess of recessesOn(wall, wallSideOf(run))) {
    if (kindOf(recess) !== 'projection' || recess.id === run.recessId) continue;
    const rect = recessGeometry(recess, length, wall.height);
    const across = Math.min(run.x + run.width, rect.x + rect.width) - Math.max(run.x, rect.x);
    const up = Math.min(run.z + run.height, rect.top) - Math.max(verticalStart(run), rect.bottom);
    if (across > EPSILON && up > EPSILON && runBackOffset(run) < rect.depth - EPSILON) {
      warnings.push({ code: 'projection-conflict', recessId: recess.id, label: recess.label });
    }
  }
  return warnings;
}

/**
 * A recess or projection in plan (SPEC-38), in face coordinates [u along the face, v out from it]:
 * `knockout` (cut out of the wall), `fill` (wall added: a deep recess's bump-out (raised or not), or a
 * projection on the floor), `lines` (its outline), `dashed` (raised off the floor: the wall is solid at the floor and only the outline shows),
 * `label` (a point). A recess at least as deep as the wall keeps the wall's thickness around it.
 */
export function recessPlanShape(recess, length, height, thickness) {
  const geometry = recessGeometry(recess, length, height);
  const a = geometry.x;
  const b = geometry.x + geometry.width;
  const d = geometry.depth;
  const dashed = geometry.bottom > EPSILON;
  if (kindOf(recess) === 'projection') {
    return {
      dashed,
      knockout: null,
      fill: dashed ? null : [[a, 0], [b, 0], [b, d], [a, d]],
      lines: [[[a, 0], [a, d]], [[a, d], [b, d]], [[b, d], [b, 0]]],
      label: [(a + b) / 2, d / 2],
    };
  }
  const deep = d >= thickness - EPSILON;
  const back = -(d + thickness);
  const outer = [a - thickness, b + thickness];
  return {
    dashed,
    knockout: dashed ? null : [[a, 0], [b, 0], [b, -d], [a, -d]],
    fill: deep
      ? [[outer[0], -thickness], [outer[1], -thickness], [outer[1], back], [outer[0], back]]
      : null,
    lines: [
      [[a, 0], [a, -d]],
      [[a, -d], [b, -d]],
      [[b, -d], [b, 0]],
      ...(deep
        ? [
            [[outer[0], -thickness], [outer[0], back]],
            [[outer[0], back], [outer[1], back]],
            [[outer[1], back], [outer[1], -thickness]],
          ]
        : []),
    ],
    label: [(a + b) / 2, -d / 2],
  };
}

/**
 * How a door or window cuts the wall in plan (SPEC-38), as offsets from the front face: from `face` back to
 * `back`. Set in a front recess, it sits at the recess back and goes through what's left behind it.
 */
export function openingPlanDepths(wall, opening) {
  const recess = opening.recessId
    ? recessesOn(wall, 'front').find((candidate) => (
      candidate.id === opening.recessId && kindOf(candidate) === 'recess'
    ))
    : null;
  if (!recess) return { face: 0, back: -wall.thickness };
  const behind = recess.depth >= wall.thickness - EPSILON
    ? wall.thickness
    : wall.thickness - recess.depth;
  return { face: -recess.depth, back: -recess.depth - behind };
}

/** The parts of [start, end] that `ranges` ({ start, end }) don't cover, left to right. */
export function uncoveredSpans(start, end, ranges) {
  const spans = [];
  let cursor = start;
  for (const range of [...ranges].sort((one, two) => one.start - two.start)) {
    if (range.start > cursor + EPSILON) spans.push({ start: cursor, end: Math.min(end, range.start) });
    cursor = Math.max(cursor, range.end);
  }
  if (end > cursor + EPSILON) spans.push({ start: cursor, end });
  return spans;
}
