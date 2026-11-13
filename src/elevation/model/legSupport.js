import { runBaseProfile } from './furnitureBase.js';
import { rectangle } from './libraryShapes.js';
import { resolveProfile } from './profile.js';
import { resolveWall } from './room.js';
import { isCountertop, runTop } from './tops.js';
import { wallSideOf } from './wallSides.js';

const EPS = 1e-6;

/** Library shapes and generated square legs share the same placement geometry. */
export function legShapeOf(leg, settings) {
  if (!leg.square) return (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
  const w = leg.square.w ?? settings.squareLegWidth;
  const d = leg.square.d ?? settings.squareLegDepth;
  return {
    id: 'square-leg', name: 'Square leg', kind: 'leg', archived: false, version: 1,
    box: { x: 0, y: 0, z: 0, w, h: 1, d }, stretch: { z: [[0, 1]] },
    views: {
      front: rectangle(0, 0, w, 1, 'f', 'outline'),
      plan: rectangle(0, 0, w, d, 'p', 'outline'),
      side: rectangle(0, 0, d, 1, 's', 'outline'),
    },
  };
}

/** Resolve what a leg stands on, falling back to the floor when its support is missing. */
export function legBottom(room, wall, run, settings, leg, u0, w) {
  if (leg.sitsOn === 'base') {
    const base = runBaseProfile(room, wall, run, settings);
    return base.kind === 'furniture_base'
      ? { z: base.height } : { z: 0, warning: { code: 'leg-no-base' } };
  }
  if (leg.sitsOn === 'countertop') {
    const view = resolveWall(room, wall, wall.side ?? wallSideOf(run));
    const profile = resolveProfile(settings, room, wall);
    let z;
    for (const other of view.runs) {
      if (other.id === run.id
        || Math.min(u0 + w, other.x + other.width) - Math.max(u0, other.x) <= EPS) continue;
      const top = runTop(view, other, profile);
      const surface = other.z + other.height + top.height;
      if (isCountertop(top.kind) && surface <= run.z + EPS) z = Math.max(z ?? -Infinity, surface);
    }
    return z === undefined ? { z: 0, warning: { code: 'leg-no-countertop' } } : { z };
  }
  return { z: 0 };
}
