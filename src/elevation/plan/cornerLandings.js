import { add, dot, lineIntersection, magnitude, normalize, scale, subtract, wallFrame } from '../model/geometry.js';
import { landEndpointOnFace, landingInterval, landingOffsetFor, releaseWall } from '../model/landings.js';
import { wallLabel } from '../model/topology.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';
import { connectWallEndpoints, disconnectWallEndpoint, moveWallPerpendicular } from './wallOps.js';

const IN_LINE_COS = Math.cos(10 * Math.PI / 180);

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

/** Whether an endpoint joins a wall at an angle that can be extended past. */
export function canExtendPast(room, wallId, endpoint) {
  if (endpoint !== 'start' && endpoint !== 'end') return false;
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const connection = wall?.connections?.[endpoint];
  const joined = room.walls.find((candidate) => candidate.id === connection?.wallId);
  return Boolean(joined
    && Math.abs(dot(wallFrame(room, wall).d, wallFrame(room, joined).d)) < IN_LINE_COS);
}

/** Extend a corner into a landing without syncing; the caller applies hold and compensation. */
export function extendPastCorner(room, wallId, endpoint, amount) {
  const refuse = (reason, message = null) => ({ ok: false, reason, message, walls: room.walls });
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const connection = (endpoint === 'start' || endpoint === 'end') && wall?.connections?.[endpoint];
  const joined = room.walls.find((candidate) => candidate.id === connection?.wallId);
  if (!joined) return refuse('not-corner');
  if (!canExtendPast(room, wallId, endpoint)) {
    return refuse('in-line',
      `${wallLabel(room, wall)} and ${wallLabel(room, joined)} are in line: there's no corner to extend past.`);
  }
  if (!Number.isFinite(amount) || amount < 0) return refuse('invalid-amount');

  const ownFrame = wallFrame(room, wall);
  const joinedFrame = wallFrame(room, joined);
  const corner = endpointPoint(wall, endpoint);
  const otherEnd = endpointPoint(wall, endpoint === 'start' ? 'end' : 'start');
  const u = normalize(subtract(corner, otherEnd));
  const joinedOtherEnd = endpointPoint(joined, connection.endpoint === 'start' ? 'end' : 'start');
  const side = dot(subtract(joinedOtherEnd, corner), ownFrame.n) > 0 ? 'front' : 'back';
  const backFrame = wallSideFrame(room, wall, 'back');
  const point = side === 'front' ? corner
    : lineIntersection(corner, joinedFrame.d, backFrame.leftPoint, backFrame.r);
  if (magnitude(subtract(joinedOtherEnd, point)) < 1) {
    return refuse('too-short', `${wallLabel(room, joined)} is too short to land on ${wallLabel(room, wall)}.`);
  }

  const far = Math.max(...[point, add(point, scale(joinedFrame.n, -joined.thickness))]
    .map((edge) => dot(subtract(lineIntersection(edge, joinedFrame.d, corner, ownFrame.d), corner), u)));
  const extendedEnd = add(corner, scale(u, far + amount));
  const disconnected = disconnectWallEndpoint(room.walls, wallId, endpoint);
  const extendedRoom = {
    ...room,
    walls: disconnected.map((candidate, index) => {
      if (candidate.id === wallId) return {
        ...candidate,
        ...(endpoint === 'start'
          ? { x1: extendedEnd.x, y1: extendedEnd.y } : { x2: extendedEnd.x, y2: extendedEnd.y }),
        runs: wall.runs.map((run) => {
          const runFace = wallSideOf(run);
          const runSide = wallSideFrame(room, wall, runFace).leftEndpoint === endpoint ? 'left' : 'right';
          return run.anchors?.[runSide] === true ? {
            ...run,
            anchors: { ...run.anchors, [runSide]: runFace === side ? { to: 'wall', wallId: joined.id } : false },
          } : run;
        }),
      };
      if (candidate.id === joined.id) return {
        ...candidate,
        ...(connection.endpoint === 'start'
          ? { x1: point.x, y1: point.y } : { x2: point.x, y2: point.y }),
      };
      return room.walls[index];
    }),
  };
  const extended = extendedRoom.walls.find((candidate) => candidate.id === wallId);
  const frame = wallSideFrame(extendedRoom, extended, side);
  const landed = landEndpointOnFace(extendedRoom, joined.id, connection.endpoint, {
    hostId: wallId, side, x: dot(subtract(point, frame.leftPoint), frame.r),
  });
  if (!landed.ok) return refuse(landed.reason, landed.message);

  const landedRoom = { ...room, walls: landed.walls };
  const landedWall = landed.walls.find((candidate) => candidate.id === joined.id);
  const ref = frame.leftEndpoint === endpoint ? 'left' : 'right';
  const offset = landingOffsetFor(landedRoom, landedWall, connection.endpoint, ref, 'near');
  return {
    ok: true, reason: null, message: null,
    walls: landed.walls.map((candidate) => candidate.id === joined.id ? {
      ...candidate,
      landings: {
        ...candidate.landings,
        [connection.endpoint]: {
          ...candidate.landings[connection.endpoint], ref, to: 'near', offset: offset === 0 ? 0 : offset,
        },
      },
    } : candidate),
  };
}
