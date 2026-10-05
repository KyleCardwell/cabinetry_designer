import { anchoredToCorner, cornerAt, spanCorner } from './corners.js';
import { dot, elevationToPlan, subtract } from './geometry.js';
import { landingsOn } from './landings.js';
import { resolveWall } from './room.js';
import { runSide } from './runSide.js';
import { soffitReturns } from './soffits.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const BODY = new Set(['box', 'faces']);

/**
 * What a wall face sees of its neighbours (SPEC-42.2), as shapes of drawing parts:
 * - returns: the runs on the next wall (or on a wing wall) anchored into this face's inside corner, and the
 *   soffits that die into it, cut where they meet this face. Their box and faces are `section` parts.
 * - profiles: runs on a connected wall that reach past this face's ends, seen from the side. Their box and
 *   faces are `profile` parts.
 * A run's toe kick, countertop, top mold and crown keep their band kinds. Each shape is
 * { key, kind: 'return' | 'profile', wallId, runId?, soffitId?, parts }; parts carry their depths from this face.
 */
export function cornerShapes(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const source = view.sideSource ?? view;
  const frame = wallSideFrame(room, source, view.side);
  const length = view.length;
  const depthOf = (point) => dot(subtract(point, frame.leftPoint), frame.n);
  const shapes = [];

  /** A neighbour run's pieces, cut at this face: `xOf(offset)` maps a depth on its wall to x here. */
  const cut = (key, neighbor, neighborView, neighborFrame, run, xOf) => {
    const ends = [run.x, run.x + run.width];
    const parts = runSide(room, neighborView, run, settings).flatMap((piece) => {
      const xs = [xOf(piece.back), xOf(piece.front)].map((x) => Math.min(length, Math.max(0, x)));
      const depths = ends.flatMap((x) => [piece.back, piece.front]
        .map((offset) => depthOf(elevationToPlan(neighborFrame, x, offset))));
      const x = Math.min(...xs);
      const width = Math.max(...xs) - x;
      if (width <= EPSILON) return [];
      return [{
        id: `${key}:${piece.piece}`,
        kind: BODY.has(piece.piece) ? 'section' : piece.piece,
        runId: run.id,
        x, z: piece.z, width, height: piece.height,
        back: Math.min(...depths), front: Math.max(...depths),
        coversBoxEdges: false,
        ...(BODY.has(piece.piece) ? {} : { opaque: false }),
      }];
    });
    if (parts.length > 0) shapes.push({ key, kind: 'return', wallId: neighbor.id, runId: run.id, parts });
  };

  for (const end of ['left', 'right']) {
    const corner = cornerAt(room, view, end);
    if (corner.type !== 'inside') continue;
    const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
    const sine = Math.sin(corner.angle * Math.PI / 180);
    if (!neighbor || Math.abs(sine) < 1e-9) continue;
    const neighborView = wallSideView(neighbor, corner.neighborWallSide);
    const neighborFrame = wallSideFrame(room, neighbor, corner.neighborWallSide);
    for (const run of neighborView.runs) {
      if (!anchoredToCorner(run.anchors?.[corner.neighborSide], corner) || run.height <= 0) continue;
      cut(`${end}:${neighbor.id}:${run.id}`, neighbor, neighborView, neighborFrame, run,
        (offset) => (end === 'left' ? offset / sine : length - offset / sine));
    }
  }

  for (const { wallId, a, b } of landingsOn(room, view)) {
    const landed = room.walls.find((candidate) => candidate.id === wallId);
    if (!landed) continue;
    for (const end of ['left', 'right']) {
      const corner = spanCorner(room, view, { wallSide: view.side, anchors: { [end]: { to: 'wall', wallId } } }, end);
      const sine = Math.sin(corner.angle * Math.PI / 180);
      if (corner.type !== 'inside' || Math.abs(sine) < 1e-9) continue;
      const landedView = wallSideView(landed, corner.neighborWallSide);
      const landedFrame = wallSideFrame(room, landed, corner.neighborWallSide);
      for (const run of landedView.runs) {
        if (run.anchors?.[corner.neighborSide] !== true || run.height <= 0) continue;
        cut(`landing:${wallId}:${end}:${run.id}`, landed, landedView, landedFrame, run,
          (offset) => (end === 'left' ? b + offset / sine : a - offset / sine));
      }
    }
  }

  for (const entry of soffitReturns(room, view)) {
    const soffit = room.walls.find((candidate) => candidate.id === entry.wallId)
      ?.soffits?.find((candidate) => candidate.id === entry.soffitId);
    shapes.push({
      key: `soffit:${entry.key}`,
      kind: 'return',
      wallId: entry.wallId,
      soffitId: entry.soffitId,
      parts: [{
        id: `soffit:${entry.key}`, kind: 'section',
        x: entry.x, z: entry.bottom, width: entry.width, height: entry.top - entry.bottom,
        back: 0, front: soffit?.width ?? entry.width,
        coversBoxEdges: false,
      }],
    });
  }

  return shapes;
}

/** The parts of cornerShapes, in order: what the payload carries for this face's neighbours (SPEC-42.2). */
export function cornerParts(room, wall, side, settings) {
  return cornerShapes(room, wall, side, settings).flatMap((shape) => shape.parts);
}
