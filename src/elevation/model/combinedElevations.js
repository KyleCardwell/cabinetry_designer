import { dot, normalize, subtract, wallFrame } from './geometry.js';
import {
  combinedGroups,
  elevationKey,
  faceKeyParts,
  wallHasCabinets,
} from './topology.js';
import { wallSideFrame } from './wallSides.js';

/**
 * Combined elevations (Kyle 2026-10-16): faces of separate walls that face the same way, seen together in
 * one elevation, each at its own place along the view and its own depth.
 */

const PARALLEL = 0.9998;
const PERPENDICULAR = 0.02;
const otherEnd = (endpoint) => (endpoint === 'start' ? 'end' : 'start');

function direction(wall) {
  return normalize({ x: wall.x2 - wall.x1, y: wall.y2 - wall.y1 });
}

/** The side of `wall` facing along `normal`, or null when neither face does. */
function sideFacing(room, wall, normal) {
  const facing = dot(wallFrame(room, wall).n, normal);
  if (facing > PARALLEL) return 'front';
  if (facing < -PARALLEL) return 'back';
  return null;
}

function neighborAt(room, wall, endpoint) {
  const connection = wall.connections?.[endpoint];
  const neighbor = connection ? room.walls.find((candidate) => candidate.id === connection.wallId) : null;
  return neighbor ? { wall: neighbor, endpoint: connection.endpoint } : null;
}

/** The direction a face looks out from, or null for a face that doesn't exist. */
function faceNormal(room, key) {
  const { wallId, side } = faceKeyParts(key);
  const wall = room?.walls.find((candidate) => candidate.id === wallId);
  return wall ? wallSideFrame(room, wall, side).n : null;
}

/**
 * The faces a combined elevation starts with for `key`: walking the walls connected to it both ways, each
 * wall facing the same way joins (a straight continuation), and a wall square to the way it was going is a
 * jog passed through to the wall past it. Anything else, or a back face without runs, ends the walk.
 * Starts with `key`.
 */
export function autoCombinedFaces(room, key) {
  const normal = faceNormal(room, key);
  if (!normal) return [key];
  const start = room.walls.find((wall) => wall.id === faceKeyParts(key).wallId);
  const faces = [key];
  const seen = new Set([start.id]);
  for (const endpoint of ['start', 'end']) {
    let wall = start;
    let at = endpoint;
    for (;;) {
      let next = neighborAt(room, wall, at);
      if (!next || seen.has(next.wall.id)) break;
      if (Math.abs(dot(direction(next.wall), direction(wall))) < PERPENDICULAR) {
        seen.add(next.wall.id);
        next = neighborAt(room, next.wall, otherEnd(next.endpoint));
        if (!next || seen.has(next.wall.id)) break;
      }
      const side = sideFacing(room, next.wall, normal);
      // A back face is only seen when it has runs (an island's), as in the lettering.
      if (!side || (side === 'back' && !wallHasCabinets(next.wall, 'back'))) break;
      seen.add(next.wall.id);
      faces.push(elevationKey(next.wall.id, side));
      wall = next.wall;
      at = otherEnd(next.endpoint);
    }
  }
  return faces;
}

/** Every face that could join `key`'s elevation: fronts facing the same way, and backs that have runs. */
export function combinableFaces(room, key) {
  const normal = faceNormal(room, key);
  if (!normal) return [];
  const faces = (room.wallOrder ?? []).flatMap((wallId) => {
    const wall = room.walls.find((candidate) => candidate.id === wallId);
    const side = wall ? sideFacing(room, wall, normal) : null;
    if (!side || (side === 'back' && !wallHasCabinets(wall, 'back'))) return [];
    return [elevationKey(wall.id, side)];
  });
  return faces.includes(key) ? faces : [key, ...faces];
}

/** The stored combined elevation holding a face, on or off. */
export function storedGroupOf(room, key) {
  return (room?.combinedElevations ?? []).find((group) => group.faces.includes(key)) ?? null;
}

/**
 * Where each face of a combined elevation sits (Kyle 2026-10-16), from its lead's view: `dx` along it from
 * the leftmost face's left end, `depth` toward the viewer from the lead's face (positive = nearer), its
 * length and height; and the whole elevation's length and height. Faces facing another way drop out.
 */
export function combinedLayout(room, keys) {
  const leadNormal = faceNormal(room, keys[0]);
  if (!leadNormal) return null;
  const lead = faceKeyParts(keys[0]);
  const leadFrame = wallSideFrame(room, room.walls.find((wall) => wall.id === lead.wallId), lead.side);
  const placed = keys.flatMap((key) => {
    const { wallId, side } = faceKeyParts(key);
    const wall = room.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return [];
    const frame = wallSideFrame(room, wall, side);
    if (dot(frame.n, leadNormal) < PARALLEL) return [];
    const offset = subtract(frame.leftPoint, leadFrame.leftPoint);
    return [{
      key, wallId, side, u: dot(offset, leadFrame.r), depth: dot(offset, leadFrame.n), length: frame.length, height: wall.height,
    }];
  });
  const start = Math.min(...placed.map(({ u }) => u));
  const faces = placed.map(({ u, ...face }) => ({ ...face, dx: u - start }));
  return {
    faces,
    length: Math.max(...faces.map(({ dx, length }) => dx + length)),
    height: Math.max(...faces.map(({ height }) => height)),
  };
}

/** The combined elevation a face is seen in, laid out, or null when it's seen alone. */
export function combinedViewOf(room, wallId, side = 'front') {
  const key = elevationKey(wallId, side);
  const group = combinedGroups(room).find((candidate) => candidate.faces.includes(key));
  const layout = group ? combinedLayout(room, group.faces) : null;
  return layout && layout.faces.length > 1 && layout.faces.some((face) => face.key === key)
    ? { id: group.id, ...layout }
    : null;
}
