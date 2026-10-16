import { DEFAULT_SETTINGS } from './constants.js';
import { cornerLap } from './cornerLaps.js';
import {
  cornerAt,
  cornerFillerMin,
  cornerForRunSide,
  cornerReserve,
  cornerReserveParts,
  resolveHorizontal,
} from './corners.js';
import { followInset } from './extensions.js';
import {
  isFollowAnchor,
  isJointAnchor,
  jointEdgeX,
  jointMembers,
  runShortLabel,
} from './joints.js';
import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { recessAnchorDatum, recessCorner, recessesOn } from './recesses.js';
import { wallLength } from './geometry.js';
import { verticalStart } from './overlap.js';
import { endCoverOn, isInsetStyle, resolveStyle, styleReveals } from './styles.js';
import { soffitAnchorDatum } from './soffits.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';
import { wallViewForRun } from './wallSides.js';

const PIN_EPSILON = 1e-6;

/**
 * The corner a run side meets, and whether the side is anchored into it: a wall end, a wing wall, or the
 * side of a recess or projection (SPEC-38), which is always square.
 */
function runSideCorner(room, wall, run, side) {
  const recess = recessCorner(wall, run, side);
  if (recess) return { type: recess.type, angle: recess.angle, anchored: true };
  const anchor = run.anchors?.[side];
  return {
    ...cornerForRunSide(room, wall, run, side),
    anchored: anchor === true || anchor?.to === 'wall',
  };
}

/** Return per-side flex-filler minimums for a run in its room context. */
export function endMinWidthsForRun(room, wall, run, settings) {
  wall = wallViewForRun(wall, run);
  const style = resolveStyle(settings, room, run);
  const inset = isInsetStyle(style);
  // A face frame's whole stile clears the corner, box-to-opening included (SPEC-36.1).
  const frameReveal = inset ? styleReveals(style, run.cabinetTypeId, settings).left + (run._frame?.bead ?? 0) : 0;
  // So does a Euro T end's flat: the filler is the cover narrower (SPEC-37.1).
  const teeCover = (side) => (!inset && run.ends?.[side]?.type === 'filler' && endCoverOn(run, side)
    ? settings.teeCover
    : 0);
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = runSideCorner(room, wall, run, side);
    return [
      side,
      corner.anchored && corner.type === 'inside'
        ? Math.max(0, cornerFillerMin(settings, corner.angle) - frameReveal - teeCover(side))
          + cornerReserveParts(room, wall, side, run, settings).lap
        : settings.fillerMinWidth,
    ];
  }));
}

/** Return per-side corner angles for anchored inside-corner fillers. */
export function endCornerAnglesForRun(room, wall, run) {
  wall = wallViewForRun(wall, run);
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = runSideCorner(room, wall, run, side);
    return [side, corner.anchored && corner.type === 'inside' ? corner.angle : undefined];
  }));
}

function openingAnchorDatum(anchor, side, wall, length, settings) {
  const opening = (wall.openings ?? []).find(
    (candidate) => candidate.id === anchor.openingId,
  );
  if (!opening) return { error: { code: 'anchor-opening-missing', side } };
  const geometry = openingGeometry(opening, length, settings);
  const edge = anchor.edge === 'jamb' ? geometry.jamb : geometry.casing ?? geometry.jamb;
  const clearance = anchor.clearance
    ?? settings.casingClearance
    ?? DEFAULT_SETTINGS.casingClearance;
  return {
    x: side === 'left'
      ? edge.x + edge.width + clearance
      : edge.x - clearance,
    opening,
    clearance,
    edge: anchor.edge,
  };
}

/** Resolve a run anchor into an absolute wall-local datum. */
export function resolveRunAnchorDatum(room, wall, run, side, settings, { laps = true } = {}) {
  wall = wallViewForRun(wall, run);
  const anchor = run.anchors?.[side];
  const length = wallLength(wall);
  if (anchor === true) {
    const reserve = cornerReserve(room, wall, side, run, settings, { laps });
    return { x: side === 'left' ? reserve : length - reserve, type: 'corner' };
  }
  if (anchor?.to === 'opening') {
    return { ...openingAnchorDatum(anchor, side, wall, length, settings), type: 'opening' };
  }
  if (anchor?.to === 'soffit') {
    const x = soffitAnchorDatum(wall, anchor, side);
    return x === null
      ? { error: { code: 'anchor-soffit-missing', side } }
      : { x, type: 'soffit', soffitId: anchor.soffitId };
  }
  if (anchor?.to === 'recess') {
    const x = recessAnchorDatum(wall, anchor, side);
    return x === null
      ? { error: { code: 'anchor-recess-missing', side } }
      : { x, type: 'recess', recessId: anchor.recessId };
  }
  if (anchor?.to === 'wall') {
    const interval = landingsOn(room, wall).find((entry) => entry.wallId === anchor.wallId);
    if (!interval) return { error: { code: 'anchor-wall-missing', side } };
    const reserve = cornerReserve(room, wall, side, run, settings, { laps });
    return {
      x: side === 'left' ? interval.b + reserve : interval.a - reserve,
      type: 'wall',
    };
  }
  if (isJointAnchor(anchor)) {
    const joint = (wall.joints ?? []).find((candidate) => candidate.id === anchor.jointId);
    if (!joint) return { error: { code: 'anchor-joint-missing', side } };
    return {
      x: jointEdgeX(joint, side, anchor.offset),
      type: 'joint',
      jointId: anchor.jointId,
    };
  }
  if (isFollowAnchor(anchor)) {
    const leader = wall.runs.find((candidate) => candidate.id === anchor.runId);
    if (!leader) return { error: { code: 'anchor-run-missing', side } };
    const edge = anchor.side === 'left' ? leader.x : leader.x + leader.width;
    const inset = side === anchor.side ? followInset(wall, leader, run, side, settings) : 0;
    return {
      x: jointEdgeX({ x: edge + inset }, side, anchor.offset),
      type: 'follow',
      runId: anchor.runId,
    };
  }
  return { x: side === 'left' ? run.x : run.x + run.width, type: 'free' };
}

/** Describe a resolved wall-end or opening anchor in shop language. */
export function describeAnchor(room, wall, run, side, settings) {
  wall = wallViewForRun(wall, run);
  const anchor = run.anchors?.[side];
  if (!anchor) return '';
  if (anchor?.to === 'opening') {
    const resolved = resolveRunAnchorDatum(room, wall, run, side, settings);
    if (resolved.error || !resolved.opening) return 'Anchored opening is missing';
    const amount = resolved.clearance;
    return amount < 0
      ? `${formatInches(Math.abs(amount))} into ${resolved.opening.label} ${anchor.edge}`
      : `${formatInches(amount)} clear of ${resolved.opening.label} ${anchor.edge}`;
  }
  if (isJointAnchor(anchor)) {
    const otherMember = jointMembers(wall, anchor.jointId)
      .find((member) => member.runId !== run.id || member.side !== side);
    const otherRun = wall.runs.find((candidate) => candidate.id === otherMember?.runId);
    const label = otherRun ? runShortLabel(otherRun) : 'Run';
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `Joined to ${label} · ${relation}`;
  }
  if (isFollowAnchor(anchor)) {
    const leader = wall.runs.find((candidate) => candidate.id === anchor.runId);
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `Follows ${leader ? runShortLabel(leader) : 'a missing run'} · ${relation}`;
  }
  if (anchor?.to === 'soffit') {
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `Against soffit · ${relation}`;
  }
  if (anchor?.to === 'recess') {
    const recess = recessesOn(wall).find((candidate) => candidate.id === anchor.recessId);
    if (!recess) return 'Anchored recess is missing';
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `${recess.label} ${anchor.edge} side · ${relation}`;
  }
  if (anchor?.to === 'wall') {
    const anchoredWall = room.walls.find((candidate) => candidate.id === anchor.wallId);
    if (!anchoredWall) return 'Anchored wall is missing';
    const parts = cornerReserveParts(room, wall, side, run, settings);
    let relation = 'flush';
    if (parts.source === 'custom' && parts.total !== 0) {
      relation = parts.total < 0
        ? `${formatInches(Math.abs(parts.total))} past`
        : `held back ${formatInches(parts.total)}`;
    } else if (parts.source === 'auto' && parts.total > 0) {
      relation = `reserve ${formatInches(parts.total)}`;
    }
    return `Against ${wallLabel(room, anchoredWall)} · ${relation}`;
  }

  const corner = cornerAt(room, wall, side);
  const parts = cornerReserveParts(room, wall, side, run, settings);
  if (corner.type !== 'inside') {
    if (parts.source === 'panel') return `Wall end panel ${formatInches(parts.total)}`;
    if (parts.source === 'auto') return 'Flush with the wall end';
    return parts.total < 0
      ? `${formatInches(Math.abs(parts.total))} past the wall end`
      : `Held back ${formatInches(parts.total)}`;
  }
  const resolved = `Reserve ${formatInches(parts.total)}`;
  const lap = parts.lap > 0 ? ` − lap ${formatInches(parts.lap)}` : '';
  if (parts.source === 'face') return `${resolved} · Face only${lap ? ` (face ${formatInches(parts.face)}${lap})` : ''}`;
  if (parts.source === 'custom') return `${resolved} · Custom`;
  return `${resolved} (face ${formatInches(parts.face)} + back ${formatInches(parts.back)}${lap})`;
}

function horizontalResolution(room, wall, run, settings, { laps = true } = {}) {
  const length = wallLength(wall);
  const left = resolveRunAnchorDatum(room, wall, run, 'left', settings, { laps });
  const right = resolveRunAnchorDatum(room, wall, run, 'right', settings, { laps });
  const errors = [left.error, right.error].filter(Boolean);
  if (Boolean(run.anchors?.left) && Boolean(run.anchors?.right)
    && !left.error && !right.error && right.x < left.x) {
    errors.push({ code: 'anchor-opening-overlap' });
  }
  if (errors.length > 0) {
    return {
      x: run.x,
      width: run.width - (laps ? 0 : run._cornerLapWidth ?? 0),
      lapWidth: laps ? run._cornerLapWidth ?? 0 : 0,
      warnings: [], errors,
    };
  }
  // Resolved spans carry their added lap width only in memory. Start from the laps-off width so
  // syncing again (or changing a manual choice) cannot grow a run a second time.
  let width = run.width - (run._cornerLapWidth ?? 0);
  const anchored = ['left', 'right'].filter((side) => run.anchors?.[side]);
  if (laps && anchored.length === 1) {
    width += cornerReserveParts(room, wall, anchored[0], run, settings).lap;
  }
  const resolved = resolveHorizontal({ ...run, width }, length, left, right, settings);
  const lapWidth = laps
    ? resolved.width - horizontalResolution(room, wall, run, settings, { laps: false }).width
    : 0;
  return { ...resolved, lapWidth, errors: [...errors, ...resolved.errors] };
}

/** Report conflicting manual corner choices on each affected run. */
export function cornerLapWarnings(room, wall, run, settings) {
  return ['left', 'right'].flatMap((side) => {
    const decision = cornerLap(room, wall, run, side, settings);
    return decision?.conflict ? [{
      code: 'corner-lap-conflict', side, laps: decision.laps,
    }] : [];
  });
}

function casingClearanceWarnings(run, wall, length, settings) {
  wall = wallViewForRun(wall, run);
  const required = settings.casingClearance ?? DEFAULT_SETTINGS.casingClearance;
  if (!(required > 0)) return [];
  const runBottom = verticalStart(run);
  const runTop = run.z + run.height;
  return (wall.openings ?? []).flatMap((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    if (Math.min(runTop, geometry.jamb.z + geometry.jamb.height)
      - Math.max(runBottom, geometry.jamb.z) <= PIN_EPSILON) return [];
    const casing = geometry.casing ?? geometry.jamb;
    const candidates = [];
    if (!run.anchors?.right && run.x + run.width <= casing.x + PIN_EPSILON) {
      const gap = casing.x - (run.x + run.width);
      if (gap < required - PIN_EPSILON) candidates.push({ side: 'left', gap });
    }
    const casingRight = casing.x + casing.width;
    if (!run.anchors?.left && run.x >= casingRight - PIN_EPSILON) {
      const gap = run.x - casingRight;
      if (gap < required - PIN_EPSILON) candidates.push({ side: 'right', gap });
    }
    return candidates.map(({ side, gap }) => ({
      code: 'casing-clearance',
      openingId: opening.id,
      label: opening.label,
      side,
      gap,
      required,
    }));
  });
}

export { horizontalResolution, casingClearanceWarnings };
