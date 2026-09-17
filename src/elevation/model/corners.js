import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import {
  clamp,
  dot,
  normalize,
  subtract,
  wallFrame,
} from './geometry.js';
import { roundTo } from './units.js';

/** Return the installed front depth of a run. */
export function frontDepth(run, settings) {
  return run.depth + settings.bumperThickness + settings.doorThickness;
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
  const neighborFrame = wallFrame(room, neighbor);
  const neighborEndpoint = connection.endpoint;
  const neighborSide = neighborFrame.leftEndpoint === neighborEndpoint ? 'left' : 'right';
  const uA = directionFromEndpoint(wall, endpoint);
  const uB = directionFromEndpoint(neighbor, neighborEndpoint);
  const angle = Math.acos(clamp(dot(uA, uB), -1, 1)) * 180 / Math.PI;
  const shared = { angle, neighborWallId: neighbor.id, neighborSide };

  if (Math.abs(angle - 180) < 1) return { type: 'straight' };
  if (dot(frame.n, uB) > 0) return { type: 'inside', ...shared };
  return { type: 'outside', angle: 360 - angle, neighborWallId: neighbor.id, neighborSide };
}

/** Return the horizontal reserve required by compatible neighboring corner runs. */
export function cornerReserve(room, wall, side, run, settings) {
  const corner = cornerAt(room, wall, side);
  if (corner.type !== 'inside') return 0;
  const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  if (!neighbor) return 0;
  const sine = Math.sin(corner.angle * Math.PI / 180);
  if (Math.abs(sine) < 1e-9) return 0;

  return neighbor.runs.reduce((reserve, neighborRun) => {
    if (!neighborRun.anchors?.[corner.neighborSide]) return reserve;
    if (!bandsCompatible(run, neighborRun)) return reserve;
    return Math.max(reserve, frontDepth(neighborRun, settings) / sine);
  }, 0);
}

/**
 * Resolve an anchored run's horizontal geometry.
 *
 * @returns {{x:number,width:number,warnings:object[],errors:object[]}}
 */
export function resolveHorizontal(run, length, reserveLeft, reserveRight, settings = DEFAULT_SETTINGS) {
  const warnings = [];
  const errors = [];
  let { x, width } = run;
  const left = Boolean(run.anchors?.left);
  const right = Boolean(run.anchors?.right);

  if (left && right) {
    x = reserveLeft;
    width = length - reserveLeft - reserveRight;
  } else if (left) {
    x = reserveLeft;
    if (x + width > length) {
      width = Math.max(0, length - x);
      warnings.push({ code: 'anchor-shrunk' });
    }
  } else if (right) {
    x = length - reserveRight - width;
    if (x < 0) {
      width = Math.max(0, length - reserveRight);
      x = 0;
      warnings.push({ code: 'anchor-shrunk' });
    }
  }

  x = roundTo(x, 1 / 16);
  width = roundTo(width, 1 / 16);
  if (width < settings.minRunWidth) errors.push({ code: 'anchor-too-narrow' });
  return { x, width, warnings, errors };
}
