import {
  add,
  dot,
  lineIntersection,
  magnitude,
  scale,
  subtract,
  wallFrame,
} from './geometry.js';
import { wallSideFrame } from './wallSides.js';

export const LANDING_TO = ['near', 'far', 'center'];

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

export function landWallEnd(room, wallId, endpoint, target) {
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
        flipped: toggleFlipped ? !candidate.flipped : candidate.flipped,
        landings: {
          start: candidate.landings?.start ?? null,
          end: candidate.landings?.end ?? null,
          [endpoint]: landing,
        },
      }
      : candidate),
  };
}

export function snapToWallFace(room, point, radius) {
  let nearest = null;
  for (const wall of room.walls) {
    for (const side of ['front', 'back']) {
      const frame = wallSideFrame(room, wall, side);
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
      return { ...wall, landings, runs };
    }),
  };
}
