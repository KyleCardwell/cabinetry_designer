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
