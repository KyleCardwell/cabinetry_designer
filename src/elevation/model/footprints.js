import { bandsCompatible, frontDepth } from './corners.js';
import { CABINET_TYPE_IDS } from './constants.js';
import { elevationToPlan, wallFrame } from './geometry.js';

/** Return the four-point plan polygon occupied by a run. */
export function runFootprint(frame, run, settings) {
  const depth = frontDepth(run, settings);
  return [
    elevationToPlan(frame, run.x, 0),
    elevationToPlan(frame, run.x + run.width, 0),
    elevationToPlan(frame, run.x + run.width, depth),
    elevationToPlan(frame, run.x, depth),
  ];
}

function pointOnSegment(point, start, end) {
  const segmentCross = cross(start, end, point);
  if (Math.abs(segmentCross) > 1e-9) return false;
  return point.x >= Math.min(start.x, end.x) - 1e-9
    && point.x <= Math.max(start.x, end.x) + 1e-9
    && point.y >= Math.min(start.y, end.y) - 1e-9
    && point.y <= Math.max(start.y, end.y) + 1e-9;
}

function polygonContainsPoint(polygon, point) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const start = polygon[previous];
    const end = polygon[index];
    if (pointOnSegment(point, start, end)) return true;
    const crossesRay = (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (crossesRay) inside = !inside;
  }
  return inside;
}

/** Return run ids under a plan point in visual stacking order. */
export function footprintsAtPoint(room, point, settings) {
  if (!room || !point) return [];
  const upper = [];
  const lower = [];

  for (const wall of room.walls ?? []) {
    const frame = wallFrame(room, wall);
    for (const run of wall.runs ?? []) {
      const target = run.cabinetTypeId === CABINET_TYPE_IDS.UPPER ? upper : lower;
      target.push({
        id: run.id,
        containsPoint: polygonContainsPoint(runFootprint(frame, run, settings), point),
      });
    }
  }

  return [...upper.reverse(), ...lower.reverse()]
    .filter((entry) => entry.containsPoint)
    .map((entry) => entry.id);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersection(start, end, clipStart, clipEnd) {
  const segment = { x: end.x - start.x, y: end.y - start.y };
  const clip = { x: clipEnd.x - clipStart.x, y: clipEnd.y - clipStart.y };
  const denominator = segment.x * clip.y - segment.y * clip.x;
  if (Math.abs(denominator) < 1e-12) return end;
  const delta = { x: clipStart.x - start.x, y: clipStart.y - start.y };
  const t = (delta.x * clip.y - delta.y * clip.x) / denominator;
  return { x: start.x + t * segment.x, y: start.y + t * segment.y };
}

function clipPolygon(subject, clip) {
  let output = subject;
  for (let index = 0; index < clip.length; index += 1) {
    const clipStart = clip[index];
    const clipEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    if (input.length === 0) break;
    let start = input[input.length - 1];
    for (const end of input) {
      const endInside = cross(clipStart, clipEnd, end) >= -1e-9;
      const startInside = cross(clipStart, clipEnd, start) >= -1e-9;
      if (endInside) {
        if (!startInside) output.push(intersection(start, end, clipStart, clipEnd));
        output.push(end);
      } else if (startInside) {
        output.push(intersection(start, end, clipStart, clipEnd));
      }
      start = end;
    }
  }
  return output;
}

/** Return the area of overlap between two convex polygons. */
export function polygonOverlap(a, b) {
  const polygon = clipPolygon(a, b);
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return Math.abs(twiceArea) / 2;
}

/** Find cross-wall run footprint collisions and report both affected runs. */
export function findCollisions(room, settings) {
  const entries = room.walls.flatMap((wall) => {
    const frame = wallFrame(room, wall);
    return wall.runs.map((run) => ({ wall, run, polygon: runFootprint(frame, run, settings) }));
  });
  const collisions = [];
  for (let aIndex = 0; aIndex < entries.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < entries.length; bIndex += 1) {
      const a = entries[aIndex];
      const b = entries[bIndex];
      if (a.wall.id === b.wall.id || !bandsCompatible(a.run, b.run)) continue;
      if (polygonOverlap(a.polygon, b.polygon) <= 1e-3) continue;
      collisions.push({ code: 'corner-collision', runId: a.run.id, otherRunId: b.run.id });
      collisions.push({ code: 'corner-collision', runId: b.run.id, otherRunId: a.run.id });
    }
  }
  return collisions;
}
