import { bandOutline, clipReturnEdge, endEdgeX, frontContour, placeAtEnd, returnedX } from './bandEnds.js';
import { insertBaseCutouts } from './baseCutouts.js';
import { buildCacheFor } from './buildCache.js';
import { cornerBandEdge, lazyCornerShapes, ownerBandTurnLines, profileBandJoint } from './cornerBands.js';
import { cornerEnd } from './cornerEnd.js';
import { ownerBands } from './cornerLegBands.js';
import { frontDepth, runBackOffset } from './corners.js';
import { floorOpenings } from './floorOpenings.js';
import { runBase, runBaseProfile } from './furnitureBase.js';
import { dot, scale } from './geometry.js';
import { moldingProfiles } from './moldingProfiles.js';
import { woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { bandPast, freeEdge, runBandEnds, runBaseSpans, segmentedCountertop, waterfallBand, waterfallEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { arcExtremes, outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
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
    // An explicit plain source must not inherit the receiving run's profile at a cope.
    return { type, x, side: x - facing * bandPast(room, view, source, end, kind, settings), facing,
      source: sectionFor(room, view, source, kind, settings, end) ?? {} };
  };
  if (type === 'waterfall') {
    if (kind === 'countertop') return returned(run, side);
    const scene = runScene(room, view, run, settings);
    const end = runBandEnds(room, view, run, settings, scene, kind, z, height)[side === 'left' ? 0 : 1];
    return { ...end, type, source: {} };
  }
  if (type === 'return') {
    if (rule.against?.kind === 'panel') {
      const wallEnd = side === 'left' ? 0 : view.length;
      return { type, x: wallEnd + facing * bandPast(room, view, run, side, kind, settings),
        side: wallEnd, facing, source: sectionFor(room, view, run, kind, settings, side) };
    }
    const joint = profileBandJoint(lazyCornerShapes(room, view, settings), run, side,
      kind, z, height, frontDepth(run, settings));
    if (joint?.relation === 'through') {
      const { outline, edge: contour, ...end } = joint.end;
      return { ...end, source: { outline, edge: contour } };
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
  const run = view.runs.find(({ id }) => id === first.runId);
  const top = runTop(view, run, resolveProfile(settings, room, view));
  // Gap coordinates are distances along this straight path from its first segment's left edge.
  const gaps = path.segments.flatMap((segment) => {
    const member = view.runs.find(({ id }) => id === segment.runId);
    const scene = runScene(room, view, member, settings);
    const openings = path.kind === 'countertop'
      ? segmentedCountertop(member, scene, runTop(view, member, resolveProfile(settings, room, view)), null).topSegments
      : ['toeKick', 'furnitureBase'].includes(path.kind)
        ? floorOpenings(member, scene.cells).filter(({ baseUnder }) => !baseUnder) : [];
    return openings.map(({ x, width }) => ({ start: x - first.x1, end: x + width - first.x1 }));
  });
  const waterfall = path.kind === 'countertop' && waterfallEnds(room, view, run, settings);
  return {
    pathId: path.id, kind: path.kind, z: path.z, height: path.height, gaps,
    ...(waterfall && (waterfall.left || waterfall.right) ? { waterfall: {
      ends: waterfall, run, thickness: top.height, surface: run.z + run.height + top.height,
      overhangs: topOverhangs(room, view, run, settings),
    } } : {}),
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
  const plainSource = !source?.loop && !source?.outline;
  if ((!section || plainSource) && (kind === 'countertop' || kind === 'furnitureBase')) {
    const x = returnedX(cap);
    return [[x, z, 0], [x, z + height, 0]];
  }
  // A straight path's return runs perpendicular to its face; angled returns will have k < 1.
  const returnNormal = scale(frame.r, cap.facing);
  const k = Math.abs(dot(returnNormal, frame.r));
  const loop = source?.loop && transformOutline(source.loop, ([depth, z]) => [k * depth, z]);
  const outline = source?.outline ?? (loop && ['return', 'cope', 'waterfall'].includes(cap.type)
    ? placeAtEnd(loop, cap.side, k * source.offset, source.reference, cap.facing) : null);
  const edge = source?.edge ?? (outline && frontContour(outline, cap.facing ?? (index === 0 ? 1 : -1)))
    ?? [[cap.x, z, 0], [cap.x, z + height, 0]];
  return cap.returnLength != null ? clipReturnEdge(edge, cap) : edge;
}

/** Conservative front depths between every section vertex, arc extreme and drawn height. */
function hidingStrips({ kind, z, height, section, segments }) {
  const front = segments[0].front;
  if (!section?.loop) return [{ z1: z, z2: z + height, front }];
  const { loop, reference, lineHeights } = section;
  const contour = frontContour(loop);
  // D1's absolute front includes the run face and the kind's forward placement (also for wood tops,
  // whose front overhang can differ from the side overhang used to place the end section).
  const { maxX } = outlineBounds(loop);
  const offset = front - (kind === 'crown' ? maxX : Math.max(0, maxX));
  const cuts = [z, ...[
    ...loop.map(([, sectionZ]) => reference + sectionZ),
    ...arcExtremes(loop).map(([, sectionZ]) => reference + sectionZ),
    ...(lineHeights ?? []),
  ].filter((cut) => cut > z + EPSILON && cut < z + height - EPSILON)
    .sort((a, b) => a - b)
    .filter((cut, index, all) => !index || cut - all[index - 1] > EPSILON), z + height];
  return cuts.slice(0, -1).map((z1, index) => {
    const z2 = cuts[index + 1];
    return { z1, z2, front: offset + Math.min(
      endEdgeX(contour, z1 - reference, 1), endEdgeX(contour, z2 - reference, 1),
    ) };
  });
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
  let band = { x: minX, z, width: maxX - minX, height, outline, lines, strips: hidingStrips(sweep) };
  if (sweep.waterfall) {
    const { ends, run, thickness, surface, overhangs } = sweep.waterfall;
    band = { ...band, ...waterfallBand(band, edges, ends, run, thickness, surface, overhangs) };
  }
  if (sweep.kind !== 'furnitureBase') return band;
  const cutouts = (sweep.cutouts ?? [])
    .filter(({ x0, x1 }) => x0 >= outline[0][0] - EPSILON && x1 <= outline[1][0] + EPSILON);
  return { ...insertBaseCutouts(band, cutouts), hasCutouts: cutouts.length > 0 };
}

function hasTurnLines(room, view, run, settings, scene, kind, band) {
  for (const side of ['left', 'right']) {
    if (run.ends?.[side]?.corner?.kind !== 45) continue;
    const corner = cornerEnd(room, view, run, side, settings, scene.result);
    if (!corner?.active || !corner.shape || !corner.columnId) continue;
    if (ownerBands(room, view, run, settings).filter((entry) => entry.kind === kind)
      .some((entry) => ownerBandTurnLines(corner, entry, band).length)) return true;
  }
  return false;
}

function eligibilityReason(room, path, settings, records) {
  if (path.segments.length !== 1 || path.vertices.some(({ type }) => type === 'joined')) return 'joined runs';
  const first = path.segments[0];
  if (path.segments.some(({ wallId, face }) => wallId !== first.wallId || face !== first.face)) return 'multiple faces';
  if (path.closed || path.vertices.some(({ type }) => type !== 'joined')) return 'non-joined vertices';
  if ([path.start, path.end].some((end) => end?.type === 'corner')) return 'corner caps';
  records ??= eligibilityRecords(room, path, settings);
  if (records.some(({ turnLines }) => turnLines)) return 'Corner 45 turn lines';
  for (const rule of [path.start, path.end]) {
    const record = records.find(({ run }) => run.id === rule.runId);
    const old = record.ends[rule.side === 'left' ? 0 : 1].type;
    // Class B stops at the projection face instead of carrying the old return.
    if (old === 'return' && rule.type === 'die-in' && rule.against?.kind === 'solid') continue;
    const current = rule.type === 'die-in' ? 'square'
      : rule.type === 'waterfall' ? (path.kind === 'countertop' ? 'return' : 'square') : rule.type;
    if (old !== current) return `cap type ${old} → ${rule.type}`;
  }
  return null;
}

/** Exclusions shared by every consumer of the straight sweep. */
export function sweepEligible(room, path, settings, records) {
  if (records) return eligibilityReason(room, path, settings, records);
  const cache = buildCacheFor(room);
  const build = () => eligibilityReason(room, path, settings);
  return cache ? cache.byRoom(`sweepEligible:${path.id}`, room, settings, build) : build();
}

function eligibilityRecords(room, path, settings) {
  return path.segments.map((segment) => {
    const wall = room.walls.find(({ id }) => id === segment.wallId);
    const frame = wallSideFrame(room, wall, segment.face);
    const view = { ...wallSideView(wall, segment.face), length: frame.length };
    const run = view.runs.find(({ id }) => id === segment.runId);
    const scene = runScene(room, view, run, settings);
    const band = ['left', 'right'].some((side) => run.ends?.[side]?.corner?.kind === 45)
      ? viewRun(room, path, run.id, settings) : null;
    return { run,
      ends: runBandEnds(room, view, run, settings, scene, path.kind, path.z, path.height),
      turnLines: band && hasTurnLines(room, view, run, settings, scene, path.kind, band) };
  });
}

/** A one-run wall view, split at top inserts or open floor spans; joined runs are deferred. */
export function viewRun(room, path, runId, settings) {
  if (path.segments.length !== 1 || path.segments[0].runId !== runId) return null;
  const sweep = sweepBand(room, path, settings);
  if (!sweep) return null;
  const segment = sweep.segments[0];
  const wall = room.walls.find(({ id }) => id === segment.wallId);
  const frame = wallSideFrame(room, wall, segment.face);
  const view = { ...wallSideView(wall, segment.face), length: frame.length };
  const run = view.runs.find(({ id }) => id === runId);
  const scene = runScene(room, view, run, settings);
  const band = viewFromWall(room, sweep, wall, segment.face);
  if (!band) return null;
  let pieces = [band];
  if (path.kind === 'countertop') {
    const top = runTop(view, run, resolveProfile(settings, room, view));
    const surface = sweep.section || sweep.waterfall ? band
      : { x: band.x, z: band.z, width: band.width, height: band.height };
    // The shared top splitter rejects crossed or empty spans before clipping their outlines.
    pieces = segmentedCountertop(run, scene, top, surface).countertops;
  } else if (sweep.gaps.length && ['toeKick', 'furnitureBase'].includes(path.kind)) {
    const base = runBase(room, view, run, settings, scene);
    pieces = runBaseSpans(room, view, run, settings, scene, path.kind, base)
      .filter(({ ends: [left, right] }) => right.x > left.x + EPSILON)
      .map(({ start, end, ends }) => {
        const caps = ends.map((cap, index) => {
          if (index === 0 ? start === run.x : end === run.x + run.width) return sweep.caps[index];
          return { ...cap, ...(cap.base ? { source: sectionFor(room, view, run, path.kind, settings) ?? {} } : {}) };
        });
        return viewFromWall(room, { ...sweep, caps }, wall, segment.face);
      }).filter((piece) => piece.width > EPSILON);
  }
  return { ...band, pieces,
    ends: runBandEnds(room, view, run, settings, scene, path.kind, path.z, path.height) };
}
