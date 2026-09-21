import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { wallLength } from './geometry.js';
import { landingsOn } from './landings.js';
import { moldingStack } from './profile.js';
import { roundTo } from './units.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

const SPAN_EPSILON = 1e-6;

export const SOFFIT_MOLDINGS = ['crown', 'topMold', 'none'];

/** Return the soffits visible on one side of a wall. */
export function soffitsOn(wallOrView, side = wallOrView.side ?? 'front') {
  const wall = wallOrView.sideSource ?? wallOrView;
  return (wall.soffits ?? []).filter((soffit) => wallSideOf(soffit) === side);
}

function anchoredDatum(room, view, anchor, side) {
  if (!anchor) return null;
  const offset = anchor.offset ?? 0;
  if (anchor.to === 'end') {
    return side === 'left' ? offset : wallLength(view) - offset;
  }
  if (anchor.to === 'wall') {
    const interval = landingsOn(room, view).find((entry) => entry.wallId === anchor.wallId);
    if (!interval) return null;
    return side === 'left' ? interval.b + offset : interval.a - offset;
  }
  return null;
}

/** Resolve a soffit's persisted span from any anchored ends. */
export function resolveSoffitSpan(room, view, soffit) {
  const left = anchoredDatum(room, view, soffit.anchors?.left, 'left');
  const right = anchoredDatum(room, view, soffit.anchors?.right, 'right');
  if (left !== null && right !== null) return { x: left, width: right - left };
  if (left !== null) return { x: left, width: soffit.width };
  if (right !== null) return { x: right - soffit.width, width: soffit.width };
  return { x: soffit.x, width: soffit.width };
}

/** Return the cabinet-to-soffit molding height for a resolved profile. */
export function soffitMoldingDrop(molding, profile) {
  if (molding === 'crown') return moldingStack(profile);
  if (molding === 'topMold') return profile.topMoldHeight;
  return 0;
}

/** Return the lowest soffit that fully covers an upper or tall run. */
export function soffitOverRun(wall, run) {
  if (run.cabinetTypeId !== CABINET_TYPE_IDS.UPPER
    && run.cabinetTypeId !== CABINET_TYPE_IDS.TALL) return null;
  const runRight = run.x + run.width;
  return soffitsOn(wall, wallSideOf(run))
    .filter((soffit) => (
      run.x >= soffit.x - SPAN_EPSILON
      && runRight <= soffit.x + soffit.width + SPAN_EPSILON
    ))
    .sort((a, b) => a.bottom - b.bottom)[0] ?? null;
}

/** Apply a covering soffit's box-top limit to a run profile. */
export function profileUnderSoffit(profile, wall, run) {
  const soffit = soffitOverRun(wallViewForRun(wall, run), run);
  return soffit
    ? { ...profile, boxTop: soffit.bottom - soffitMoldingDrop(soffit.molding, profile) }
    : profile;
}

/** Return the molding used above a run. */
export function runMolding(wall, run) {
  return soffitOverRun(wallViewForRun(wall, run), run)?.molding ?? 'crown';
}

/** Return soffit collisions for a run's current resolved box. */
export function soffitConflicts(wall, run) {
  const runRight = run.x + run.width;
  return soffitsOn(wall, wallSideOf(run)).flatMap((soffit) => {
    const overlap = Math.min(runRight, soffit.x + soffit.width) - Math.max(run.x, soffit.x);
    return overlap > SPAN_EPSILON && run.z + run.height > soffit.bottom
      ? [{ code: 'soffit-conflict', soffitId: soffit.id }]
      : [];
  });
}

/** Resolve a run anchor against the requested side of a soffit. */
export function soffitAnchorDatum(view, anchor, side) {
  const soffit = soffitsOn(view).find((candidate) => candidate.id === anchor.soffitId);
  if (!soffit) return null;
  const offset = anchor.offset ?? 0;
  return side === 'left'
    ? soffit.x + soffit.width + offset
    : soffit.x - offset;
}

/** Choose the default exposed-end treatment beside a soffit. */
export function soffitEndType(wall, run, side, anchor, settings) {
  const view = wallViewForRun(wall, run);
  const soffit = soffitsOn(view).find((candidate) => candidate.id === anchor.soffitId);
  if (!soffit) return 'end_panel';
  const soffitEdge = side === 'left' ? soffit.x + soffit.width : soffit.x;
  const adjacent = (view.runs ?? []).some((candidate) => {
    if (candidate.id === run.id || soffitOverRun(view, candidate)?.id !== soffit.id) return false;
    const candidateEdge = side === 'left'
      ? candidate.x + candidate.width
      : candidate.x;
    return Math.abs(candidateEdge - soffitEdge) <= settings.adjacentRunGap;
  });
  return adjacent ? 'filler' : 'end_panel';
}

function nearestWallAnchor(room, wall, x, side, distance) {
  const datumKey = side === 'left' ? 'b' : 'a';
  const matches = landingsOn(room, wall)
    .map((landing) => ({ landing, distance: Math.abs(x - landing[datumKey]) }))
    .filter((entry) => entry.distance <= distance)
    .sort((a, b) => a.distance - b.distance);
  return matches[0]
    ? { to: 'wall', wallId: matches[0].landing.wallId, offset: 0 }
    : false;
}

/** Create a persisted soffit shape from a draw gesture. */
export function createSoffit({ x, width, bottomZ }, { settings, room, wall }) {
  const left = roundTo(x, 0.5);
  const right = roundTo(x + width, 0.5);
  const snapDistance = settings.cornerSnapDistance
    ?? DEFAULT_SETTINGS.cornerSnapDistance;
  const length = wallLength(wall);
  const leftAnchor = Math.abs(left) <= snapDistance
    ? { to: 'end', offset: 0 }
    : nearestWallAnchor(room, wall, left, 'left', snapDistance);
  const rightAnchor = Math.abs(right - length) <= snapDistance
    ? { to: 'end', offset: 0 }
    : nearestWallAnchor(room, wall, right, 'right', snapDistance);
  return {
    id: uuid(),
    wallSide: wall.side ?? 'front',
    x: left,
    width: right - left,
    bottom: roundTo(bottomZ, 0.5),
    depth: settings.defaultSoffitDepth,
    molding: settings.defaultSoffitMolding,
    anchors: { left: leftAnchor, right: rightAnchor },
  };
}

/** Validate a soffit against its wall bounds and peers. */
export function validateSoffitPlacement(view, soffit) {
  if (!(soffit.width > 0) || !(soffit.depth > 0)
    || !(soffit.bottom > 0) || !(soffit.bottom < view.height)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const right = soffit.x + soffit.width;
  const overlaps = soffitsOn(view, wallSideOf(soffit)).some((candidate) => (
    candidate.id !== soffit.id
    && Math.min(right, candidate.x + candidate.width) - Math.max(soffit.x, candidate.x)
      > SPAN_EPSILON
  ));
  return overlaps
    ? { ok: false, reason: 'soffit-overlap' }
    : { ok: true, reason: null };
}
