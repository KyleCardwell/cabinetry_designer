import {
  add,
  dot,
  lineIntersection,
  magnitude,
  normalize,
  scale,
  subtract,
  wallFrame,
} from './geometry.js';
import { wallSideFrame, wallSideView } from './wallSides.js';
import { wallFaceSegments } from './wallFaceRow.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';

export const LANDING_TO = ['near', 'far', 'center'];
export const NEAR_MISS_DISTANCE = 6;
const PARALLEL_COS = Math.cos(10 * Math.PI / 180);
const FACE_EPSILON = 1e-6;

export function landingEndLabel(room, host, side, end) {
  const frame = wallSideFrame(room, host, side);
  const endpoint = end === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
  const neighbour = room.walls.find(
    (wall) => wall.id === host.connections?.[endpoint]?.wallId,
  );
  if (neighbour) return `${wallLabel(room, neighbour)} corner`;
  const landingHost = room.walls.find(
    (wall) => wall.id === host.landings?.[endpoint]?.wallId,
  );
  return landingHost ? `On ${wallLabel(room, landingHost)}` : 'Free end';
}

export function landingLabel(room, landing) {
  const host = room.walls.find((wall) => wall.id === landing.wallId);
  if (!host) return '';
  const reference = landing.ref === 'left' || landing.ref === 'right'
    ? landingEndLabel(room, host, landing.side, landing.ref)
    : wallLabel(room, room.walls.find((wall) => wall.id === landing.ref));
  return `${formatInches(landing.offset)} from ${reference}`;
}

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function measuredX(interval, direction, to) {
  const near = direction > 0 ? interval.a : interval.b;
  const far = direction > 0 ? interval.b : interval.a;
  if (to === 'far') return far;
  if (to === 'center') return (interval.a + interval.b) / 2;
  return near;
}

function referenceFor(room, wall, endpoint, ref) {
  const landing = wall.landings?.[endpoint];
  const interval = landingInterval(room, wall, endpoint);
  const host = room.walls.find((candidate) => candidate.id === landing?.wallId);
  if (!landing || !interval || !host) return { x: 0, direction: 1 };

  if (ref === 'right') {
    return { x: wallSideFrame(room, host, landing.side).length, direction: -1 };
  }
  if (ref !== 'left') {
    const referenceWall = room.walls.find((candidate) => candidate.id === ref);
    const referenceEndpoint = referenceWall
      ? landingEndpoint(referenceWall, landing.wallId, landing.side)
      : null;
    const referenceInterval = referenceEndpoint
      ? landingInterval(room, referenceWall, referenceEndpoint)
      : null;
    if (referenceInterval) {
      const center = (interval.a + interval.b) / 2;
      const referenceCenter = (referenceInterval.a + referenceInterval.b) / 2;
      return center >= referenceCenter
        ? { x: referenceInterval.b, direction: 1 }
        : { x: referenceInterval.a, direction: -1 };
    }
  }
  return { x: 0, direction: 1 };
}

export function landingInterval(room, wall, endpoint) {
  const source = wall.sideSource ?? wall;
  const landing = source.landings?.[endpoint];
  if (!landing) return null;
  const host = room.walls.find((candidate) => candidate.id === landing.wallId);
  if (!host) return null;

  const hostFrame = wallSideFrame(room, host, landing.side);
  const ownFrame = wallFrame(room, source);
  const linePoint = endpointPoint(source, endpoint);
  const backPoint = add(linePoint, scale(ownFrame.n, -source.thickness));
  const lineHit = lineIntersection(
    linePoint,
    ownFrame.d,
    hostFrame.leftPoint,
    hostFrame.r,
  ) ?? linePoint;
  const backHit = lineIntersection(
    backPoint,
    ownFrame.d,
    hostFrame.leftPoint,
    hostFrame.r,
  ) ?? backPoint;
  const lineX = dot(subtract(lineHit, hostFrame.leftPoint), hostFrame.r);
  const backX = dot(subtract(backHit, hostFrame.leftPoint), hostFrame.r);

  return {
    wallId: source.id,
    endpoint,
    hostId: host.id,
    side: landing.side,
    lineX,
    backX,
    a: Math.min(lineX, backX),
    b: Math.max(lineX, backX),
  };
}

export function landingsOn(room, wallOrView) {
  const host = wallOrView.sideSource ?? wallOrView;
  const side = wallOrView.sideSource ? wallOrView.side : 'front';
  return room.walls.flatMap((wall) => ['start', 'end'].flatMap((endpoint) => {
    const landing = wall.landings?.[endpoint];
    if (landing?.wallId !== host.id || landing.side !== side) return [];
    const interval = landingInterval(room, wall, endpoint);
    return interval ? [interval] : [];
  })).sort((a, b) => a.a - b.a);
}

/** End-to-landing spaces that can be typed directly in the plan dimension row. */
export function landingSpans(room, host, side, settings) {
  const { length } = wallSideFrame(room, host, side);
  const landings = landingsOn(room, wallSideView(host, side));
  const epsilon = 1e-6;
  return wallFaceSegments(room, host, side, settings).flatMap((segment) => {
    if (segment.kind !== 'space') return [];
    const fromLeft = Math.abs(segment.start) <= epsilon;
    const fromRight = Math.abs(segment.end - length) <= epsilon;
    const landing = landings.find(({ a, b }) => (
      (fromLeft && Math.abs(segment.end - a) <= epsilon)
      || (fromRight && Math.abs(segment.start - b) <= epsilon)
    ));
    if (!landing) return [];
    return [{
      start: segment.start,
      end: segment.end,
      wallId: landing.wallId,
      endpoint: landing.endpoint,
      ref: fromLeft ? 'left' : 'right',
    }];
  });
}

/** Return how far a landed wall projects from the host face. */
export function landingProjection(room, wallOrView, wallId) {
  const host = wallOrView.sideSource ?? wallOrView;
  const side = wallOrView.sideSource ? wallOrView.side : 'front';
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return null;
  const endpoint = ['start', 'end'].find((candidate) => {
    const landing = wall.landings?.[candidate];
    return landing?.wallId === host.id && landing.side === side;
  });
  if (!endpoint) return null;
  const landedEnd = endpointPoint(wall, endpoint);
  const freeEnd = endpointPoint(wall, endpoint === 'start' ? 'end' : 'start');
  const normal = wallSideFrame(room, host, side).n;
  return Math.abs(dot(subtract(freeEnd, landedEnd), normal));
}

export function landingEndpoint(wall, hostId, side) {
  return ['start', 'end'].find((endpoint) => {
    const landing = wall.landings?.[endpoint];
    return landing?.wallId === hostId && landing.side === side;
  }) ?? null;
}

export function landingOffsetFor(room, wall, endpoint, ref, to) {
  const interval = landingInterval(room, wall, endpoint);
  if (!interval) return 0;
  const reference = referenceFor(room, wall, endpoint, ref);
  return reference.direction
    * (measuredX(interval, reference.direction, to) - reference.x);
}

export function landingReferenceDirection(room, wall, endpoint, ref) {
  return referenceFor(room, wall, endpoint, ref).direction;
}

/** Re-measure held landings after a host edit, without resolving their positions. */
export function holdLandedWalls(before, after) {
  const coordinates = ['x1', 'y1', 'x2', 'y2'];
  const hostFields = [...coordinates, 'thickness', 'flipped'];
  const oldWalls = new Map(before.walls.map((wall) => [wall.id, wall]));
  const editedWalls = new Map(after.walls.map((wall) => [wall.id, wall]));
  const updates = new Map();

  for (const wall of after.walls) {
    const oldWall = oldWalls.get(wall.id);
    if (!oldWall || coordinates.some((key) => wall[key] !== oldWall[key])) continue;
    let landings = wall.landings;
    for (const endpoint of ['start', 'end']) {
      const landing = wall.landings?.[endpoint];
      const otherEndpoint = endpoint === 'start' ? 'end' : 'start';
      if (!landing || (!wall.connections?.[otherEndpoint] && !wall.landings?.[otherEndpoint])) {
        continue;
      }
      const host = editedWalls.get(landing.wallId);
      const oldHost = oldWalls.get(landing.wallId);
      if (!host || !oldHost || !hostFields.some((key) => host[key] !== oldHost[key])) continue;

      const measuredOffset = landingOffsetFor(after, wall, endpoint, landing.ref, landing.to);
      const offset = measuredOffset === 0 ? 0 : measuredOffset;
      const interval = landingInterval(after, wall, endpoint);
      const length = wallSideFrame(after, host, landing.side).length;
      if (interval.a < -1e-6 || interval.b > length + 1e-6) {
        return {
          ok: false,
          reason: 'landing-off-host',
          message: `${wallLabel(after, host)} can't end there: ${wallLabel(after, wall)} lands on it. Move or detach ${wallLabel(after, wall)} first.`,
          walls: before.walls,
        };
      }
      if (offset !== landing.offset) {
        landings = { ...landings, [endpoint]: { ...landing, offset } };
      }
    }
    if (landings !== wall.landings) updates.set(wall.id, { ...wall, landings });
  }

  return {
    ok: true,
    reason: null,
    message: null,
    walls: updates.size
      ? after.walls.map((wall) => updates.get(wall.id) ?? wall)
      : after.walls,
  };
}

export function resolveLandings(room) {
  let resolvedRoom = {
    ...room,
    walls: room.walls.map((wall) => ({ ...wall })),
  };
  const pending = room.walls.flatMap((wall) => ['start', 'end'].flatMap((endpoint) => (
    wall.landings?.[endpoint]
      ? [{ wallId: wall.id, endpoint }]
      : []
  )));
  const resolved = new Set();

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const entry of pending) {
      const key = `${entry.wallId}:${entry.endpoint}`;
      if (resolved.has(key)) continue;
      const wall = resolvedRoom.walls.find((candidate) => candidate.id === entry.wallId);
      const landing = wall?.landings?.[entry.endpoint];
      if (!wall || !landing) {
        resolved.add(key);
        madeProgress = true;
        continue;
      }

      if (landing.ref !== 'left' && landing.ref !== 'right') {
        const referenceWall = resolvedRoom.walls.find(
          (candidate) => candidate.id === landing.ref,
        );
        const referenceEndpoint = referenceWall
          ? landingEndpoint(referenceWall, landing.wallId, landing.side)
          : null;
        const referenceKey = referenceEndpoint
          ? `${referenceWall.id}:${referenceEndpoint}`
          : null;
        if (referenceKey && !resolved.has(referenceKey)) continue;
      }

      const host = resolvedRoom.walls.find((candidate) => candidate.id === landing.wallId);
      const interval = landingInterval(resolvedRoom, wall, entry.endpoint);
      if (!host || !interval) {
        resolved.add(key);
        madeProgress = true;
        continue;
      }
      const reference = referenceFor(
        resolvedRoom,
        wall,
        entry.endpoint,
        landing.ref,
      );
      const desired = reference.x + reference.direction * landing.offset;
      const dx = desired - measuredX(interval, reference.direction, landing.to);
      const hostFrame = wallSideFrame(resolvedRoom, host, landing.side);
      const distanceOff = dot(
        subtract(endpointPoint(wall, entry.endpoint), hostFrame.leftPoint),
        hostFrame.n,
      );
      const move = add(
        scale(hostFrame.r, dx),
        scale(hostFrame.n, -distanceOff),
      );
      const otherEndpoint = entry.endpoint === 'start' ? 'end' : 'start';
      const moveWhole = !wall.connections?.[otherEndpoint]
        && !wall.landings?.[otherEndpoint];
      const changes = entry.endpoint === 'start'
        ? { x1: wall.x1 + move.x, y1: wall.y1 + move.y }
        : { x2: wall.x2 + move.x, y2: wall.y2 + move.y };
      if (moveWhole) {
        Object.assign(changes, entry.endpoint === 'start'
          ? { x2: wall.x2 + move.x, y2: wall.y2 + move.y }
          : { x1: wall.x1 + move.x, y1: wall.y1 + move.y });
      }
      resolvedRoom = {
        ...resolvedRoom,
        walls: resolvedRoom.walls.map((candidate) => (
          candidate.id === wall.id ? { ...candidate, ...changes } : candidate
        )),
      };
      resolved.add(key);
      madeProgress = true;
    }
  }

  return resolvedRoom;
}

export function landWallEnd(room, wallId, endpoint, target, { keepFlipped = false } = {}) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const host = room.walls.find((candidate) => candidate.id === target.wallId);
  if (!wall || !host || (endpoint !== 'start' && endpoint !== 'end')) return null;
  const ownFrame = wallFrame(room, wall);
  const hostFrame = wallSideFrame(room, host, target.side);
  const denominator = magnitude(ownFrame.d) * magnitude(hostFrame.r);
  const parallel = denominator > 0
    ? Math.abs(dot(ownFrame.d, hostFrame.r) / denominator)
    : 1;
  if (parallel >= Math.cos(10 * Math.PI / 180)) return null;

  const ref = target.x <= hostFrame.length / 2 ? 'left' : 'right';
  const direction = ref === 'left' ? 1 : -1;
  const backDirection = scale(ownFrame.n, -1);
  const toggleFlipped = dot(backDirection, hostFrame.r) * direction < 0;
  const landing = {
    wallId: host.id,
    side: target.side,
    ref,
    to: 'near',
    offset: ref === 'left' ? target.x : hostFrame.length - target.x,
  };

  return {
    ...room,
    walls: room.walls.map((candidate) => candidate.id === wall.id
      ? {
        ...candidate,
        flipped: !keepFlipped && toggleFlipped ? !candidate.flipped : candidate.flipped,
        landings: {
          start: candidate.landings?.start ?? null,
          end: candidate.landings?.end ?? null,
          [endpoint]: landing,
        },
      }
      : candidate),
  };
}

export function landEndpointOnFace(room, wallId, endpoint, { hostId, side, x }) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const host = room.walls.find((candidate) => candidate.id === hostId);
  const refuse = (reason, message = null) => ({
    ok: false, reason, message, walls: room.walls, landing: null,
  });
  if (!wall || (endpoint !== 'start' && endpoint !== 'end')
    || wall.connections?.[endpoint] || wall.landings?.[endpoint]) {
    return refuse('not-free');
  }
  if (!host) return refuse('off-face');
  if (['start', 'end'].some((end) => host.landings?.[end]?.wallId === wallId)) {
    return refuse('host-lands-on-wall',
      `${wallLabel(room, host)} lands on ${wallLabel(room, wall)}, so ${wallLabel(room, wall)} can't land on it.`);
  }
  const hostFrame = wallSideFrame(room, host, side);
  const offFace = () => refuse('off-face',
    `${wallLabel(room, wall)} would miss the end of ${wallLabel(room, host)}.`);
  if (!Number.isFinite(x) || x < 0 || x > hostFrame.length) return offFace();
  const ownFrame = wallFrame(room, wall);
  const denominator = magnitude(ownFrame.d) * magnitude(hostFrame.r);
  if (denominator === 0
    || Math.abs(dot(ownFrame.d, hostFrame.r) / denominator) >= PARALLEL_COS) {
    return refuse('parallel',
      `${wallLabel(room, wall)} can't land on ${wallLabel(room, host)}: they're parallel.`);
  }
  const point = add(hostFrame.leftPoint, scale(hostFrame.r, x));
  const moved = {
    ...wall,
    ...(endpoint === 'start'
      ? { x1: point.x, y1: point.y }
      : { x2: point.x, y2: point.y }),
  };
  const movedRoom = {
    ...room,
    walls: room.walls.map((candidate) => candidate.id === wallId ? moved : candidate),
  };
  const landed = landWallEnd(movedRoom, wallId, endpoint,
    { wallId: hostId, side, x }, { keepFlipped: true });
  if (!landed) {
    return refuse('parallel',
      `${wallLabel(room, wall)} can't land on ${wallLabel(room, host)}: they're parallel.`);
  }
  const landedWall = landed.walls.find((candidate) => candidate.id === wallId);
  const interval = landingInterval(landed, landedWall, endpoint);
  if (!interval || interval.a < -FACE_EPSILON || interval.b > hostFrame.length + FACE_EPSILON) {
    return offFace();
  }
  const landing = {
    ...landedWall.landings[endpoint],
    offset: landingOffsetFor(landed, landedWall, endpoint,
      landedWall.landings[endpoint].ref, 'near'),
  };
  return {
    ok: true, reason: null, message: null,
    walls: landed.walls.map((candidate) => candidate.id === wallId
      ? { ...candidate, landings: { ...candidate.landings, [endpoint]: landing } }
      : candidate),
    landing,
  };
}

export function snapToWallFace(room, point, radius, { excludeWallId = null, from = null } = {}) {
  let nearest = null;
  const u = from ? normalize(subtract(point, from)) : null;
  if (from && magnitude(u) === 0) return null;
  for (const wall of room.walls) {
    if (excludeWallId !== null && wall.id === excludeWallId) continue;
    for (const side of ['front', 'back']) {
      const frame = wallSideFrame(room, wall, side);
      if (from) {
        if (Math.abs(dot(u, frame.r)) >= PARALLEL_COS
          || dot(subtract(from, frame.leftPoint), frame.n) <= FACE_EPSILON) continue;
        const hit = lineIntersection(from, u, frame.leftPoint, frame.r);
        if (!hit) continue;
        const x = dot(subtract(hit, frame.leftPoint), frame.r);
        const distance = magnitude(subtract(hit, point));
        if (x < 0 || x > frame.length || distance > radius) continue;
        if (nearest && nearest.distance <= distance) continue;
        nearest = { distance, result: { wallId: wall.id, side, x, point: hit } };
        continue;
      }
      const delta = subtract(point, frame.leftPoint);
      const x = dot(delta, frame.r);
      const distance = dot(delta, frame.n);
      if (x < 0 || x > frame.length || Math.abs(distance) > radius) continue;
      if (nearest && nearest.distance <= Math.abs(distance)) continue;
      nearest = {
        distance: Math.abs(distance),
        result: {
          wallId: wall.id,
          side,
          x,
          point: add(frame.leftPoint, scale(frame.r, x)),
        },
      };
    }
  }
  return nearest?.result ?? null;
}

export function wallNearMisses(room) {
  const misses = [];
  for (const wall of room.walls) {
    const ownFrame = wallFrame(room, wall);
    for (const endpoint of ['start', 'end']) {
      if (wall.connections?.[endpoint] || wall.landings?.[endpoint]) continue;
      const from = endpointPoint(wall, endpoint);
      const other = endpointPoint(wall, endpoint === 'start' ? 'end' : 'start');
      const u = normalize(subtract(from, other));
      if (magnitude(u) === 0) continue;
      let nearest = null;
      for (const host of room.walls) {
        if (host.id === wall.id) continue;
        for (const side of ['front', 'back']) {
          const frame = wallSideFrame(room, host, side);
          if (Math.abs(dot(u, frame.r)) >= PARALLEL_COS) continue;
          const distance = dot(subtract(from, frame.leftPoint), frame.n);
          if (distance < -FACE_EPSILON) continue;
          const toward = -dot(u, frame.n);
          if (toward <= 0) continue;
          const gap = distance / toward;
          if (gap < 0 || gap > NEAR_MISS_DISTANCE) continue;
          const point = lineIntersection(from, u, frame.leftPoint, frame.r);
          const back = add(from, scale(ownFrame.n, -wall.thickness));
          const backHit = lineIntersection(back, u, frame.leftPoint, frame.r);
          if (!point || !backHit) continue;
          const x = dot(subtract(point, frame.leftPoint), frame.r);
          const backX = dot(subtract(backHit, frame.leftPoint), frame.r);
          // Only a face the end overlaps can be the nearest; its line past the wall's ends doesn't count.
          if (Math.max(x, backX) < -FACE_EPSILON
            || Math.min(x, backX) > frame.length + FACE_EPSILON) continue;
          if (nearest && nearest.gap <= gap) continue;
          nearest = {
            miss: { wallId: wall.id, endpoint, hostId: host.id, side, gap, x, point, from },
            withinFace: Math.min(x, backX) >= -FACE_EPSILON
              && Math.max(x, backX) <= frame.length + FACE_EPSILON,
            gap,
          };
        }
      }
      if (nearest?.withinFace) misses.push(nearest.miss);
    }
  }
  return misses;
}

export function landingRefCreatesCycle(room, wallId, hostId, side, ref) {
  if (ref === 'left' || ref === 'right') return false;
  const visited = new Set();
  let current = ref;
  while (current !== 'left' && current !== 'right') {
    if (current === wallId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const wall = room.walls.find((candidate) => candidate.id === current);
    const endpoint = wall ? landingEndpoint(wall, hostId, side) : null;
    if (!endpoint) return false;
    current = wall.landings[endpoint].ref;
  }
  return false;
}

export function releaseWall(room, wallId, { deleting = true } = {}) {
  const remeasured = new Map();
  for (const wall of room.walls) {
    for (const endpoint of ['start', 'end']) {
      const landing = wall.landings?.[endpoint];
      if (landing?.ref === wallId) {
        remeasured.set(
          `${wall.id}:${endpoint}`,
          landingOffsetFor(room, wall, endpoint, 'left', landing.to),
        );
      }
    }
  }

  return {
    ...room,
    walls: room.walls.map((wall) => {
      const landings = Object.fromEntries(['start', 'end'].map((endpoint) => {
        const landing = wall.landings?.[endpoint] ?? null;
        const offset = remeasured.get(`${wall.id}:${endpoint}`);
        if (offset !== undefined) return [endpoint, { ...landing, ref: 'left', offset }];
        if (deleting && landing?.wallId === wallId) return [endpoint, null];
        return [endpoint, landing];
      }));
      const runs = (wall.runs ?? []).map((run) => ({
        ...run,
        anchors: Object.fromEntries(Object.entries(run.anchors ?? {}).map(([side, anchor]) => [
          side,
          anchor?.to === 'wall' && anchor.wallId === wallId ? false : anchor,
        ])),
      }));
      const soffits = (wall.soffits ?? []).map((soffit) => ({
        ...soffit,
        anchors: Object.fromEntries(Object.entries(soffit.anchors ?? {}).map(([side, anchor]) => [
          side,
          anchor?.to === 'wall' && anchor.wallId === wallId ? false : anchor,
        ])),
      }));
      return { ...wall, landings, runs, soffits };
    }),
  };
}
