import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { cornerLap } from './cornerLaps.js';
import { teamDoorStyle } from './doorStyles.js';
import {
  clamp,
  dot,
  normalize,
  scale,
  subtract,
  wallFrame,
} from './geometry.js';
import { gridLeaves } from './grid.js';
import { landingEndpoint, landingsOn } from './landings.js';
import { panelThickness } from './panelThickness.js';
import { roundTo } from './units.js';
import { runTFiller } from './styles.js';
import { isShelvesOnlyRun } from './wallEndPanels.js';
import { wallEndRoom } from './wallEndLegs.js';
import { wallEndFit } from './wallEndFit.js';
import {
  wallEndPanelAt,
  wallSideOf,
  wallSideView,
  wallViewForRun,
} from './wallSides.js';

/** How far a run's back sits from the wall face: its plane (a recess back or projection face, SPEC-38) plus its outset. */
export function runBackOffset(run) {
  return (run._plane?.offset ?? 0) + (run.outset ?? 0);
}

/** The run's front plane thickness, its thickest face (SPEC-46 P11). */
export function runFaceThickness(run, settings) {
  return run._doorThickness ?? teamDoorStyle(settings).thickness;
}

/** Face front past the box front: Euro T runs line up with their Ts. */
export function faceFrontOffset(run, settings) {
  return !run._frame && runTFiller(run)
    ? settings.teeThickness
    : settings.bumperThickness + runFaceThickness(run, settings);
}

/**
 * How far a run's front sits from the wall face: box + frame on a face frame run (SPEC-36.1),
 * else box + face offset. Panel-only and shelves-only runs reserve just their depth. May be negative in a recess.
 */
export function frontDepth(run, settings) {
  const back = runBackOffset(run);
  const leaves = run.grid ? gridLeaves(run.grid) : [];
  if (isShelvesOnlyRun(run)
    || (leaves.length > 0 && leaves.every((leaf) => leaf.kind === 'panel'))) return back + run.depth;
  if (run._frame) return back + run.depth + run._frame.thickness;
  return back + run.depth + faceFrontOffset(run, settings);
}

/** Runs back to front by face depth, so a deeper run's band returns paint over the shallower run's bands. */
export function runsByDepth(runs, settings) {
  return [...runs].sort((a, b) => frontDepth(a, settings) - frontDepth(b, settings));
}

/** Return the minimum width for a filler scribed into an angled corner. */
export function cornerFillerMin(settings, angle) {
  const base = settings.cornerFillerMinWidth;
  const sine = Math.sin(angle * Math.PI / 180);
  if (sine <= 1e-9) return 4 * base;
  return Math.min(base / sine, 4 * base);
}

/** Return whether two cabinet types occupy compatible vertical bands. */
export function bandsCompatible(a, b) {
  const aType = typeof a === 'object' ? a.cabinetTypeId : a;
  const bType = typeof b === 'object' ? b.cabinetTypeId : b;
  if (aType === CABINET_TYPE_IDS.TALL || bType === CABINET_TYPE_IDS.TALL) return true;
  return aType === bType;
}

function pointAt(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function directionFromEndpoint(wall, endpoint) {
  const corner = pointAt(wall, endpoint);
  const other = pointAt(wall, endpoint === 'start' ? 'end' : 'start');
  return normalize(subtract(other, corner));
}

function landingCorner(room, wall, frame, endpoint, landing) {
  const host = room.walls.find((candidate) => candidate.id === landing.wallId);
  if (!host) return { type: 'open' };
  const hostFrame = wallFrame(room, wallSideView(host, landing.side));
  const uA = directionFromEndpoint(wall, endpoint);
  const along = dot(frame.n, hostFrame.r);
  if (Math.abs(along) < 1e-9) return { type: 'open' };
  const uB = along > 0 ? hostFrame.r : scale(hostFrame.r, -1);
  const angle = Math.acos(clamp(dot(uA, uB), -1, 1)) * 180 / Math.PI;
  return {
    type: 'inside',
    angle,
    neighborWallId: host.id,
    neighborSide: along > 0 ? 'left' : 'right',
    neighborWallSide: landing.side,
    anchorWallId: wall.id,
  };
}

/** Classify the corner at an elevation-side end of a wall. */
export function cornerAt(room, wall, side) {
  const frame = wallFrame(room, wall);
  const endpoint = side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
  const connection = wall.connections?.[endpoint];
  const landing = wall.landings?.[endpoint];
  if (!connection && landing) return landingCorner(room, wall, frame, endpoint, landing);
  if (!connection) return { type: 'open' };

  const neighbor = room.walls.find((candidate) => candidate.id === connection.wallId);
  if (!neighbor) return { type: 'open' };
  const neighborEndpoint = connection.endpoint;
  const uA = directionFromEndpoint(wall, endpoint);
  const uB = directionFromEndpoint(neighbor, neighborEndpoint);
  const angle = Math.acos(clamp(dot(uA, uB), -1, 1)) * 180 / Math.PI;
  if (Math.abs(angle - 180) < 1) return { type: 'straight' };

  const neighborWallSide = dot(wallFrame(room, neighbor).n, uA) > 0 ? 'front' : 'back';
  const neighborFrame = wallFrame(room, wallSideView(neighbor, neighborWallSide));
  const neighborSide = neighborFrame.leftEndpoint === neighborEndpoint ? 'left' : 'right';
  const shared = { angle, neighborWallId: neighbor.id, neighborSide, neighborWallSide };
  if (dot(frame.n, uB) > 0) return { type: 'inside', ...shared };
  return { ...shared, type: 'outside', angle: 360 - angle };
}

/** Classify the corner where a host run is anchored to a landed wall's face. */
export function spanCorner(room, hostView, run, side) {
  const anchor = run.anchors?.[side];
  const host = hostView.sideSource ?? hostView;
  const hostSide = hostView.sideSource ? hostView.side : 'front';
  const neighbor = room.walls.find((candidate) => candidate.id === anchor?.wallId);
  const endpoint = neighbor ? landingEndpoint(neighbor, host.id, hostSide) : null;
  if (!neighbor || !endpoint) return { type: 'open' };

  const hostFrame = wallFrame(room, hostView);
  const uA = side === 'left' ? hostFrame.r : scale(hostFrame.r, -1);
  const uB = directionFromEndpoint(neighbor, endpoint);
  const angle = Math.acos(clamp(dot(uA, uB), -1, 1)) * 180 / Math.PI;
  const neighborWallSide = dot(wallFrame(room, neighbor).n, uA) > 0 ? 'front' : 'back';
  const neighborFrame = wallFrame(room, wallSideView(neighbor, neighborWallSide));
  const neighborSide = neighborFrame.leftEndpoint === endpoint ? 'left' : 'right';
  return {
    type: 'inside',
    angle,
    neighborWallId: neighbor.id,
    neighborSide,
    neighborWallSide,
  };
}

/** Classify the corner at a run side, including anchors to landed walls. */
export function cornerForRunSide(room, wall, run, side) {
  const view = wallViewForRun(wall, run);
  return run.anchors?.[side]?.to === 'wall'
    ? spanCorner(room, view, run, side)
    : cornerAt(room, view, side);
}

/** Return whether an anchor meets the wall represented by a corner. */
export function anchoredToCorner(anchor, corner) {
  return corner.anchorWallId
    ? anchor?.to === 'wall' && anchor.wallId === corner.anchorWallId
    : anchor === true;
}

export function defaultLegA(run) {
  return run.cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 24 : 36;
}

/** Resolve corner legs from the stored outer root column, without running layout. */
export function cornerLegs(run, side) {
  const cols = run.grid?.cols ?? [];
  const col = side === 'left' ? cols[0] : cols.at(-1);
  const legA = col?.sizeMode === 'manual' && col.size > 0 ? col.size : defaultLegA(run);
  return { legA, legB: run.ends?.[side]?.corner?.legB ?? legA };
}

/** Band-compatible runs anchored into the corner on its return wall face. */
export function cornerReturnRuns(room, wall, owner, side) {
  const view = wallViewForRun(wall, owner);
  const corner = cornerForRunSide(room, view, owner, side);
  const returnWall = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  const runs = corner.type === 'inside' ? returnWall?.runs.filter((candidate) => (
    wallSideOf(candidate) === corner.neighborWallSide
    && anchoredToCorner(candidate.anchors?.[corner.neighborSide], corner)
    && bandsCompatible(owner, candidate)
  )) ?? [] : [];
  return { corner, returnWall, runs };
}

/** Merge z-ranges and report whether they cover [z, top] with no gap. */
export function isBlindCovered(ranges, z, top) {
  if (ranges.length === 0) return false;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let [start, end] = sorted[0];

  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
      continue;
    }
    if (start <= z && end >= top) return true;
    [start, end] = [nextStart, nextEnd];
  }

  return start <= z && end >= top;
}

/** Resolve the return-side piece, including choices on inactive corner ends. */
export function cornerReturnPiece(room, wall, owner, side, settings) {
  const view = wallViewForRun(wall, owner);
  const { runs } = cornerReturnRuns(room, view, owner, side);
  const covered = isBlindCovered(runs.filter((run) => run.height > 0)
    .map((run) => [run.z, run.z + run.height]), owner.z, owner.z + owner.height);
  const corner = owner.ends?.[side]?.corner;
  const auto = (corner?.returnPiece ?? 'auto') === 'auto';
  const type = auto ? (covered ? 'none' : 'end_panel') : corner.returnPiece;
  const width = type === 'none' ? 0 : corner?.returnWidth
    ?? (type === 'filler' ? settings.fillerMinWidth : panelThickness(room, view, owner, null, settings));
  return { type, width, covered, auto };
}

/** How far the corner cabinet and its return-side piece take the return wall. */
export function cornerReach(room, wall, owner, side, settings) {
  return cornerLegs(owner, side).legB + cornerReturnPiece(room, wall, owner, side, settings).width;
}

/**
 * Host runs that pass across the landed wall at a landing corner (`corner` from cornerAt on the landed wall):
 * on the landed face, overlapping the landing in x and not anchored to it (DR5).
 */
export function crossingRuns(room, corner) {
  if (!corner.anchorWallId) return [];
  const host = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  if (!host) return [];
  const view = wallSideView(host, corner.neighborWallSide);
  const landing = landingsOn(room, view).find((entry) => entry.wallId === corner.anchorWallId);
  if (!landing) return [];
  return view.runs.filter((hostRun) => hostRun.x < landing.b - 1e-6 && hostRun.x + hostRun.width > landing.a + 1e-6
    && !['left', 'right'].some((side) => anchoredToCorner(hostRun.anchors?.[side], corner)));
}

/** Whether a corner end can occupy its square inside corner, without a crossing run. */
export function cornerEndActive(room, wall, run, side) {
  if (run.ends?.[side]?.type !== 'corner') return { active: false, code: null };
  const anchor = run.anchors?.[side];
  const corner = cornerForRunSide(room, wall, run, side);
  if ((anchor !== true && anchor?.to !== 'wall')
    || corner.type !== 'inside' || Math.abs(corner.angle - 90) > 0.5) {
    return { active: false, code: 'corner-not-in-corner' };
  }
  if (crossingRuns(room, corner).some((crossing) => bandsCompatible(run, crossing))) {
    return { active: false, code: 'corner-crossed' };
  }
  return { active: true, code: null };
}

/** The deepest front depth (along this run's wall) of band-compatible host runs crossing a landing corner. */
function crossingReserve(room, corner, run, settings, sine) {
  if (Math.abs(sine) < 1e-9) return 0;
  return crossingRuns(room, corner).reduce((reserve, hostRun) => (bandsCompatible(run, hostRun)
    ? Math.max(reserve, frontDepth(hostRun, settings) / sine) : reserve), 0);
}

/** Return the face, back, and lap components of a corner reserve and its controlling neighbor. */
export function cornerReserveParts(room, wall, side, run, settings, { laps = true } = {}) {
  wall = wallViewForRun(wall, run);
  if (run.ends?.[side]?.type === 'corner' && cornerEndActive(room, wall, run, side).active) {
    return { face: 0, back: 0, lap: 0, total: 0, source: 'corner', neighborRunId: null };
  }
  const corner = cornerForRunSide(room, wall, run, side);
  if (corner.type !== 'inside') {
    const override = run.cornerClearance?.[side];
    const custom = typeof override === 'number' && Number.isFinite(override);
    const panel = corner.type === 'open' ? wallEndPanelAt(room, wall, side, settings) : null;
    const frame = wallFrame(room, wall);
    const endpoint = side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
    const roomTaken = !custom && corner.type === 'open' ? wallEndRoom(room, wall, endpoint, settings) : null;
    if (panel && !custom) {
      const fit = wallEndFit(room, wall, endpoint, settings);
      return { face: panel.width, back: 0, lap: 0,
        total: fit.s0 === undefined ? roomTaken.panelS + panel.width
          : Math.max(roomTaken.panelS, fit.s0 + panel.width,
            ...(fit.returns ?? []).filter((ret) => ret.takesRoom).map((ret) => ret.end)),
        source: 'panel', neighborRunId: null };
    }
    return {
      face: 0,
      back: 0,
      lap: 0,
      total: custom ? override : roomTaken?.[wall.side ?? 'front'] ?? 0,
      source: custom ? 'custom' : 'auto',
      neighborRunId: null,
    };
  }
  const override = run.cornerClearance?.[side] ?? 'auto';
  const source = typeof override === 'number' && Number.isFinite(override)
    ? 'custom'
    : override === 'face' ? 'face' : 'auto';
  const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  const sine = Math.sin(corner.angle * Math.PI / 180);
  let neighborRunId = null;
  let face = !neighbor || Math.abs(sine) < 1e-9 ? 0 : neighbor.runs.reduce((reserve, neighborRun) => {
    if (wallSideOf(neighborRun) !== corner.neighborWallSide) return reserve;
    if (!anchoredToCorner(neighborRun.anchors?.[corner.neighborSide], corner)) return reserve;
    if (!bandsCompatible(run, neighborRun)) return reserve;
    const depth = frontDepth(neighborRun, settings) / sine;
    if (depth > reserve) {
      neighborRunId = neighborRun.id;
      return depth;
    }
    return reserve;
  }, 0);
  // A host run crossing a landed wall (one run across the face, the return landing on its front) reserves
  // its front depth too (DR5). It isn't the lap partner: it has no filler at the landing.
  const crossing = crossingReserve(room, corner, run, settings, sine);
  if (crossing > face) {
    face = crossing;
    neighborRunId = null;
  }

  const radians = corner.angle * Math.PI / 180;
  const back = face > 0 && corner.angle < 90
    ? run.depth * (Math.cos(radians) / sine)
    : 0;
  const decision = laps && source !== 'custom' ? cornerLap(room, wall, run, side, settings) : null;
  const lap = decision?.laps ? decision.amount / sine : 0;
  if (source === 'custom') {
    return { face, back, lap, total: override, source: 'custom', neighborRunId };
  }
  if (source === 'face') {
    return { face, back, lap, total: face - lap, source: 'face', neighborRunId };
  }

  return { face, back, lap, total: face - lap + back, source: 'auto', neighborRunId };
}

/** Return the horizontal reserve required by compatible neighboring corner runs. */
export function cornerReserve(room, wall, side, run, settings, { laps = true } = {}) {
  return cornerReserveParts(room, wall, side, run, settings, { laps }).total;
}

/**
 * Resolve an anchored run's horizontal geometry.
 *
 * @returns {{x:number,width:number,warnings:object[],errors:object[]}}
 */
export function resolveHorizontal(run, length, leftDatum, rightDatum, settings = DEFAULT_SETTINGS) {
  const warnings = [];
  const errors = [];
  let { x, width } = run;
  const left = Boolean(run.anchors?.left);
  const right = Boolean(run.anchors?.right);
  const leftX = typeof leftDatum === 'number' ? leftDatum : leftDatum?.x ?? 0;
  const rightX = typeof rightDatum === 'number'
    ? length - rightDatum
    : rightDatum?.x ?? length;

  if (left && right) {
    x = leftX;
    width = rightX - leftX;
  } else if (left) {
    x = leftX;
    if (x + width > length) {
      width = Math.max(0, length - x);
      warnings.push({ code: 'anchor-shrunk' });
    }
  } else if (right) {
    x = rightX - width;
    if (x < 0) {
      width = Math.max(0, rightX);
      x = 0;
      warnings.push({ code: 'anchor-shrunk' });
    }
  }

  x = roundTo(x, 1 / 16);
  width = roundTo(width, 1 / 16);
  if (width < settings.minRunWidth) errors.push({ code: 'anchor-too-narrow' });
  return { x, width, warnings, errors };
}
