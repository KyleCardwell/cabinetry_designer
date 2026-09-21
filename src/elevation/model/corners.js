import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import {
  clamp,
  dot,
  normalize,
  subtract,
  wallFrame,
} from './geometry.js';
import { roundTo } from './units.js';
import {
  wallEndPanelAt,
  wallSideOf,
  wallSideView,
  wallViewForRun,
} from './wallSides.js';

/** Return the installed front depth of a run. */
export function frontDepth(run, settings) {
  return run.depth + settings.bumperThickness + settings.doorThickness;
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

/** Classify the corner at an elevation-side end of a wall. */
export function cornerAt(room, wall, side) {
  const frame = wallFrame(room, wall);
  const endpoint = side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
  const connection = wall.connections?.[endpoint];
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

/** Return the face and back components of a corner reserve. */
export function cornerReserveParts(room, wall, side, run, settings) {
  wall = wallViewForRun(wall, run);
  const corner = cornerAt(room, wall, side);
  if (corner.type !== 'inside') {
    const override = run.cornerClearance?.[side];
    const custom = typeof override === 'number' && Number.isFinite(override);
    const panel = corner.type === 'open' ? wallEndPanelAt(room, wall, side, settings) : null;
    if (panel && !custom) return { face: panel.width, back: 0, total: panel.width, source: 'panel' };
    return {
      face: 0,
      back: 0,
      total: custom ? override : 0,
      source: custom ? 'custom' : 'auto',
    };
  }
  const override = run.cornerClearance?.[side] ?? 'auto';
  const source = typeof override === 'number' && Number.isFinite(override)
    ? 'custom'
    : override === 'face' ? 'face' : 'auto';
  const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  const sine = Math.sin(corner.angle * Math.PI / 180);
  const face = !neighbor || Math.abs(sine) < 1e-9 ? 0 : neighbor.runs.reduce((reserve, neighborRun) => {
    if (wallSideOf(neighborRun) !== corner.neighborWallSide) return reserve;
    if (neighborRun.anchors?.[corner.neighborSide] !== true) return reserve;
    if (!bandsCompatible(run, neighborRun)) return reserve;
    return Math.max(reserve, frontDepth(neighborRun, settings) / sine);
  }, 0);

  const radians = corner.angle * Math.PI / 180;
  const back = face > 0 && corner.angle < 90
    ? run.depth * (Math.cos(radians) / sine)
    : 0;
  if (source === 'custom') {
    return { face, back, total: override, source: 'custom' };
  }
  if (source === 'face') {
    return { face, back, total: face, source: 'face' };
  }

  return { face, back, total: face + back, source: 'auto' };
}

/** Return the horizontal reserve required by compatible neighboring corner runs. */
export function cornerReserve(room, wall, side, run, settings) {
  return cornerReserveParts(room, wall, side, run, settings).total;
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
