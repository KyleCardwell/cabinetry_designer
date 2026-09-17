import { bandsCompatible, frontDepth } from './corners.js';
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
