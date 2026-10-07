import {
  add,
  lineIntersection,
  magnitude,
  scale,
  subtract,
  wallFrame,
} from './geometry.js';

const MITER_LIMIT_MULTIPLIER = 4;

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function backLine(room, wall) {
  const frame = wallFrame(room, wall);
  const offset = scale(frame.n, -wall.thickness);
  const start = add({ x: wall.x1, y: wall.y1 }, offset);
  const end = add({ x: wall.x2, y: wall.y2 }, offset);
  return { start, end, direction: frame.d };
}

function backPointAt(room, wall, endpoint, ownBackLine) {
  const plainPoint = ownBackLine[endpoint];
  const connection = wall.connections?.[endpoint];
  if (!connection) return plainPoint;
  const neighbor = room.walls.find((candidate) => candidate.id === connection.wallId);
  if (!neighbor) return plainPoint;

  const neighborBackLine = backLine(room, neighbor);
  const intersection = lineIntersection(
    ownBackLine.start,
    ownBackLine.direction,
    neighborBackLine.start,
    neighborBackLine.direction,
  );
  if (!intersection) return plainPoint;

  const faceCorner = endpointPoint(wall, endpoint);
  const maximumMiter = MITER_LIMIT_MULTIPLIER * Math.max(wall.thickness, neighbor.thickness);
  return magnitude(subtract(intersection, faceCorner)) > maximumMiter
    ? plainPoint
    : intersection;
}

/**
 * Return a wall's plan polygon as face-start, face-end, back-end, back-start.
 *
 * @param {object} room
 * @param {object} wall
 * @returns {Array<{x:number,y:number}>}
 */
export function wallOutline(room, wall) {
  const faceStart = { x: wall.x1, y: wall.y1 };
  const faceEnd = { x: wall.x2, y: wall.y2 };
  const ownBackLine = backLine(room, wall);
  const backStart = backPointAt(room, wall, 'start', ownBackLine);
  const backEnd = backPointAt(room, wall, 'end', ownBackLine);
  return [faceStart, faceEnd, backEnd, backStart];
}
