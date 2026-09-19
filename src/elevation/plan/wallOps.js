import {
  add,
  dot,
  lineIntersection,
  magnitude,
  scale,
  subtract,
  wallFrame,
} from '../model/geometry.js';

function cloneWalls(walls) {
  return walls.map((wall) => ({
    ...wall,
    connections: {
      start: wall.connections?.start ? { ...wall.connections.start } : null,
      end: wall.connections?.end ? { ...wall.connections.end } : null,
    },
  }));
}

function wallById(walls, wallId) {
  return walls.find((wall) => wall.id === wallId);
}

function setEndpoint(wall, endpoint, point) {
  if (endpoint === 'start') {
    wall.x1 = point.x;
    wall.y1 = point.y;
  } else {
    wall.x2 = point.x;
    wall.y2 = point.y;
  }
}

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function clearReciprocal(walls, connection) {
  if (!connection) return;
  const other = wallById(walls, connection.wallId);
  if (other) other.connections[connection.endpoint] = null;
}

/** Add a wall and create any requested bidirectional endpoint connections. */
export function addWallWithConnections(walls, wall, connectStart = null, connectEnd = null) {
  const next = cloneWalls(walls);
  const added = {
    ...wall,
    connections: { start: null, end: null },
  };
  next.push(added);

  for (const [endpoint, connection] of [
    ['start', connectStart],
    ['end', connectEnd],
  ]) {
    if (!connection) continue;
    const other = wallById(next, connection.wallId);
    if (!other) continue;
    clearReciprocal(next, other.connections[connection.endpoint]);
    added.connections[endpoint] = {
      wallId: other.id,
      endpoint: connection.endpoint,
    };
    other.connections[connection.endpoint] = { wallId: added.id, endpoint };
    setEndpoint(added, endpoint, endpointPoint(other, connection.endpoint));
  }

  return next;
}

/** Move one endpoint and propagate its coordinates to the connected endpoint. */
export function moveConnectedEndpoint(walls, wallId, endpoint, point) {
  const next = cloneWalls(walls);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  setEndpoint(wall, endpoint, point);
  const connection = wall.connections[endpoint];
  const other = connection ? wallById(next, connection.wallId) : null;
  if (other) setEndpoint(other, connection.endpoint, point);
  return next;
}

/**
 * Move a wall along its interior normal while preserving connected-neighbor angles.
 *
 * @returns {{ok:boolean,reason:string|null,walls:object[]}}
 */
export function moveWallPerpendicular(room, wallId, delta) {
  const sourceWall = wallById(room.walls, wallId);
  if (!sourceWall || !Number.isFinite(delta)) {
    return { ok: false, reason: 'wall-not-found', walls: room.walls };
  }

  const next = cloneWalls(room.walls);
  const movedWall = wallById(next, wallId);
  const frame = wallFrame(room, sourceWall);
  const shift = scale(frame.n, delta);
  const movedLinePoint = add({ x: sourceWall.x1, y: sourceWall.y1 }, shift);
  const affectedWallIds = new Set([wallId]);

  for (const endpoint of ['start', 'end']) {
    const oldPoint = endpointPoint(sourceWall, endpoint);
    const connection = sourceWall.connections?.[endpoint];
    const sourceNeighbor = connection ? wallById(room.walls, connection.wallId) : null;
    const movedNeighbor = connection ? wallById(next, connection.wallId) : null;
    let point = add(oldPoint, shift);

    if (connection && sourceNeighbor && movedNeighbor) {
      const neighborFrame = wallFrame(room, sourceNeighbor);
      const otherEndpoint = connection.endpoint === 'start' ? 'end' : 'start';
      const neighborLinePoint = endpointPoint(sourceNeighbor, otherEndpoint);
      point = lineIntersection(
        movedLinePoint,
        frame.d,
        neighborLinePoint,
        neighborFrame.d,
      ) ?? point;
      setEndpoint(movedNeighbor, connection.endpoint, point);
      affectedWallIds.add(sourceNeighbor.id);
    }
    setEndpoint(movedWall, endpoint, point);
  }

  for (const affectedWallId of affectedWallIds) {
    const before = wallById(room.walls, affectedWallId);
    const after = wallById(next, affectedWallId);
    const oldDirection = subtract(
      { x: before.x2, y: before.y2 },
      { x: before.x1, y: before.y1 },
    );
    const newDirection = subtract(
      { x: after.x2, y: after.y2 },
      { x: after.x1, y: after.y1 },
    );
    if (magnitude(newDirection) < 1 || dot(oldDirection, newDirection) <= 0) {
      return { ok: false, reason: 'neighbor-too-short', walls: room.walls };
    }
  }

  return { ok: true, reason: null, walls: next };
}

/**
 * Set a wall's length from one elevation-side end while preserving connected angles.
 *
 * @returns {{ok:boolean,reason:string|null,walls:object[]}}
 */
export function setWallLength(room, wallId, length, growEnd) {
  const sourceWall = wallById(room.walls, wallId);
  if (!sourceWall) {
    return { ok: false, reason: 'wall-not-found', walls: room.walls };
  }
  if (!Number.isFinite(length) || length <= 0) {
    return { ok: false, reason: 'invalid-length', walls: room.walls };
  }
  if (growEnd !== 'left' && growEnd !== 'right') {
    return { ok: false, reason: 'invalid-grow-end', walls: room.walls };
  }

  const frame = wallFrame(room, sourceWall);
  const endpoint = growEnd === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
  const aOut = growEnd === 'left'
    ? scale(frame.r, -1)
    : frame.r;
  const delta = length - frame.length;
  if (Math.abs(delta) < 1e-9) {
    return { ok: true, reason: null, walls: cloneWalls(room.walls) };
  }
  const connection = sourceWall.connections?.[endpoint];

  if (!connection) {
    const next = cloneWalls(room.walls);
    const wall = wallById(next, wallId);
    const current = endpointPoint(wall, endpoint);
    setEndpoint(wall, endpoint, add(current, scale(aOut, delta)));
    return { ok: true, reason: null, walls: next };
  }

  const neighbor = wallById(room.walls, connection.wallId);
  if (!neighbor) {
    return { ok: false, reason: 'wall-not-found', walls: room.walls };
  }
  const neighborFrame = wallFrame(room, neighbor);
  const projection = dot(aOut, neighborFrame.n);
  if (Math.abs(projection) < 1e-6) {
    return { ok: false, reason: 'parallel-neighbor', walls: room.walls };
  }
  return moveWallPerpendicular(room, neighbor.id, delta * projection);
}

/** Connect two endpoints bidirectionally, replacing their previous connections. */
export function connectWallEndpoints(
  walls,
  wallId1,
  endpoint1,
  wallId2,
  endpoint2,
) {
  const next = cloneWalls(walls);
  const first = wallById(next, wallId1);
  const second = wallById(next, wallId2);
  if (!first || !second || first.id === second.id) return next;

  clearReciprocal(next, first.connections[endpoint1]);
  clearReciprocal(next, second.connections[endpoint2]);
  first.connections[endpoint1] = { wallId: second.id, endpoint: endpoint2 };
  second.connections[endpoint2] = { wallId: first.id, endpoint: endpoint1 };
  setEndpoint(second, endpoint2, endpointPoint(first, endpoint1));
  return next;
}

/** Disconnect an endpoint and clear the reciprocal connection when present. */
export function disconnectWallEndpoint(walls, wallId, endpoint) {
  const next = cloneWalls(walls);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  clearReciprocal(next, wall.connections[endpoint]);
  wall.connections[endpoint] = null;
  return next;
}

/** Snap a moving point horizontally or vertically relative to its fixed endpoint. */
export function snapPointOrtho(fixed, moving, enabled = true) {
  if (!enabled) return { ...moving };
  const dx = Math.abs(moving.x - fixed.x);
  const dy = Math.abs(moving.y - fixed.y);
  return dx >= dy
    ? { x: moving.x, y: fixed.y }
    : { x: fixed.x, y: moving.y };
}
