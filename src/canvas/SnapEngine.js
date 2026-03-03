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
 * Project a point onto a wall segment, returning the closest point on the wall.
 */
export function projectPointOntoWall(point, wall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: wall.x1, y: wall.y1, t: 0 };

  let t = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: wall.x1 + t * dx,
    y: wall.y1 + t * dy,
    t,
  };
}

/**
 * Compute the wall angle in degrees (rotation for objects snapped to this wall).
 * Returns angle such that object faces "into" the room (normal direction).
 */
export function wallAngleDeg(wall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Length of a wall in inches.
 */
export function wallLength(wall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from a point to the nearest spot on a wall segment.
 */
function distToWall(point, wall) {
  const proj = projectPointOntoWall(point, wall);
  const dx = point.x - proj.x;
  const dy = point.y - proj.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Snap a point to the nearest wall within snapRadius inches.
 * Returns { wall_id, x, y, rotation } or null if no wall is close enough.
 */
export function snapToWall(point, walls, snapRadius = 12) {
  let best = null;
  let bestDist = snapRadius;

  for (const wall of walls) {
    const dist = distToWall(point, wall);
    if (dist < bestDist) {
      bestDist = dist;
      const proj = projectPointOntoWall(point, wall);
      best = {
        wall_id: wall.wall_id,
        x: proj.x,
        y: proj.y,
        rotation: wallAngleDeg(wall),
      };
    }
  }

  return best;
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
