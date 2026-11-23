import { bandFronts } from './bandParts.js';
import { frontContour, placeAtEnd } from './bandEnds.js';
import { cornerBandTurns } from './cornerBands.js';
import { cornerEnd } from './cornerEnd.js';
import { cornerReturnPoint, cornerReturnRuns, runBackOffset } from './corners.js';
import { floorEndOpen } from './floorOpenings.js';
import { furnitureBasePast, runBaseProfile } from './furnitureBase.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { freeEdge } from './runBands.js';
import { runScene } from './runScene.js';
import { sectionProfileOutline } from './sectionProfileOutline.js';
import { topOverhangs } from './topOverhang.js';
import { runTop } from './tops.js';
import { wallViewForRun } from './wallSides.js';

const EPSILON = 1e-6;

// Resolve just the vertical bands and front sections. Calling the owner's runBands here would
// recurse through cornerShapes; a leg also needs no cabinet scene of its own.
// corner members in bandPaths
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
    const placedLoop = loop && placeAtEnd(loop, front - past, overhang, reference);
    const contour = placedLoop && frontContour(placedLoop);
    return { kind, front, z, height, contour, placedLoop, loop, picked, reference, overhang, overhangs };
  }).filter(({ height }) => height > EPSILON);
}

/** Shared corner-band geometry and carrier/end decisions for paths and drawn leg bands. */
export function cornerLegBandJointsForOwner(room, view, ownerWall, owner, side, settings) {
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
  return ownerBands(room, ownerView, owner, settings).map((band) => {
    const { kind, front: frontA, z, height } = band;
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
    const blockingRun = !floor && runs.find((other) => other.z + other.height > z + height + EPSILON);
    const blocked = Boolean(blockingRun);
    const dFar = blocked ? corner.reach : carriers.length
      ? Math.max(corner.reach, turn.b[1]) : corner.reach;
    const jointX = at + dir * dFar;
    const deepest = Math.max(...carriers.map(({ fronts }) => fronts[kind]));
    const returned = !blocked && (!carriers.length || turn.frontB > deepest + EPSILON);
    const freeRun = { ...legRun, x: Math.min(at, jointX), width: dFar };
    const endX = returned ? freeEdge(room, ownerView, freeRun, far, kind, settings) : jointX;
    const miter = corner.kind === 45 && !blocked && carriers.length > 0
      && Math.abs(turn.b[1] - dFar) <= EPSILON && Math.abs(turn.frontB - deepest) <= EPSILON;
    return { band, corner, point, turn, ownerView, near, far, carriers, blocked, dFar,
      jointX, deepest, returned, miter, endX, blockingRun };
  });
}
