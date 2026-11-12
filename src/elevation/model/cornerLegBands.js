import { bandFronts } from './bandParts.js';
import { bandOutline, endEdgeX, frontContour, placeAtEnd } from './bandEnds.js';
import { cornerBandTurns } from './cornerBands.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerOwnersAt, cornerReturnPoint, cornerReturnRuns, runBackOffset } from './corners.js';
import { floorEndOpen } from './floorOpenings.js';
import { furnitureBasePast, runBaseProfile } from './furnitureBase.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { freeEdge } from './runBands.js';
import { runScene } from './runScene.js';
import { flattenOutline, outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
import { topOverhangs } from './topOverhang.js';
import { runTop } from './tops.js';
import { wallViewForRun } from './wallSides.js';

const EPSILON = 1e-6;
const PART_KINDS = {
  toeKick: 'toe_kick', furnitureBase: 'furniture_base', countertop: 'countertop',
  topMold: 'top_mold', crown: 'crown',
};

// Resolve just the vertical bands and front sections. Calling the owner's runBands here would
// recurse through cornerShapes; a leg also needs no cabinet scene of its own.
export function ownerBands(room, view, owner, settings) {
  const profile = resolveProfile(settings, room, view);
  const base = runBaseProfile(room, view, owner, settings);
  const moldings = moldingProfiles(profile, settings, owner);
  const top = runTop(view, owner, profile);
  const boxTop = owner.z + owner.height;
  const fronts = bandFronts(room, view, owner, settings);
  const overhangs = topOverhangs(room, view, owner, settings);
  const section = top.kind === 'wood' && woodTopSection(moldings.nosing, top.height,
    runBackOffset(owner) - overhangs.back - fronts.countertop + nosingProjection(moldings.nosing));
  const topZ = section ? boxTop + top.height + section.minY : boxTop;
  return Object.entries(fronts).filter(([, front]) => front !== null).map(([kind, front]) => {
    const floor = kind === 'toeKick' || kind === 'furnitureBase';
    const z = floor ? 0 : kind === 'countertop' ? topZ
      : kind === 'topMold' ? boxTop : boxTop + profile.crownStackHeight - profile.crownHeight;
    const height = floor ? base.height : kind === 'countertop' ? boxTop + top.height - topZ
      : kind === 'topMold' ? profile.topMoldHeight : profile.crownHeight;
    const picked = kind === 'furnitureBase' ? base.picked : kind === 'countertop' ? moldings.nosing : moldings[kind];
    const loop = kind === 'countertop' ? section?.outline : picked && sectionProfileOutline(picked.geometry);
    const reference = floor ? base.height : kind === 'countertop' ? boxTop + top.height
      : kind === 'topMold' ? boxTop : boxTop + profile.crownStackHeight;
    const overhang = kind === 'furnitureBase' ? base.proud : kind === 'countertop' ? 0
      : kind === 'crown' && moldings.picked.topMold === 'none' ? 0 : moldings.overhang;
    const past = kind === 'furnitureBase' ? furnitureBasePast(base) : kind === 'countertop'
      ? nosingProjection(moldings.nosing) : moldingPast(moldings, kind, settings);
    const contour = loop && frontContour(placeAtEnd(loop, front - past, overhang, reference));
    return { kind, front, z, height, contour, loop, picked, reference, overhang, overhangs };
  }).filter(({ height }) => height > EPSILON);
}

/** One owner's leg bands, including the end treatment needed for shipping footage. */
export function cornerLegBandsForOwner(room, view, ownerWall, owner, side, settings) {
  const point = cornerReturnPoint(room, ownerWall, owner, side);
  if (!point || point.wallId !== view.id || point.wallSide !== (view.side ?? 'front')) return [];
  const ownerView = wallViewForRun(ownerWall, owner);
  const corner = cornerEnd(room, ownerView, owner, side, settings);
  if (!corner.active || !corner.shape || !corner.columnId) return [];
  const { at, dir } = point;
  const near = dir === 1 ? 'left' : 'right';
  const far = dir === 1 ? 'right' : 'left';
  const legRun = {
    ...owner, x: Math.min(at, at + dir * corner.reach), width: corner.reach, depth: corner.depthB,
    ends: { [far]: corner.returnSide }, anchors: { [near]: true },
  };
  const { runs } = cornerReturnRuns(room, ownerView, owner, side);
  const returns = runs.map((run) => ({ run, fronts: bandFronts(room, view, run, settings) }));
  const key = `corner-leg:${ownerWall.id}:${owner.id}:${side}`;
  return ownerBands(room, ownerView, owner, settings).map((band) => {
    const { kind, front: frontA, z, height, contour, loop, picked, reference, overhang, overhangs } = band;
    const turn = cornerBandTurns(corner, kind, frontA);
    const floor = kind === 'toeKick' || kind === 'furnitureBase';
    const carriers = returns.filter((other) => {
      const { run, fronts } = other;
      if (fronts[kind] === null) return false;
      if (floor) {
        other.floorEnd ??= floorEndOpen(run, runScene(room, view, run, settings), near);
        if (other.floorEnd.open) return false;
      }
      return kind === 'toeKick' || (kind === 'furnitureBase'
        ? Math.abs(runBaseProfile(room, view, run, settings).height - height) <= EPSILON
        : Math.abs(run.z + run.height - owner.z - owner.height) <= EPSILON);
    });
    const blocked = !floor && runs.some((other) => other.z + other.height > z + height + EPSILON);
    const dFar = blocked ? corner.reach : carriers.length
      ? Math.max(corner.reach, turn.b[1]) : corner.reach;
    const jointX = at + dir * dFar;
    const deepest = Math.max(...carriers.map(({ fronts }) => fronts[kind]));
    const returned = !blocked && (!carriers.length || turn.frontB > deepest + EPSILON);
    const freeRun = { ...legRun, x: Math.min(at, jointX), width: dFar };
    const endX = returned ? freeEdge(room, ownerView, freeRun, far, kind, settings) : jointX;
    const startX = at + dir * frontA;
    let x = dir === 1 ? startX : endX;
    let width = dir * (endX - startX);
    const lines = [];
    const turnX = at + dir * turn.b[1];
    const points = contour ? flattenOutline(contour) : [[frontA, z], [frontA, z + height]];
    const tangent = corner.kind === 45 ? Math.tan(corner.shape.miters.b * Math.PI / 180) : 0;
    const miter = corner.kind === 45 && !blocked && carriers.length > 0
      && Math.abs(turn.b[1] - dFar) <= EPSILON && Math.abs(turn.frontB - deepest) <= EPSILON;
    const edge = miter ? points.map(([q, z]) => [at + dir * (turn.b[1] + (q - frontA) * tangent), z, 0]) : null;
    let outline;
    if (corner.kind === 45 && loop) {
      const cornerEdge = transformOutline(contour, ([q, z]) => [at + dir * q, z], dir < 0);
      const farEdge = edge ?? (returned
        ? frontContour(placeAtEnd(loop, jointX, kind === 'countertop' ? overhangs[far] : overhang, reference, dir), dir)
        : [[endX, z, 0], [endX, z + height, 0]]);
      const edges = dir === 1 ? [cornerEdge, farEdge] : [farEdge, cornerEdge];
      outline = bandOutline(...edges, z, height);
      const { minX, maxX } = outlineBounds(outline);
      x = minX;
      width = maxX - minX;
      for (const id of picked?.profile.drawnPoints.elevation ?? []) {
        const lineZ = reference + picked.geometry.points[id][1];
        if (lineZ <= z + EPSILON || lineZ >= z + height - EPSILON
          || lines.some((line) => Math.abs(line.z1 - lineZ) <= EPSILON)) continue;
        lines.push({ x1: endEdgeX(edges[0], lineZ, -1), z1: lineZ,
          x2: endEdgeX(edges[1], lineZ, 1), z2: lineZ });
      }
    }
    // At a miter the contour is the outline's end, rather than an interior turn.
    if (corner.kind === 45 && !miter && turnX > x + EPSILON && turnX < x + width - EPSILON) {
      for (let i = 1; i < points.length; i += 1) {
        const [q1, z1] = points[i - 1];
        const [q2, z2] = points[i];
        lines.push({ x1: at + dir * (turn.b[1] + (q1 - frontA) * tangent), z1,
          x2: at + dir * (turn.b[1] + (q2 - frontA) * tangent), z2 });
      }
    }
    return { part: {
      id: `${key}:${PART_KINDS[kind]}`, kind: PART_KINDS[kind], ownerWallId: ownerWall.id,
      runId: owner.id, side, x, z, width, height, back: runBackOffset(owner), front: turn.frontB,
      ...(outline ? { outline } : {}),
      ...(lines.length ? { lines } : {}),
    }, kind, returned, carriers: carriers.map(({ run }) => run), jointX, near, edge };
  }).filter(({ part }) => part.width > EPSILON);
}

/** Bands owned by corner cabinets on other wall faces, in this return elevation's frame. */
export function cornerLegBands(room, view, settings) {
  return (room.walls ?? []).flatMap((ownerWall) => ownerWall.runs.flatMap((owner) => (
    ['left', 'right'].flatMap((side) => cornerLegBandsForOwner(room, view, ownerWall, owner, side, settings)
      .map(({ part }) => part))
  )));
}

/** Equal fronts share a 45 miter at the turn; unequal fronts keep their square/return joint. */
export function cornerLegBandEdge(room, view, run, side, kind, settings) {
  for (const owner of cornerOwnersAt(room, view, run, side)) {
    const joint = cornerLegBandsForOwner(room, view, owner.wall, owner.run, owner.side, settings)
      .find((band) => band.kind === kind && band.near === side && band.carriers.some(({ id }) => id === run.id));
    if (!joint) continue;
    const front = bandFronts(room, view, run, settings)[kind];
    if (joint.edge && Math.abs(front - joint.part.front) <= EPSILON) {
      return { type: 'miter', x: joint.jointX, edge: joint.edge };
    }
    if (front <= joint.part.front + EPSILON) return { type: 'square', x: joint.jointX };
    const adjusted = { ...run, x: side === 'left' ? joint.jointX : run.x,
      width: side === 'left' ? run.x + run.width - joint.jointX : joint.jointX - run.x };
    return { type: 'return', x: freeEdge(room, view, adjusted, side, kind, settings),
      side: joint.jointX, facing: side === 'left' ? -1 : 1 };
  }
  return null;
}
