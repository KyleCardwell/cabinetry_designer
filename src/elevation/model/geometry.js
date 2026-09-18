import { chainOrientation, wallComponents } from './topology.js';

const VECTOR_EPSILON = 1e-9;
const topologyCache = new WeakMap();

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

/** Return the 2D cross product of two plan vectors. */
export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
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

function cleanCoordinate(value) {
  const rounded = Math.round(value * 1e12) / 1e12;
  return Math.abs(value - rounded) < VECTOR_EPSILON ? rounded : value;
}

/**
 * Return the intersection of two infinite lines, or null when they are parallel.
 *
 * @param {object} pointA point on the first line
 * @param {object} directionA direction of the first line
 * @param {object} pointB point on the second line
 * @param {object} directionB direction of the second line
 * @param {number} epsilon parallel tolerance
 * @returns {{x:number,y:number}|null}
 */
export function lineIntersection(
  pointA,
  directionA,
  pointB,
  directionB,
  epsilon = 1e-6,
) {
  const denominator = cross(directionA, directionB);
  if (Math.abs(denominator) < epsilon) return null;
  const amount = cross(subtract(pointB, pointA), directionB) / denominator;
  const intersection = add(pointA, scale(directionA, amount));
  return {
    x: cleanCoordinate(intersection.x),
    y: cleanCoordinate(intersection.y),
  };
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
 * @param {object|Array<object>|null} topology optional precomputed topology
 * @returns {{length:number,d:object,n:object,r:object,leftEndpoint:string,rightEndpoint:string,leftPoint:object,rightPoint:object}}
 */
export function wallFrame(room, wall, topology = null) {
  const length = wallLength(wall);
  const d = length > VECTOR_EPSILON
    ? { x: (wall.x2 - wall.x1) / length, y: (wall.y2 - wall.y1) / length }
    : { x: 1, y: 0 };
  let resolvedTopology = topology;
  if (!resolvedTopology && room && typeof room === 'object') {
    resolvedTopology = topologyCache.get(room);
    if (!resolvedTopology) {
      const components = wallComponents(room);
      const entries = new Map();
      for (const component of components) {
        const orientation = chainOrientation(room, component);
        for (const entry of component.walls) entries.set(entry.wallId, { entry, orientation });
      }
      resolvedTopology = { components, entries };
      topologyCache.set(room, resolvedTopology);
    }
  }
  if (Array.isArray(resolvedTopology)) {
    const entries = new Map();
    for (const component of resolvedTopology) {
      const orientation = chainOrientation(room, component);
      for (const entry of component.walls) entries.set(entry.wallId, { entry, orientation });
    }
    resolvedTopology = { components: resolvedTopology, entries };
  }
  const chain = resolvedTopology?.entries?.get(wall.id);
  const from = chain?.entry?.from ?? 'start';
  const to = chain?.entry?.to ?? 'end';
  const fromPoint = endpointPoint(wall, from);
  const toPoint = endpointPoint(wall, to);
  const t = length > VECTOR_EPSILON ? normalize(subtract(toPoint, fromPoint)) : d;
  const orientation = chain?.orientation ?? 1;
  let n = orientation > 0
    ? { x: -t.y, y: t.x }
    : { x: t.y, y: -t.x };
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

/** Project a plan point onto a wall's elevation x axis. */
export function planPointToWallX(frame, point) {
  return dot(subtract(point, frame.leftPoint), frame.r);
}
