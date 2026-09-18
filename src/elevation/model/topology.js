const AREA_EPSILON = 1e-6;

function otherEndpoint(endpoint) {
  return endpoint === 'start' ? 'end' : 'start';
}

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function validConnection(wall, endpoint, wallById) {
  const connection = wall.connections?.[endpoint];
  return connection && wallById.has(connection.wallId) ? connection : null;
}

/**
 * Split a room's walls into ordered path and cycle traversals.
 *
 * @param {object} room
 * @returns {Array<{kind:'path'|'cycle',walls:Array<{wallId:string,from:'start'|'end',to:'start'|'end'}>}>}
 */
export function wallComponents(room) {
  const walls = room?.walls ?? [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const wallIndex = new Map(walls.map((wall, index) => [wall.id, index]));
  const seen = new Set();
  const components = [];

  for (const seed of walls) {
    if (seen.has(seed.id)) continue;

    const memberIds = new Set();
    const pending = [seed.id];
    while (pending.length > 0) {
      const wallId = pending.pop();
      if (memberIds.has(wallId)) continue;
      memberIds.add(wallId);
      const wall = wallById.get(wallId);
      for (const endpoint of ['start', 'end']) {
        const connection = validConnection(wall, endpoint, wallById);
        if (connection && !memberIds.has(connection.wallId)) pending.push(connection.wallId);
      }
    }

    const members = walls.filter((wall) => memberIds.has(wall.id));
    const degree = (wall) => ['start', 'end'].reduce(
      (count, endpoint) => count + (validConnection(wall, endpoint, wallById) ? 1 : 0),
      0,
    );
    const cycle = members.length > 1 && members.every((wall) => degree(wall) === 2);
    const startWall = cycle
      ? members[0]
      : members.find((wall) => degree(wall) < 2) ?? members[0];
    let from = 'start';
    if (!cycle && members.length > 1) {
      from = validConnection(startWall, 'start', wallById) ? 'end' : 'start';
    }

    const traversal = [];
    let wall = startWall;
    while (wall && !seen.has(wall.id)) {
      const to = otherEndpoint(from);
      traversal.push({ wallId: wall.id, from, to });
      seen.add(wall.id);
      const connection = validConnection(wall, to, wallById);
      if (!connection || seen.has(connection.wallId)) break;
      wall = wallById.get(connection.wallId);
      from = connection.endpoint;
    }

    // Valid elevation rooms cannot branch, but retain every wall if malformed
    // one-sided connection data is encountered while loading old local data.
    for (const member of members) {
      if (seen.has(member.id)) continue;
      traversal.push({ wallId: member.id, from: 'start', to: 'end' });
      seen.add(member.id);
    }

    components.push({ kind: cycle ? 'cycle' : 'path', walls: traversal });
  }

  return components.sort((a, b) => {
    const aIndex = Math.min(...a.walls.map((entry) => wallIndex.get(entry.wallId)));
    const bIndex = Math.min(...b.walls.map((entry) => wallIndex.get(entry.wallId)));
    return aIndex - bIndex;
  });
}

/**
 * Return +1 for a non-negative chain area and -1 for a clockwise-negative chain.
 *
 * @param {object} room
 * @param {{kind:string,walls:Array<object>}} component
 * @returns {1|-1}
 */
export function chainOrientation(room, component) {
  const wallById = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  if (!component?.walls?.length) return 1;
  const first = component.walls[0];
  const firstWall = wallById.get(first.wallId);
  if (!firstWall) return 1;
  const vertices = [endpointPoint(firstWall, first.from)];
  for (const entry of component.walls) {
    const wall = wallById.get(entry.wallId);
    if (wall) vertices.push(endpointPoint(wall, entry.to));
  }
  if (component.kind === 'cycle' && vertices.length > 1) vertices.pop();
  if (vertices.length < 3) return 1;

  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2 >= -AREA_EPSILON ? 1 : -1;
}

/**
 * Return a component's wall ids in elevation left-to-right chain order.
 * Cycles retain the previously earliest wall as their first wall.
 *
 * @param {object} room
 * @param {{kind:'path'|'cycle',walls:Array<object>}} component
 * @param {string[]} previousOrder
 * @returns {string[]}
 */
export function chainOrder(room, component, previousOrder = []) {
  const orientation = chainOrientation(room, component);
  let ordered = component.walls.map((entry) => entry.wallId);
  if (orientation < 0) ordered = ordered.reverse();
  if (component.kind !== 'cycle' || ordered.length === 0) return ordered;

  const previousIndex = new Map(previousOrder.map((wallId, index) => [wallId, index]));
  const roomIndex = new Map((room?.walls ?? []).map((wall, index) => [wall.id, index]));
  const startId = ordered.reduce((best, wallId) => {
    if (best === null) return wallId;
    const bestPrevious = previousIndex.get(best) ?? Number.POSITIVE_INFINITY;
    const nextPrevious = previousIndex.get(wallId) ?? Number.POSITIVE_INFINITY;
    if (nextPrevious !== bestPrevious) return nextPrevious < bestPrevious ? wallId : best;
    return (roomIndex.get(wallId) ?? Number.POSITIVE_INFINITY)
      < (roomIndex.get(best) ?? Number.POSITIVE_INFINITY) ? wallId : best;
  }, null);
  const startIndex = ordered.indexOf(startId);
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

/**
 * Compute stable room-wide wall order from chain geometry and previous ordering.
 *
 * @param {object} room
 * @param {string[]} previousOrder
 * @returns {string[]}
 */
export function computeWallOrder(room, previousOrder = []) {
  const previousIndex = new Map(previousOrder.map((wallId, index) => [wallId, index]));
  const roomIndex = new Map((room?.walls ?? []).map((wall, index) => [wall.id, index]));
  return wallComponents(room)
    .map((component) => ({
      component,
      previous: Math.min(...component.walls.map(
        ({ wallId }) => previousIndex.get(wallId) ?? Number.POSITIVE_INFINITY,
      )),
      room: Math.min(...component.walls.map(
        ({ wallId }) => roomIndex.get(wallId) ?? Number.POSITIVE_INFINITY,
      )),
    }))
    .sort((a, b) => a.previous - b.previous || a.room - b.room)
    .flatMap(({ component }) => chainOrder(room, component, previousOrder));
}

/** Return the displayed number for every wall id. */
export function wallNumbers(room) {
  const walls = room?.walls ?? [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const numbers = new Map();
  const taken = new Set();
  for (const wall of walls) {
    if (Number.isInteger(wall.numberOverride) && wall.numberOverride > 0) {
      numbers.set(wall.id, wall.numberOverride);
      taken.add(wall.numberOverride);
    }
  }

  const orderedIds = [
    ...(room?.wallOrder ?? []),
    ...walls.map((wall) => wall.id),
  ].filter((wallId, index, ids) => wallById.has(wallId) && ids.indexOf(wallId) === index);
  let nextNumber = 1;
  for (const wallId of orderedIds) {
    if (numbers.has(wallId)) continue;
    while (taken.has(nextNumber)) nextNumber += 1;
    numbers.set(wallId, nextNumber);
    taken.add(nextNumber);
    nextNumber += 1;
  }
  return numbers;
}

/** Return warnings for duplicate explicit wall-number overrides. */
export function wallNumberWarnings(room) {
  const byNumber = new Map();
  for (const wall of room?.walls ?? []) {
    if (!Number.isInteger(wall.numberOverride) || wall.numberOverride < 1) continue;
    const wallIds = byNumber.get(wall.numberOverride) ?? [];
    wallIds.push(wall.id);
    byNumber.set(wall.numberOverride, wallIds);
  }
  return [...byNumber.values()]
    .filter((wallIds) => wallIds.length > 1)
    .map((wallIds) => ({ code: 'duplicate-wall-number', wallIds }));
}

/** Return a numbered wall label, optionally followed by its custom name. */
export function wallLabel(room, wall) {
  const number = wallNumbers(room).get(wall.id)
    ?? Math.max(1, (room?.walls ?? []).findIndex((candidate) => candidate.id === wall.id) + 1);
  return wall.name ? `Wall ${number} · ${wall.name}` : `Wall ${number}`;
}

/** Return the adjacent wall id in room order, wrapping at either end. */
export function nextWallId(room, activeWallId, direction) {
  const wallIds = (room?.wallOrder ?? []).filter((wallId) => (
    room?.walls?.some((wall) => wall.id === wallId)
  ));
  if (wallIds.length === 0) return null;
  if (wallIds.length === 1) return wallIds[0];
  const currentIndex = wallIds.indexOf(activeWallId);
  if (currentIndex === -1) return wallIds[0];
  const step = direction === 'previous' || direction === 'left' || direction < 0 ? -1 : 1;
  return wallIds[(currentIndex + step + wallIds.length) % wallIds.length];
}

/** Normalize obsolete generated wall names into an empty custom name. */
export function normalizeWallName(name) {
  if (typeof name !== 'string' || /^Wall \d+$/.test(name)) return '';
  return name;
}
