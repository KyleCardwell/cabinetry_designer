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
      const sideRuns = (wall.runs ?? []).filter((run) => wallSideOf(run) === side);
      const deepest = sideRuns.reduce((depth, run) => Math.max(depth, frontDepth(run, settings)), 0);
      const centerX = sideRuns.length > 0
        ? (Math.min(...sideRuns.map((run) => run.x))
          + Math.max(...sideRuns.map((run) => run.x + run.width))) / 2
        : frame.length / 2;
      const shift = sideRuns.length > 0 ? 0 : (side === 'front' ? 1 : -1) * MARKER_SHIFT / scale;
      const anchor = {
        x: frame.leftPoint.x + frame.r.x * centerX,
        y: frame.leftPoint.y + frame.r.y * centerX,
      };
      const offset = deepest + MARKER_CLEARANCE
        + (MARKER_RADIUS + MARKER_FLAG_LENGTH) / scale;
      const direction = frame.n;
      const d = wallFrame(room, wall).d;
      const point = {
        x: anchor.x + direction.x * offset + d.x * shift,
        y: anchor.y + direction.y * offset + d.y * shift,
      };

      markers.push({ key, wallId: wall.id, side, letter, point, direction });
    }
  }

  return markers;
}
