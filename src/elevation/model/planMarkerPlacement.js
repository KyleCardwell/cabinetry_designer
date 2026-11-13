import { dot, elevationToPlan, planPointToWallX, subtract } from './geometry.js';
import { planSideReach } from './planDimensions.js';
import { combinedGroups, faceKeyParts } from './topology.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

/**
 * Where an elevation's plan marker sits, on its lead face's frame, before the symbol is added. A face alone
 * centres on its runs (its length when it has none); a combined elevation (Kyle 2026-10-23) centres on all
 * its faces' walls and clears the deepest cabinets and dimension rows of any of them. `rowsAt(wall, side)`
 * gives where a face's rows end (or null); `clearance` is the gap past the cabinets.
 */
export function planMarkerPlacement(room, key, settings, { clearance, rowsAt }) {
  const wallById = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  const group = combinedGroups(room).find(({ faces }) => faces.includes(key));
  const lead = faceKeyParts(key);
  const frame = wallSideFrame(room, wallById.get(lead.wallId), lead.side);
  const faces = (group?.faces ?? [key]).map(faceKeyParts).filter(({ wallId }) => wallById.has(wallId));
  let low = Infinity;
  let high = -Infinity;
  let offset = 0;
  let hasRuns = false;
  for (const { wallId, side } of faces) {
    const wall = wallById.get(wallId);
    const faceFrame = wallSideFrame(room, wall, side);
    const runs = (wall.runs ?? []).filter((run) => wallSideOf(run) === side);
    hasRuns ||= runs.length > 0;
    const span = group || runs.length === 0 ? [0, faceFrame.length]
      : [Math.min(...runs.map((run) => run.x)), Math.max(...runs.map((run) => run.x + run.width))];
    const reach = Math.max(planSideReach(room, wall, side, settings) + clearance, rowsAt(wall, side) ?? 0);
    for (const x of span) {
      const point = elevationToPlan(faceFrame, x, reach);
      const along = planPointToWallX(frame, point);
      low = Math.min(low, along);
      high = Math.max(high, along);
      offset = Math.max(offset, dot(subtract(point, frame.leftPoint), frame.n));
    }
  }
  return { frame, center: (low + high) / 2, offset, hasRuns };
}
