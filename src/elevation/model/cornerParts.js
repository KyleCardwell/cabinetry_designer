import { bandOutline, frontContour } from './bandEnds.js';
import { jogWalls } from './combinedElevations.js';
import { profileBandJoint } from './cornerBands.js';
import { anchoredToCorner, cornerAt, frontDepth, spanCorner } from './corners.js';
import { dot, elevationToPlan, planPointToWallX, subtract } from './geometry.js';
import { landingsOn } from './landings.js';
import { resolveWall } from './room.js';
import { runEndView, runSide } from './runSide.js';
import { runBandEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { transformOutline } from './sectionProfileOutline.js';
import { soffitReturns } from './soffits.js';
import { elevationKey, returnsView } from './topology.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const BODY = new Set(['box', 'faces']);
const BANDS = { toe_kick: 'toeKick', furniture_base: 'furnitureBase', countertop: 'countertop',
  top_mold: 'topMold', crown: 'crown' };

/** Apply the same junctions used by runBandEnds, retaining raw pieces for band lookup. */
function joinedProfileBands(room, wall, settings, shapes) {
  const replacements = new Map();
  const dropped = new Set();
  const getShapes = () => shapes;
  for (const run of wall.runs) {
    const scene = runScene(room, wall, run, settings);
    for (const piece of runSide(room, wall, run, settings)) {
      const band = BANDS[piece.piece];
      if (!band) continue;
      const ends = runBandEnds(room, wall, run, settings, scene, band, piece.z, piece.height, getShapes);
      for (const [index, side] of ['left', 'right'].entries()) {
        const joint = profileBandJoint(getShapes, run, side, band, piece.z, piece.height, frontDepth(run, settings));
        const expected = joint?.end;
        const end = ends[index];
        if (!expected || end.type !== expected.type || Math.abs(end.x - expected.x) > EPSILON
          || end.side !== expected.side || end.facing !== expected.facing) continue;
        const { part } = joint;
        if (joint.relation === 'through') dropped.add(part.id);
        else {
          const x = Math.min(part.x, end.x);
          const right = Math.max(part.x + part.width, end.x);
          const outline = part.outline && bandOutline(
            frontContour(side === 'left' ? part.outline : end.outline, -1),
            frontContour(side === 'left' ? end.outline : part.outline, 1), part.z, part.height,
          );
          replacements.set(part.id, { ...part, x, width: right - x, ...(outline ? { outline } : {}) });
        }
      }
    }
  }
  return shapes.map((shape) => shape.kind !== 'profile' ? shape : {
    ...shape, parts: shape.parts.filter((part) => !dropped.has(part.id))
      .map((part) => replacements.get(part.id) ?? part),
  });
}

/**
 * What a wall face sees of its neighbours (SPEC-42.2), as shapes of drawing parts:
 * - returns: the runs on the next wall (or on a wing wall) anchored into this face's inside corner, and the
 *   soffits that die into it. Runs use sections or end views per returnsView; soffits stay sections.
 * - profiles: runs on a connected wall that reach past this face's ends, seen end-on. Their box and
 *   faces are `profile` parts; a visible end panel stays `end_panel` and opaque.
 * A run's toe kick, countertop, top mold and crown keep their band kinds. Each shape is
 * { key, kind: 'return' | 'profile', wallId, runId?, soffitId?, parts }; parts carry their depths from this face.
 */
export function cornerShapes(room, wall, side, settings,
  { profiles: includeProfiles = true, throughBands = false, returns: returnMode, combined } = {}) {
  const view = resolveWall(room, wall, side);
  const endView = (returnMode ?? returnsView(room, elevationKey(view.id, view.side))) === 'end';
  const jogs = jogWalls(room, combined);
  const source = view.sideSource ?? view;
  const frame = wallSideFrame(room, source, view.side);
  const length = view.length;
  const depthOf = (point) => dot(subtract(point, frame.leftPoint), frame.n);
  const shapes = [];

  /** A neighbour return: `xOf(offset)` maps its wall depth to x here; end is away from the corner. */
  const cut = (key, neighbor, neighborView, neighborFrame, run, end, xOf) => {
    const ends = [run.x, run.x + run.width];
    const asEnd = endView || jogs.has(neighbor.id);
    const pieces = asEnd ? runEndView(room, neighborView, run, end, settings)
      : runSide(room, neighborView, run, settings);
    const parts = pieces.flatMap((piece) => {
      const xs = [xOf(piece.back), xOf(piece.front)].map((x) => Math.min(length, Math.max(0, x)));
      const depths = ends.flatMap((x) => [piece.back, piece.front]
        .map((offset) => depthOf(elevationToPlan(neighborFrame, x, offset))));
      const x = Math.min(...xs);
      const width = Math.max(...xs) - x;
      if (width <= EPSILON) return [];
      return [{
        id: `${key}:${piece.piece}`,
        kind: BODY.has(piece.piece) ? (asEnd ? 'profile' : 'section') : piece.piece,
        runId: run.id,
        x, z: piece.z, width, height: piece.height,
        back: Math.min(...depths), front: Math.max(...depths),
        coversBoxEdges: false,
        ...(piece.outline ? { outline: transformOutline(piece.outline, ([depth, z]) => [
          Math.min(length, Math.max(0, xOf(depth))), z,
        ], xOf(1) < xOf(0)) } : {}),
        ...(BODY.has(piece.piece) || piece.piece === 'end_panel' ? {} : { opaque: false }),
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
        corner.neighborSide === 'left' ? 'right' : 'left',
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
          corner.neighborSide === 'left' ? 'right' : 'left',
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

  // End views resolve their band ends against returns without recursively building other profiles.
  if (!includeProfiles) return shapes;
  const profiles = [];
  const handled = new Set();
  for (const endpoint of ['start', 'end']) {
    const neighbor = room.walls.find((candidate) => candidate.id === source.connections?.[endpoint]?.wallId);
    if (!neighbor || handled.has(neighbor.id)) continue;
    handled.add(neighbor.id);
    for (const neighborSide of WALL_SIDES) {
      const neighborView = wallSideView(neighbor, neighborSide);
      const neighborFrame = wallSideFrame(room, neighbor, neighborSide);
      // A run in the neighbour's recess sits behind its face: this face never sees it.
      for (const run of neighborView.runs.filter((candidate) => !candidate.recessId)) {
        const project = (piece) => [run.x, run.x + run.width].flatMap((x) => [piece.back, piece.front]
          .map((offset) => elevationToPlan(neighborFrame, x, offset)));
        const body = runSide(room, neighborView, run, settings).filter((piece) => BODY.has(piece.piece)).flatMap(project);
        if (body.length === 0 || Math.max(...body.map(depthOf)) <= EPSILON) continue;
        const end = depthOf(elevationToPlan(neighborFrame, run.x, 0))
          > depthOf(elevationToPlan(neighborFrame, run.x + run.width, 0)) ? 'left' : 'right';
        const endX = end === 'left' ? run.x : run.x + run.width;
        const pieces = runEndView(room, neighborView, run, end, settings);
        const bodyStart = Math.min(...body.map((point) => planPointToWallX(frame, point)));
        for (const past of ['left', 'right']) {
          const key = `${neighbor.id}:${neighborSide}:${run.id}:${past}`;
          const parts = pieces.flatMap((piece) => {
            const points = project(piece);
            const xs = points.map((point) => planPointToWallX(frame, point));
            const start = past === 'left' ? Math.min(...xs) : Math.max(Math.min(...xs), length);
            const finish = past === 'left' ? Math.min(Math.max(...xs), 0) : Math.max(...xs);
            if (finish - start <= EPSILON) return [];
            const depths = points.map(depthOf);
            const xOf = (depth) => planPointToWallX(frame, elevationToPlan(neighborFrame, endX, depth));
            return [{
              id: `${key}:${piece.piece}`,
              kind: BODY.has(piece.piece) ? 'profile' : piece.piece,
              runId: run.id,
              x: start, z: piece.z, width: finish - start, height: piece.height,
              back: Math.min(...depths), front: Math.max(...depths),
              coversBoxEdges: false,
              ...(piece.outline ? { outline: transformOutline(piece.outline, ([depth, z]) => [
                Math.min(finish, Math.max(start, xOf(depth))), z,
              ], xOf(1) < xOf(0)) } : {}),
            }];
          });
          if (parts.length === 0) continue;
          profiles.push({
            at: past === 'left' ? bodyStart : Math.max(bodyStart, length),
            z: run.z,
            shape: { key, kind: 'profile', wallId: neighbor.id, runId: run.id, parts },
          });
        }
      }
    }
  }
  profiles.sort((a, b) => a.at - b.at || a.z - b.z);
  const all = [...shapes, ...profiles.map(({ shape }) => shape)];
  return throughBands || profiles.length === 0 ? all : joinedProfileBands(room, view, settings, all);
}

/**
 * Keep jog runs in their inside-corner face's depth frame, regardless of face order. A band already
 * drawn through by an adjoining face also disappears from the retained return.
 */
export function combinedCornerShapes(room, combined, settings) {
  const jogs = jogWalls(room, combined);
  const dropped = new Set();
  const pieceKey = (shape, part) => `${shape.wallId}:${shape.runId}:${part.id.split(':').pop()}`;
  const faces = combined.faces.map((face) => {
    const wall = resolveWall(room, room.walls.find(({ id }) => id === face.wallId), face.side);
    const raw = cornerShapes(room, wall, face.side, settings, { combined, throughBands: true });
    const shapes = raw.some(({ kind }) => kind === 'profile')
      ? joinedProfileBands(room, wall, settings, raw) : raw;
    const kept = new Set(shapes.flatMap(({ parts }) => parts.map(({ id }) => id)));
    for (const shape of raw.filter((shape) => shape.kind === 'profile' && jogs.has(shape.wallId))) {
      for (const part of shape.parts) {
        if (!kept.has(part.id)) dropped.add(pieceKey(shape, part));
      }
    }
    return [face.key, shapes];
  });
  return new Map(faces.map(([key, shapes]) => [key, shapes.flatMap((shape) => {
    if (jogs.has(shape.wallId) && shape.runId) {
      if (shape.kind === 'profile') return [];
      const parts = shape.parts.filter((part) => !dropped.has(pieceKey(shape, part)));
      return parts.length ? [{ ...shape, parts }] : [];
    }
    return [shape];
  })]));
}

/** The parts of cornerShapes, in order: what the payload carries for this face's neighbours (SPEC-42.2). */
export function cornerParts(room, wall, side, settings) {
  return cornerShapes(room, wall, side, settings).flatMap((shape) => shape.parts);
}

/**
 * How far each neighbour run seen in profile past this face's ends reaches (SPEC-43.4):
 * its box and faces, not its toe kick or top, with its cabinet type so a chain can take it in its band.
 */
export function profileReach(room, wall, side, settings) {
  return cornerShapes(room, wall, side, settings)
    .filter((shape) => shape.kind === 'profile')
    .map((shape) => {
      const parts = shape.parts.filter((part) => part.kind === 'profile');
      const x = Math.min(...parts.map((part) => part.x));
      const right = Math.max(...parts.map((part) => part.x + part.width));
      const run = room.walls.find((candidate) => candidate.id === shape.wallId)
        ?.runs?.find((candidate) => candidate.id === shape.runId);
      return {
        key: shape.key,
        wallId: shape.wallId,
        runId: shape.runId,
        cabinetTypeId: run?.cabinetTypeId ?? null,
        x,
        width: right - x,
      };
    });
}
