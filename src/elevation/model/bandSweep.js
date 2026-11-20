import { bandOutline, clipReturnEdge, endEdgeX, frontContour, placeAtEnd, returnedX } from './bandEnds.js';
import { insertBaseCutouts } from './baseCutouts.js';
import { cornerBandEdge, lazyCornerShapes, profileBandJoint } from './cornerBands.js';
import { frontDepth, runBackOffset } from './corners.js';
import { runBase, runBaseProfile } from './furnitureBase.js';
import { dot, scale } from './geometry.js';
import { moldingProfiles } from './moldingProfiles.js';
import { woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { bandPast, freeEdge } from './runBands.js';
import { runScene } from './runScene.js';
import { outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
import { topOverhangs } from './topOverhang.js';
import { runTop } from './tops.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const KINDS = new Set(['toeKick', 'topMold', 'crown', 'countertop', 'furnitureBase']);
const CAP_TYPES = new Set(['square', 'die-in', 'return', 'cope', 'waterfall']);
const opposite = (side) => side === 'left' ? 'right' : 'left';

function sectionFor(room, view, run, kind, settings, side = 'left') {
  if (kind === 'toeKick') return null;
  if (kind === 'furnitureBase') {
    const base = runBaseProfile(room, view, run, settings);
    if (!base.picked) return null;
    return {
      loop: sectionProfileOutline(base.picked.geometry), reference: base.height, offset: base.proud,
      lineHeights: (base.picked.profile.drawnPoints.elevation ?? [])
        .map((id) => base.height + base.picked.geometry.points[id][1]),
    };
  }
  const profile = resolveProfile(settings, room, view);
  const moldings = moldingProfiles(profile, settings, run);
  if (kind === 'countertop') {
    const top = runTop(view, run, profile);
    if (top.kind !== 'wood') return null;
    const overhangs = topOverhangs(room, view, run, settings);
    const section = woodTopSection(moldings.nosing, top.height,
      runBackOffset(run) - overhangs.back - frontDepth(run, settings) - overhangs.front);
    if (!section) return null;
    const reference = run.z + run.height + top.height;
    return {
      loop: section.outline, reference, offset: overhangs[side],
      lineHeights: moldings.nosing.profile.drawnPoints.elevation
        .map((id) => reference + moldings.nosing.geometry.points[id][1])
        .filter((z) => z > reference + section.minY + EPSILON && z < reference - EPSILON),
    };
  }
  const picked = moldings[kind];
  if (!picked) return null;
  const reference = run.z + run.height + (kind === 'crown' ? profile.crownStackHeight : 0);
  return {
    loop: sectionProfileOutline(picked.geometry), reference,
    offset: kind === 'crown' && moldings.picked.topMold === 'none' ? 0 : moldings.overhang,
    lineHeights: picked.profile.drawnPoints.elevation.map((id) => reference + picked.geometry.points[id][1]),
  };
}

function capFor(room, path, rule, view, settings) {
  const { kind, z, height } = path;
  const { side, type } = rule;
  const run = view.runs.find(({ id }) => id === rule.runId);
  const facing = side === 'left' ? -1 : 1;
  const edge = side === 'left' ? run.x : run.x + run.width;
  const returned = (source, end) => {
    const facing = end === 'left' ? -1 : 1;
    const x = freeEdge(room, view, source, end, kind, settings);
    return { type, x, side: x - facing * bandPast(room, view, source, end, kind, settings), facing,
      source: sectionFor(room, view, source, kind, settings, end) };
  };
  if (type === 'return') {
    if (rule.against?.kind === 'panel') {
      const wallEnd = side === 'left' ? 0 : view.length;
      return { type, x: wallEnd + facing * bandPast(room, view, run, side, kind, settings),
        side: wallEnd, facing, source: sectionFor(room, view, run, kind, settings, side) };
    }
    return { ...returned(run, side), ...(rule.returnLength != null ? { returnLength: rule.returnLength } : {}) };
  }
  if (type === 'cope') {
    const shapes = lazyCornerShapes(room, view, settings);
    const corner = cornerBandEdge(shapes, run, side, kind, z, height);
    if (corner) return { type, x: corner.x, side: edge, facing: -facing,
      source: { outline: corner.outline } };
    const joint = profileBandJoint(shapes, run, side, kind, z, height, frontDepth(run, settings));
    if (joint?.end) {
      const { outline, edge: contour, ...end } = joint.end;
      return { ...end, source: { outline, edge: contour } };
    }
    const neighbor = view.runs.find(({ id }) => id === rule.against?.id);
    return neighbor ? returned(neighbor, opposite(side)) : null;
  }
  const scene = runScene(room, view, run, settings);
  const panel = scene.panelBySide[side];
  const x = panel ? (side === 'left' ? Math.min(panel.x, edge) : Math.max(panel.x + panel.width, edge)) : edge;
  return { type, x, side: x, facing };
}

/** Carry a section and its D1 end rules along one straight wall face. */
export function sweepBand(room, path, settings) {
  if (!path || !KINDS.has(path.kind) || path.closed || !path.segments.length
    || path.vertices.some(({ type }) => type !== 'joined')
    || ![path.start, path.end].every((rule) => rule && CAP_TYPES.has(rule.type))) return null;
  const first = path.segments[0];
  if (path.segments.some(({ wallId, face }) => wallId !== first.wallId || face !== first.face)) return null;
  const wall = room.walls.find(({ id }) => id === first.wallId);
  const frame = wallSideFrame(room, wall, first.face);
  const view = { ...wallSideView(wall, first.face), length: frame.length };
  const caps = [path.start, path.end].sort((a, b) => a.side === b.side ? 0 : a.side === 'left' ? -1 : 1)
    .map((rule) => capFor(room, path, rule, view, settings));
  if (caps.some((cap) => !cap)) return null;
  return {
    pathId: path.id, kind: path.kind, z: path.z, height: path.height,
    section: sectionFor(room, view, view.runs.find(({ id }) => id === first.runId), path.kind, settings),
    segments: path.segments.map((segment) => ({ ...segment, frame })), caps,
    ...(path.kind === 'furnitureBase' ? { cutouts: path.segments.flatMap(({ runId }) => {
      const run = view.runs.find(({ id }) => id === runId);
      return runBase(room, view, run, settings).cutouts ?? [];
    }).sort((a, b) => a.x0 - b.x0) } : {}),
  };
}

/** The return's outward normal projected onto the viewing face's horizontal axis. */
function capEdge(cap, section, frame, z, height, index, kind) {
  const source = cap.source ?? section;
  if (!section && (kind === 'countertop' || kind === 'furnitureBase')) {
    const x = returnedX(cap);
    return [[x, z, 0], [x, z + height, 0]];
  }
  // A straight path's return runs perpendicular to its face; angled returns will have k < 1.
  const returnNormal = scale(frame.r, cap.facing);
  const k = Math.abs(dot(returnNormal, frame.r));
  const loop = source?.loop && transformOutline(source.loop, ([depth, z]) => [k * depth, z]);
  const outline = source?.outline ?? (loop && ['return', 'cope'].includes(cap.type)
    ? placeAtEnd(loop, cap.side, k * source.offset, source.reference, cap.facing) : null);
  const edge = source?.edge ?? (outline && frontContour(outline, cap.facing ?? (index === 0 ? 1 : -1)))
    ?? [[cap.x, z, 0], [cap.x, z + height, 0]];
  return cap.returnLength != null ? clipReturnEdge(edge, cap) : edge;
}

/** See the swept band from its own wall face; other faces and turns are deferred. */
export function viewFromWall(room, sweep, wall, face = wall.side ?? 'front') {
  if (!sweep || !KINDS.has(sweep.kind) || !sweep.segments.length
    || sweep.segments.some(({ wallId, face: side }) => wallId !== wall.id || side !== face)) return null;
  const { z, height, section } = sweep;
  const frame = wallSideFrame(room, wall, face);
  const edges = sweep.caps.map((cap, index) => capEdge(cap, section, frame, z, height, index, sweep.kind));
  const outline = bandOutline(...edges, z, height);
  const { minX, maxX } = outlineBounds(outline);
  const lines = [];
  for (const lineZ of section?.lineHeights ?? []) {
    if (Math.abs(lineZ - z) <= EPSILON || Math.abs(lineZ - z - height) <= EPSILON
      || lines.some((line) => Math.abs(line.z1 - lineZ) <= EPSILON)) continue;
    lines.push({ x1: endEdgeX(edges[0], lineZ, -1), z1: lineZ,
      x2: endEdgeX(edges[1], lineZ, 1), z2: lineZ });
  }
  const band = { x: minX, z, width: maxX - minX, height, outline, lines };
  return sweep.kind === 'furnitureBase' ? insertBaseCutouts(band, (sweep.cutouts ?? [])
    .filter(({ x0, x1 }) => x0 >= outline[0][0] - EPSILON && x1 <= outline[1][0] + EPSILON)) : band;
}
