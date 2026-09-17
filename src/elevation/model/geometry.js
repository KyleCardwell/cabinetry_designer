const VECTOR_EPSILON = 1e-9;

/** Add two plan vectors. */
export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract plan vector b from a. */
export function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a plan vector. */
export function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount };
}

/** Return the dot product of two plan vectors. */
export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

/** Return the Euclidean length of a plan vector. */
export function magnitude(vector) {
  return Math.hypot(vector.x, vector.y);
}

/** Return a unit vector, or the zero vector for a degenerate input. */
export function normalize(vector) {
  const length = magnitude(vector);
  return length > VECTOR_EPSILON
    ? { x: vector.x / length, y: vector.y / length }
    : { x: 0, y: 0 };
}

/** Clamp a number to an inclusive range. */
export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Return a wall's derived finished-face length. */
export function wallLength(wall) {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function cleanVector(vector) {
  return {
    x: Math.abs(vector.x) < VECTOR_EPSILON ? 0 : vector.x,
    y: Math.abs(vector.y) < VECTOR_EPSILON ? 0 : vector.y,
  };
}

/**
 * Resolve a wall's plan and elevation coordinate frame.
 *
 * @param {object} room
 * @param {object} wall
 * @returns {{length:number,d:object,n:object,r:object,leftEndpoint:string,rightEndpoint:string,leftPoint:object,rightPoint:object}}
 */
export function wallFrame(room, wall) {
  const length = wallLength(wall);
  const d = length > VECTOR_EPSILON
    ? { x: (wall.x2 - wall.x1) / length, y: (wall.y2 - wall.y1) / length }
    : { x: 1, y: 0 };
  const nA = { x: -d.y, y: d.x };
  const nB = { x: d.y, y: -d.x };
  const walls = room?.walls?.length ? room.walls : [wall];
  const centroid = walls.reduce((sum, candidate) => ({
    x: sum.x + (candidate.x1 + candidate.x2) / 2,
    y: sum.y + (candidate.y1 + candidate.y2) / 2,
  }), { x: 0, y: 0 });
  centroid.x /= walls.length;
  centroid.y /= walls.length;
  const midpoint = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const towardCentroid = subtract(centroid, midpoint);
  const scoreA = dot(nA, towardCentroid);
  const scoreB = dot(nB, towardCentroid);
  let n = walls.length === 1 || Math.abs(scoreA - scoreB) <= VECTOR_EPSILON
    ? nA
    : (scoreA > 0 ? nA : nB);
  if (wall.flipped) n = scale(n, -1);
  n = cleanVector(n);
  const r = cleanVector({ x: n.y, y: -n.x });
  const leftEndpoint = dot(d, r) > 0 ? 'start' : 'end';
  const rightEndpoint = leftEndpoint === 'start' ? 'end' : 'start';

  return {
    length,
    d: cleanVector(d),
    n,
    r,
    leftEndpoint,
    rightEndpoint,
    leftPoint: endpointPoint(wall, leftEndpoint),
    rightPoint: endpointPoint(wall, rightEndpoint),
  };
}

/** Convert elevation x/offset coordinates into a plan point. */
export function elevationToPlan(frame, x, offset) {
  return add(frame.leftPoint, add(scale(frame.r, x), scale(frame.n, offset)));
}
