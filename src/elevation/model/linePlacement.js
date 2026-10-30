/**
 * Layout lines placing things (LL3: openings; LL4 adds runs and cells). See plans/LAYOUT-PLAN.md.
 * The line is the hard stop: an attached thing's `at` point sits on line + offset. No snap, no clamp;
 * validation reports what doesn't fit.
 */
import { wallFrame } from './geometry.js';
import { findLine, lineX } from './layoutLines.js';
import { openingReferenceRect } from './openings.js';
import { positionReadouts } from './positions.js';
import { wallSideOf } from './wallSides.js';

const EPSILON = 1e-9;
const MIRROR_AT = { left: 'right', center: 'center', right: 'left' };
const AT_FRACTION = { left: 0, center: 0.5, right: 1 };

/** Where an attachment's point sits, in front-face coordinates, and which front-face point it is. */
export function attachPoint(line, attach, wallLength) {
  const onFace = lineX(line, wallLength) + attach.offset;
  if (wallSideOf(line) === 'back') {
    return { x: wallLength - onFace, at: MIRROR_AT[attach.at] };
  }
  return { x: onFace, at: attach.at };
}

/** The opening with its stored offset rewritten so its `at` point sits on the line (same object when it already does). */
export function placeOpeningOnLine(opening, line, wallLength, settings) {
  if (!opening.attach || !line) return opening;
  const reference = openingReferenceRect(opening, wallLength, settings);
  const { x, at } = attachPoint(line, opening.attach, wallLength);
  const left = x - AT_FRACTION[at] * reference.width;
  const offset = positionReadouts(left, reference.width, wallLength)
    [opening.offsetFrom][opening.offsetAnchor ?? 'edge'];
  return Math.abs(offset - opening.offset) < EPSILON ? opening : { ...opening, offset };
}

/** The attachment offset that puts the opening's `at` point exactly where the opening already is. */
export function attachOffsetHere(opening, line, at, wallLength, settings) {
  const reference = openingReferenceRect(opening, wallLength, settings);
  const back = wallSideOf(line) === 'back';
  const frontAt = back ? MIRROR_AT[at] : at;
  const point = reference.x + AT_FRACTION[frontAt] * reference.width;
  const onFace = back ? wallLength - point : point;
  return onFace - lineX(line, wallLength);
}

function placeWallOpenings(room, wall, settings) {
  if (!wall.openings?.some((opening) => opening.attach)) return wall;
  const length = wallFrame(room, wall).length;
  let changed = false;
  const openings = wall.openings.map((opening) => {
    if (!opening.attach) return opening;
    const placed = placeOpeningOnLine(opening, findLine(wall, opening.attach.lineId), length, settings);
    if (placed !== opening) changed = true;
    return placed;
  });
  return changed ? { ...wall, openings } : wall;
}

/** Sync stage: every attached opening on every wall takes its position from its line. */
export function placeAttachedOpenings(room, settings) {
  let changed = false;
  const walls = room.walls.map((wall) => {
    const placed = placeWallOpenings(room, wall, settings);
    if (placed !== wall) changed = true;
    return placed;
  });
  return changed ? { ...room, walls } : room;
}
