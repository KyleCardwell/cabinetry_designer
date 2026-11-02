import { dot, lineIntersection, subtract, wallFrame } from '../model/geometry.js';
import { landingInterval, releaseWall } from '../model/landings.js';
import { wallLabel } from '../model/topology.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';
import { connectWallEndpoints, moveWallPerpendicular } from './wallOps.js';

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function freeEnd(wall, endpoint) {
  return (endpoint === 'start' || endpoint === 'end')
    && !wall.connections?.[endpoint] && !wall.landings?.[endpoint];
}

/** The nearest free host end, measured on the landing's face; ties go left. */
export function wallCornerEnd(room, wallId, endpoint) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const landing = wall?.landings?.[endpoint];
  const host = room.walls.find((candidate) => candidate.id === landing?.wallId);
  if (!landing || !host) return null;
  const frame = wallSideFrame(room, host, landing.side);
  const interval = landingInterval(room, wall, endpoint);
  const ends = [
    { endpoint: frame.leftEndpoint, gap: interval.a },
    { endpoint: frame.rightEndpoint, gap: frame.length - interval.b },
  ].filter((end) => freeEnd(host, end.endpoint));
  if (!ends.length) return null;
  return ends.length === 2 && ends[1].gap < ends[0].gap
    ? ends[1].endpoint : ends[0].endpoint;
}

function anchorsWall(anchor, wallId) {
  return anchor?.to === 'wall' && anchor.wallId === wallId;
}

/** Make a landing into a corner without syncing; the caller applies hold and compensation. */
export function makeWallCorner(room, wallId, endpoint, { move = 'landed', hostEndpoint = null } = {}) {
  const refuse = (reason, message = reason) => ({
    ok: false, reason, message, walls: room.walls,
  });
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const landing = wall?.landings?.[endpoint];
  const host = room.walls.find((candidate) => candidate.id === landing?.wallId);
  if (!landing || !host) return refuse('wall-not-found');
  const hostEnd = hostEndpoint ?? wallCornerEnd(room, wallId, endpoint);
  if (!freeEnd(host, hostEnd)) {
    return refuse('no-free-end',
      `${wallLabel(room, host)} has no free end to make a corner with ${wallLabel(room, wall)}.`);
  }

  const ownFrame = wallFrame(room, wall);
  const corner = lineIntersection(endpointPoint(wall, endpoint), ownFrame.d,
    endpointPoint(host, 'start'), wallFrame(room, host).d);
  if (!corner) return refuse('parallel');
  const frame = wallSideFrame(room, host, landing.side);
  const runSide = hostEnd === frame.leftEndpoint ? 'left' : 'right';
  const anchoredRoom = {
    ...room,
    walls: room.walls.map((candidate) => candidate.id === host.id ? {
      ...candidate,
      runs: candidate.runs.map((run) => (
        wallSideOf(run) === landing.side && anchorsWall(run.anchors?.[runSide], wallId)
          ? { ...run, anchors: { ...run.anchors, [runSide]: true } } : run
      )),
    } : candidate),
  };
  const released = releaseWall(anchoredRoom, wallId, { deleting: false });
  // releaseWall copies every wall; keep walls with no released references shared.
  let walls = released.walls.map((candidate, index) => {
    const source = anchoredRoom.walls[index];
    const changed = Object.values(source.landings ?? {}).some((entry) => entry?.ref === wallId)
      || [...(source.runs ?? []), ...(source.soffits ?? [])].some((entry) => (
        Object.values(entry.anchors ?? {}).some((anchor) => anchorsWall(anchor, wallId))
      ));
    return changed ? candidate : source;
  });

  if (move === 'host') {
    walls = walls.map((candidate) => candidate.id === host.id ? {
      ...candidate,
      ...(hostEnd === 'start'
        ? { x1: corner.x, y1: corner.y } : { x2: corner.x, y2: corner.y }),
    } : candidate);
  } else {
    const distance = dot(subtract(endpointPoint(host, hostEnd), corner), ownFrame.n);
    const moved = moveWallPerpendicular({ ...room, walls }, wallId, distance);
    if (!moved.ok) return refuse(moved.reason);
    walls = moved.walls.map((candidate, index) => (
      ['x1', 'y1', 'x2', 'y2'].some((key) => candidate[key] !== walls[index][key])
        ? candidate : walls[index]
    ));
  }

  walls = walls.map((candidate) => candidate.id === wallId ? {
    ...candidate, landings: { ...candidate.landings, [endpoint]: null },
  } : candidate);
  const connected = connectWallEndpoints(walls, host.id, hostEnd, wallId, endpoint);
  return {
    ok: true, reason: null, message: null,
    walls: connected.map((candidate, index) => (
      candidate.id === host.id || candidate.id === wallId ? candidate : walls[index]
    )),
  };
}
