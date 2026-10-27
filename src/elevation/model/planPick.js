import { CABINET_TYPE_IDS } from './constants.js';
import { polygonContainsPoint, runFootprint } from './footprints.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { RUN_LABELS } from './pick.js';
import { openingPlanDepths } from './recesses.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';
import { wallOutline } from './wallOutline.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

/** Inside a polygon, or at most tolerance inches from any of its edges (including collapsed edges). */
export function pointNearPolygon(polygon, point, tolerance) {
  if (polygonContainsPoint(polygon, point)) return true;
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy) <= tolerance;
  });
}

function rectangle(frame, x, width, back, front) {
  return [
    elevationToPlan(frame, x, front),
    elevationToPlan(frame, x + width, front),
    elevationToPlan(frame, x + width, back),
    elevationToPlan(frame, x, back),
  ];
}

/** Plan picks in visual order: runs, openings, nearby walls, then any remaining host walls. */
export function planPickStack(room, point, settings, { tolerance = 0 } = {}) {
  if (!room || !point) return [];
  const upper = [];
  const lower = [];
  const openings = [];
  const walls = [];

  for (const wall of room.walls ?? []) {
    for (const run of wall.runs ?? []) {
      const outline = runFootprint(wallSideFrame(room, wall, wallSideOf(run)), run, settings);
      if (!polygonContainsPoint(outline, point)) continue;
      const target = run.cabinetTypeId === CABINET_TYPE_IDS.UPPER ? upper : lower;
      target.push({
        kind: 'run', key: `run:${run.id}`,
        label: `${RUN_LABELS[run.cabinetTypeId] ?? 'Run'} ${formatInches(run.width)}`,
        wallId: wall.id, selection: { runId: run.id, pieceId: null }, outline,
      });
    }
    const frame = wallFrame(room, wall);
    for (const opening of wall.openings ?? []) {
      const { jamb, casing } = openingGeometry(opening, frame.length, settings);
      const { face, back } = openingPlanDepths(wall, opening);
      const voidPolygon = rectangle(frame, jamb.x, jamb.width, back, face);
      const casingPolygon = casing
        ? rectangle(frame, casing.x, casing.width, face, face + casing.thickness) : null;
      if (!pointNearPolygon(voidPolygon, point, tolerance)
        && !(casingPolygon && pointNearPolygon(casingPolygon, point, tolerance))) continue;
      const outer = casing ?? jamb;
      openings.push({
        kind: 'opening', key: `opening:${opening.id}`,
        label: `${opening.kind === 'door' ? 'Door' : 'Window'} ${opening.label}`,
        wallId: wall.id, selection: { openingId: opening.id },
        outline: rectangle(frame, outer.x, outer.width, back, face + (casing?.thickness ?? 0)),
      });
    }
    const outline = wallOutline(room, wall);
    if (pointNearPolygon(outline, point, tolerance)) walls.push(wallCandidate(room, wall, outline));
  }

  const candidates = [...upper.reverse(), ...lower.reverse(), ...openings.reverse(), ...walls.reverse()];
  const listedWalls = new Set(walls.map(({ wallId }) => wallId));
  for (const { wallId } of [...candidates]) {
    if (listedWalls.has(wallId)) continue;
    const wall = room.walls.find((candidate) => candidate.id === wallId);
    candidates.push(wallCandidate(room, wall, wallOutline(room, wall)));
    listedWalls.add(wallId);
  }
  return candidates;
}

function wallCandidate(room, wall, outline) {
  return {
    kind: 'wall', key: `wall:${wall.id}`, label: wallLabel(room, wall),
    wallId: wall.id, selection: null, outline,
  };
}
