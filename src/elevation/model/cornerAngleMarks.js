import { cornerAt } from './corners.js';
import { dot, scale, wallFrame } from './geometry.js';
import { wallSideView } from './wallSides.js';

/** Plan corner arcs in world coordinates, with startAngle/sweep in radians.
 * Endpoints correspond to walls; null denotes a landing host's interior (no pivot to swing).
 */
export function cornerAngleMarks(room) {
  const marks = [];
  const seen = new Set();
  for (const wall of room?.walls ?? []) {
    const frame = wallFrame(room, wall);
    for (const [side, endpoint, point] of [
      ['left', frame.leftEndpoint, frame.leftPoint],
      ['right', frame.rightEndpoint, frame.rightPoint],
    ]) {
      const corner = cornerAt(room, wall, side);
      if (!Number.isFinite(corner.angle) || Math.abs(corner.angle - 90) <= 0.5
        || Math.abs(corner.angle - 180) <= 0.5
        || Math.abs(corner.angle - 270) <= 0.5) continue;
      const neighbor = room.walls.find(({ id }) => id === corner.neighborWallId);
      if (!neighbor) continue;
      const connection = wall.connections?.[endpoint];
      const key = connection
        ? JSON.stringify([[wall.id, endpoint], [neighbor.id, connection.endpoint]].sort())
        : JSON.stringify([wall.id, endpoint]);
      if (seen.has(key)) continue;
      seen.add(key);

      const from = scale(frame.d, endpoint === 'start' ? 1 : -1);
      let to;
      if (connection) {
        to = scale(wallFrame(room, neighbor).d, connection.endpoint === 'start' ? 1 : -1);
      } else {
        const hostFrame = wallFrame(room, wallSideView(neighbor, wall.landings[endpoint].side));
        to = scale(hostFrame.r, corner.neighborSide === 'left' ? 1 : -1);
      }
      const shortSweep = Math.atan2(from.x * to.y - from.y * to.x, dot(from, to));
      const sweep = (corner.angle > 180 ? -1 : 1) * Math.sign(shortSweep)
        * corner.angle * Math.PI / 180;
      marks.push({
        point, startAngle: Math.atan2(from.y, from.x), sweep, angle: corner.angle,
        walls: [wall.id, neighbor.id], endpoints: [endpoint, connection?.endpoint ?? null],
      });
    }
  }
  return marks;
}
