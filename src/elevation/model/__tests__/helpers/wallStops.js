import { wall as buildWall } from '../../../../test/builders.js';

/** Give wall-stop fixtures real, empty inside return walls without changing their runs. */
export function connectWallStops(room, wall, endpoints = ['start', 'end']) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  const nx = -dy / length * 120;
  const ny = dx / length * 120;
  for (const endpoint of endpoints) {
    const start = endpoint === 'start';
    const x = start ? wall.x1 : wall.x2;
    const y = start ? wall.y1 : wall.y2;
    const id = `${wall.id}:stop:${endpoint}`;
    const neighborEndpoint = start ? 'end' : 'start';
    wall.connections = { ...wall.connections, [endpoint]: { wallId: id, endpoint: neighborEndpoint } };
    room.walls.push(buildWall({ id,
      x1: start ? x + nx : x, y1: start ? y + ny : y,
      x2: start ? x : x + nx, y2: start ? y : y + ny,
      connections: { start: null, end: null, [neighborEndpoint]: { wallId: wall.id, endpoint } },
      runs: [],
    }));
    room.wallOrder = [...new Set([...(room.wallOrder ?? []), wall.id, id])];
  }
}
