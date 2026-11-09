import { isPlainObject } from '@reduxjs/toolkit';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { frontDepth, runBackOffset } from './corners.js';
import { isEndLegSide, isLegFill, legHandedness } from './endLegs.js';
import { wallFrame } from './geometry.js';
import { wallEndpointSide } from './wallEndPanels.js';
import { wallSideView } from './wallSides.js';
import { legShapeOf } from './legs.js';

/** Wall ends own face specs, with an optional panel fit across exactly two legs. */
export function isWallEndLegs(value) {
  return isPlainObject(value) && Object.keys(value).length > 0
    && Object.entries(value).every(([endpoint, end]) => {
      if (!['start', 'end'].includes(endpoint) || !isPlainObject(end)
        || !Object.keys(end).every((key) => ['faces', 'fit', 'panel'].includes(key))
        || !isPlainObject(end.faces) || Object.keys(end.faces).length === 0
        || !Object.entries(end.faces).every(([face, specs]) =>
          ['front', 'back'].includes(face) && isEndLegSide(specs))) return false;
      const count = Object.values(end.faces).reduce((total, face) =>
        total + (face.legs === 'both' ? 2 : 1), 0);
      if (Object.hasOwn(end, 'fit') && (end.fit !== 'between' || count !== 2)) return false;
      return !Object.hasOwn(end, 'panel') || (end.fit === 'between'
        && isPlainObject(end.panel) && !Object.hasOwn(end.panel, 'past')
        && !Object.hasOwn(end.panel, 'type') && isLegFill({ type: 'panel', ...end.panel }));
    });
}

/** Prefer Base, then Tall, then the deepest front; equal candidates keep list order. */
export function wallLegRun(room, wall, endpoint, face, settings = DEFAULT_SETTINGS) {
  const view = wallSideView(wall, face);
  const side = wallEndpointSide(room, wall, endpoint, face);
  const rank = (run) => run.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 0
    : run.cabinetTypeId === CABINET_TYPE_IDS.TALL ? 1 : 2;
  return view.runs.filter((run) => run.anchors?.[side] === true).reduce((best, run) =>
    !best || rank(run) < rank(best)
      || (rank(run) === rank(best) && frontDepth(run, settings) > frontDepth(best, settings))
      ? run : best, null);
}

/** Derived legs only: stored specs remain dormant on connected or landed endpoints. */
export function wallEndLegList(room, wall, settings = DEFAULT_SETTINGS) {
  const source = wall.sideSource ?? wall;
  const legs = Object.assign([], { warnings: [] });
  for (const endpoint of ['start', 'end']) {
    const end = source.endLegs?.[endpoint];
    if (!end || source.connections?.[endpoint] || source.landings?.[endpoint]) continue;
    for (const face of ['front', 'back']) {
      const specs = end.faces[face];
      if (!specs) continue;
      const run = wallLegRun(room, source, endpoint, face, settings);
      const side = wallEndpointSide(room, source, endpoint, face);
      const flex = source._endFlex?.[endpoint] ?? 0;
      const endX = side === 'left' ? 0 - flex
        : wallFrame(room, wallSideView(source, face)).length + flex;
      for (const edge of ['front', 'back']) {
        if (!specs[edge]) continue;
        const id = `${source.id}:wallleg:${endpoint}-${face}-${edge}`;
        if (!run) {
          const endName = wallEndpointSide(room, source, endpoint, 'front') === 'left' ? 'Left' : 'Right';
          legs.warnings.push({ code: 'wall-leg-no-run', legId: id,
            name: `${endName} end ${face}-face ${edge} leg` });
          continue;
        }
        legs.push({ runId: run.id, leg: {
          id, ...legHandedness(specs[edge], side, edge),
          wall: { endpoint, face, edge, endX },
        } });
      }
    }
  }
  return legs;
}

/** Taking room is measured inward from the end line, independent of laid-out run x. */
export function wallEndRoom(room, wall, endpoint, settings) {
  const source = wall.sideSource ?? wall;
  const roomByFace = { front: 0, back: 0 };
  for (const { runId, leg } of wallEndLegList(room, source, settings)) {
    if (leg.wall.endpoint !== endpoint || leg.takesRoom === false) continue;
    const shape = legShapeOf(leg, settings);
    if (!shape) continue;
    const run = source.runs.find((run) => run.id === runId);
    const F = frontDepth(run, settings);
    const B = runBackOffset(run);
    const front = leg.yFrom === 'front' ? F + leg.y : B - leg.y + shape.box.d;
    if (Math.min(front, F) - Math.max(front - shape.box.d, B) <= 1e-6) continue;
    const face = leg.wall.face;
    roomByFace[face] = Math.max(roomByFace[face], shape.box.w - leg.x);
  }
  return { ...roomByFace, panelS: Math.max(roomByFace.front, roomByFace.back) };
}
