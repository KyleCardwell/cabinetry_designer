import { frontDepth } from '../model/corners.js';
import { wallFrame } from '../model/geometry.js';
import { elevationKey, elevationLetters } from '../model/topology.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';

export const MARKER_RADIUS = 14;
export const MARKER_FLAG_LENGTH = 10;
export const MARKER_CLEARANCE = 6;
export const MARKER_SHIFT = 24;

export function elevationMarkers(room, settings, scale) {
  const letters = elevationLetters(room);
  const markers = [];

  for (const wall of room?.walls ?? []) {
    for (const side of ['front', 'back']) {
      const key = elevationKey(wall.id, side);
      const letter = letters.get(key);
      if (!letter) continue;

      const frame = wallSideFrame(room, wall, side);
      const mid = {
        x: (frame.leftPoint.x + frame.rightPoint.x) / 2,
        y: (frame.leftPoint.y + frame.rightPoint.y) / 2,
      };
      const deepest = (wall.runs ?? []).reduce((depth, run) => (
        wallSideOf(run) === side ? Math.max(depth, frontDepth(run, settings)) : depth
      ), 0);
      const offset = deepest + MARKER_CLEARANCE
        + (MARKER_RADIUS + MARKER_FLAG_LENGTH) / scale;
      const direction = frame.n;
      const d = wallFrame(room, wall).d;
      const shift = (side === 'front' ? 1 : -1) * MARKER_SHIFT / scale;
      const point = {
        x: mid.x + direction.x * offset + d.x * shift,
        y: mid.y + direction.y * offset + d.y * shift,
      };

      markers.push({ key, wallId: wall.id, side, letter, point, direction });
    }
  }

  return markers;
}
