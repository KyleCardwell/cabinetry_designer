import { dot, wallFrame } from '../model/geometry.js';
import { landingOffsetFor, landingReferenceDirection } from '../model/landings.js';
import { wallSideFrame } from '../model/wallSides.js';
import { wallLabel } from '../model/topology.js';
import { moveWallPerpendicular, setWallLength } from './wallOps.js';

/** Change a landing distance without syncing; the caller applies hold rules and compensation. */
export function moveLandingDistance(room, wallId, endpoint, { ref, to, offset, move = 'landed' }) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const landing = wall?.landings?.[endpoint];
  const host = room.walls.find((candidate) => candidate.id === landing?.wallId);
  if (!landing || !host) {
    return { ok: false, reason: 'wall-not-found', message: 'wall-not-found', walls: room.walls };
  }

  const diff = offset - landingOffsetFor(room, wall, endpoint, ref, to);
  let walls = room.walls;
  if (diff !== 0) {
    const sideFrame = wallSideFrame(room, host, landing.side);
    let result;
    if (move === 'host') {
      if (ref !== 'left' && ref !== 'right') {
        return {
          ok: false,
          reason: 'host-ref-wall',
          message: `Measure from an end of ${wallLabel(room, host)} to move ${wallLabel(room, host)}.`,
          walls: room.walls,
        };
      }
      const hostFrame = wallFrame(room, host);
      const measuredEnd = ref === 'left' ? sideFrame.leftEndpoint : sideFrame.rightEndpoint;
      const growEnd = measuredEnd === hostFrame.leftEndpoint ? 'left' : 'right';
      result = setWallLength(room, host.id, hostFrame.length + diff, growEnd);
    } else {
      const projection = dot(sideFrame.r, wallFrame(room, wall).n);
      if (Math.abs(projection) >= 0.999) {
        const direction = landingReferenceDirection(room, wall, endpoint, ref);
        result = moveWallPerpendicular(room, wallId, direction * diff * projection);
      }
    }
    if (result && !result.ok) return { ...result, message: result.reason };
    if (result) walls = result.walls;
  }

  return {
    ok: true,
    reason: null,
    message: null,
    walls: walls.map((candidate) => candidate.id === wallId ? {
      ...candidate,
      landings: { ...candidate.landings, [endpoint]: { ...landing, ref, to, offset } },
    } : candidate),
  };
}
