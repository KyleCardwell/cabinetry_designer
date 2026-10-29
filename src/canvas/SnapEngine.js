/**
 * Snap utilities for the 2D canvas.
 * All coordinates are in room-local inches.
 */

/**
 * Snap a point to the nearest grid intersection.
 */
export function snapToGrid(point, gridSize = 1) {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Find the nearest wall endpoint to a given point within snapRadius.
 * Excludes endpoints belonging to excludeWallId (the wall being drawn/dragged).
 * Returns { wallId, endpoint, x, y, dist } or null.
 */
export function snapToEndpoint(point, walls, snapRadius = 6, excludeWallId = null) {
  let best = null;
  let bestDist = snapRadius;

  for (const wall of walls) {
    if (wall.wall_id === excludeWallId) continue;

    const endpoints = [
      { endpoint: 'start', x: wall.x1, y: wall.y1 },
      { endpoint: 'end', x: wall.x2, y: wall.y2 },
    ];

    for (const ep of endpoints) {
      const dx = point.x - ep.x;
      const dy = point.y - ep.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          wallId: wall.wall_id,
          endpoint: ep.endpoint,
          x: ep.x,
          y: ep.y,
          dist,
        };
      }
    }
  }

  return best;
}
