import { bandFronts } from './bandParts.js';
import { bandPaths } from './bandPaths.js';
import { partStrips } from './bandStrips.js';
import { bandOutline, clipReturnEdge, endEdgeX, frontContour, placeAtEnd, returnedX } from './bandEnds.js';
import { insertBaseCutouts } from './baseCutouts.js';
import { buildCacheFor } from './buildCache.js';
import { cornerBandEdge, lazyCornerShapes, profileBandJoint } from './cornerBands.js';
import { cornerReturnPoint, frontDepth, runBackOffset } from './corners.js';
import { floorOpenings } from './floorOpenings.js';
import { whileBuildingPaths } from './pathBuilding.js';
import { runBase, runBaseProfile } from './furnitureBase.js';
import { add, dot, normalize, planPointToWallX, scale, subtract } from './geometry.js';
import { moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { bandPast, freeEdge, runBandEnds, runBaseSpans, segmentedCountertop, waterfallBand, waterfallEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { arcExtremes, flattenOutline, outlineBounds, sectionProfileOutline, transformOutline } from './sectionProfileOutline.js';
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
  if (rule.x != null && rule.against?.kind === 'corner') {
    return { type, x: rule.x, side: rule.jointX, facing: side === 'left' ? -1 : 1,
      source: sectionFor(room, view, run, kind, settings, side) };
  }
  const facing = side === 'left' ? -1 : 1;
  const edge = side === 'left' ? run.x : run.x + run.width;
  const returned = (source, end) => {
    const facing = end === 'left' ? -1 : 1;
    const x = freeEdge(room, view, source, end, kind, settings);
    // An explicit plain source must not inherit the receiving run's profile at a cope.
    return { type, x, side: x - facing * bandPast(room, view, source, end, kind, settings), facing,
      source: sectionFor(room, view, source, kind, settings, end) ?? {} };
  };
  // Switching mitre-only paths retains their profiled cap at a solid. Toe kicks
  // instead die into that solid without the free-end setback.
  if (type === 'die-in' && rule.against?.kind === 'solid' && kind !== 'toeKick'
    && path.vertices.some(({ type }) => type === 'mitre')
    && path.vertices.every(({ type }) => type === 'mitre' || type === 'joined')) {
    const scene = runScene(room, view, run, settings);
    const end = runBandEnds(room, view, run, settings, scene, kind, z, height)[side === 'left' ? 0 : 1];
    if (end.type === 'return') return { ...end, source: sectionFor(room, view, run, kind, settings, side) };
  }
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

/** The D3 data that belongs to an actual run, never to a corner leg or diagonal. */
function runSweepDetails(room, view, run, kind, settings, origin) {
  const scene = runScene(room, view, run, settings);
  const openings = kind === 'countertop'
    ? segmentedCountertop(run, scene, runTop(view, run, resolveProfile(settings, room, view)), null).topSegments
    : ['toeKick', 'furnitureBase'].includes(kind)
      ? floorOpenings(run, scene.cells).filter(({ baseUnder }) => !baseUnder) : [];
  const gaps = openings.map(({ x, width }) => ({ start: x - origin, end: x + width - origin }));
  const top = runTop(view, run, resolveProfile(settings, room, view));
  const waterfall = kind === 'countertop' && waterfallEnds(room, view, run, settings);
  return { gaps,
    ...(waterfall && (waterfall.left || waterfall.right) ? { waterfall: {
      ends: waterfall, run, thickness: top.height, surface: run.z + run.height + top.height,
      overhangs: topOverhangs(room, view, run, settings),
    } } : {}),
    ...(kind === 'furnitureBase' ? { cutouts: runBase(room, view, run, settings).cutouts ?? [] } : {}),
  };
}

/** Resolve each corner member in its own face, retaining the owner's section on leg B. */
function cornerSweep(room, path, settings) {
  const segments = path.segments.map((segment) => {
    const wall = room.walls.find(({ id }) => id === segment.wallId);
    let frame = wallSideFrame(room, wall, segment.face);
    const ownerWall = segment.corner ? room.walls.find(({ id }) => id === segment.corner.ownerWallId) : wall;
    const run = ownerWall.runs.find(({ id }) => id === segment.runId);
    const view = { ...wallSideView(ownerWall, run.wallSide ?? 'front'),
      length: wallSideFrame(room, ownerWall, run.wallSide ?? 'front').length };
    const section = sectionFor(room, view, run, path.kind, settings);
    const front = bandFronts(room, view, run, settings)[path.kind];
    const overhangs = topOverhangs(room, view, run, settings);
    const past = path.kind === 'countertop'
      ? nosingProjection(moldingProfiles(resolveProfile(settings, room, view), settings, run).nosing)
      : bandPast(room, view, run, 'left', path.kind, settings);
    const placedLoop = section && placeAtEnd(section.loop, front - past,
      path.kind === 'countertop' ? 0 : section.offset, section.reference);
    const band = { front, overhangs, placedLoop, contour: placedLoop && frontContour(placedLoop) };
    if (segment.diagonal) {
      const r = normalize(subtract(segment.to, segment.from));
      let n = { x: -r.y, y: r.x };
      if (dot(n, frame.n) < 0) n = scale(n, -1);
      frame = { ...frame, r, n };
    }
    if (segment.return) {
      frame = { ...frame, r: normalize(subtract(segment.to, segment.from)),
        n: scale(frame.r, segment.returnSide === 'left' ? -1 : 1) };
    }
    return { ...segment, frame, section, band,
      ...(!segment.corner && !segment.return ? runSweepDetails(room, view, run, path.kind, settings, segment.x1) : {}) };
  });
  const caps = [path.start, path.end].map((rule, index) => {
    const segment = index === 0 ? segments[0] : segments.at(-1);
    const wall = room.walls.find(({ id }) => id === segment.wallId);
    const view = { ...wallSideView(wall, segment.face), length: segment.frame.length };
    if (!rule.memberKey) return capFor(room, path, rule, view, settings);
    const source = segment.section && { ...segment.section,
      offset: path.kind === 'countertop' ? segment.band.overhangs[rule.side] : segment.section.offset };
    return { type: rule.type, x: rule.x, side: rule.jointX,
      facing: rule.side === 'left' ? -1 : 1, source };
  });
  if (caps.some((cap) => !cap)) return null;
  return { pathId: path.id, kind: path.kind, z: path.z, height: path.height,
    segments, vertices: path.vertices, caps, gaps: [], section: segments[0].section };
}

/** Carry a section and its end rules along the path's wall faces and corner turns. */
export function sweepBand(room, path, settings) {
  if (!path) return null;
  const cache = buildCacheFor(room);
  const build = () => whileBuildingPaths(() => sweepBandOf(room, path, settings));
  return cache ? cache.byPath('sweepBand', room, path, settings, undefined, build) : build();
}

function sweepBandOf(room, path, settings) {
  if (!path || !KINDS.has(path.kind) || path.closed || !path.segments.length
    || path.vertices.some(({ type }) => !['joined', 'turn', 'mitre'].includes(type))
    || ![path.start, path.end].every((rule) => rule && CAP_TYPES.has(rule.type))) return null;
  const first = path.segments[0];
  if (path.segments.some(({ corner, diagonal }) => corner || diagonal)
    || path.vertices.some(({ type }) => type !== 'joined')) return cornerSweep(room, path, settings);
  if (path.segments.some(({ wallId, face }) => wallId !== first.wallId || face !== first.face)) return null;
  const wall = room.walls.find(({ id }) => id === first.wallId);
  const frame = wallSideFrame(room, wall, first.face);
  const view = { ...wallSideView(wall, first.face), length: frame.length };
  const caps = [path.start, path.end].sort((a, b) => a.side === b.side ? 0 : a.side === 'left' ? -1 : 1)
    .map((rule) => capFor(room, path, rule, view, settings));
  if (caps.some((cap) => !cap)) return null;
  const run = view.runs.find(({ id }) => id === first.runId);
  const details = path.segments.map((segment) => runSweepDetails(room, view,
    view.runs.find(({ id }) => id === segment.runId), path.kind, settings, first.x1));
  return {
    pathId: path.id, kind: path.kind, z: path.z, height: path.height,
    ...details[0], gaps: details.flatMap(({ gaps }) => gaps),
    section: sectionFor(room, view, run, path.kind, settings),
    segments: path.segments.map((segment) => ({ ...segment, frame })), caps,
    ...(path.kind === 'furnitureBase' ? {
      cutouts: details.flatMap(({ cutouts }) => cutouts).sort((a, b) => a.x0 - b.x0),
    } : {}),
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

/**
 * Conservative insets between every section vertex, arc extreme and drawn height (SPEC-D7): how far each
 * strip's shallower edge sits behind the profile's deepest point over the band's height. The part adds
 * its own front (`partStrips`).
 */
function hidingStrips({ z, height, section }) {
  if (!section?.loop) return [{ z1: z, z2: z + height, inset: 0 }];
  const { loop, reference, lineHeights } = section;
  const contour = frontContour(loop);
  const cuts = [z, ...[
    ...loop.map(([, sectionZ]) => reference + sectionZ),
    ...arcExtremes(loop).map(([, sectionZ]) => reference + sectionZ),
    ...(lineHeights ?? []),
  ].filter((cut) => cut > z + EPSILON && cut < z + height - EPSILON)
    .sort((a, b) => a - b)
    .filter((cut, index, all) => !index || cut - all[index - 1] > EPSILON), z + height];
  const edges = cuts.map((cut) => endEdgeX(contour, cut - reference, 1));
  const deepest = Math.max(...edges);
  return cuts.slice(0, -1).map((z1, index) => ({
    z1, z2: cuts[index + 1], inset: deepest - Math.min(edges[index], edges[index + 1]),
  }));
}

function flatEdge(x, { z, height }) {
  return [[x, z, 0], [x, z + height, 0]];
}

/** Project a section's front contour; non-circular foreshortened arcs become chords. */
function contourEdge(segment, at, direction, frame, sweep, flatten = false) {
  const contour = segment.band?.contour;
  if (!contour) return flatEdge(planPointToWallX(frame, at), sweep);
  const points = flatten ? flattenOutline(contour).map(([q, z]) => [q, z, 0]) : contour;
  const k = dot(direction, frame.r);
  return transformOutline(points, ([q, z]) => [
    planPointToWallX(frame, at) + k * (q - segment.band.front), z,
  ], k < 0);
}

function vertexEdge(sweep, index, frame) {
  const vertex = sweep.vertices[index];
  const a = sweep.segments[index];
  const b = sweep.segments[index + 1];
  if (vertex.type === 'joined') return flatEdge(planPointToWallX(frame, vertex.at), sweep);
  const direction = scale(add(a.frame.n, b.frame.n), 1 / (1 + dot(a.frame.n, b.frame.n)));
  const owner = sweep.segments.find((segment) => !segment.corner
    && segment.wallId === vertex.corner?.ownerWallId && segment.runId === vertex.corner.runId);
  return contourEdge(owner ?? a, vertex.at, direction, frame, sweep, true);
}

/** A mitre member's own section, using the same vertex and bisector as D4's turn contour. */
export function mitreEdge(sweep, index, member, frame) {
  const a = sweep.segments[index];
  const b = sweep.segments[index + 1];
  const direction = scale(add(a.frame.n, b.frame.n), 1 / (1 + dot(a.frame.n, b.frame.n)));
  const other = a === member ? b : a;
  // An unpicked neighbour meets the section with a plain, vertical boundary.
  return contourEdge(other.section ? member : other, sweep.vertices[index].at, direction, frame, sweep);
}

function projectedCap(sweep, index, frame) {
  const segment = index === 0 ? sweep.segments[0] : sweep.segments.at(-1);
  const cap = sweep.caps[index];
  const edge = capEdge(cap, segment.section, segment.frame, sweep.z, sweep.height, index, sweep.kind);
  return transformOutline(edge, ([x, z]) => [planPointToWallX(frame,
    add(segment.frame.leftPoint, add(scale(segment.frame.r, x), scale(segment.frame.n, segment.front)))), z],
  dot(segment.frame.r, frame.r) < 0);
}

/** Assemble one view from its contour boundaries and the visible interior turn contours. */
function cornerView(sweep, frame, edges, section, turns = sweep.vertices.map((_, i) => i)) {
  edges.sort((a, b) => endEdgeX(a, sweep.z, -1) - endEdgeX(b, sweep.z, -1));
  const outline = bandOutline(...edges, sweep.z, sweep.height);
  const { minX, maxX } = outlineBounds(outline);
  const lines = [];
  for (const lineZ of section?.lineHeights ?? []) {
    if (lineZ <= sweep.z + EPSILON || lineZ >= sweep.z + sweep.height - EPSILON
      || lines.some((line) => Math.abs(line.z1 - lineZ) <= EPSILON)) continue;
    lines.push({ x1: endEdgeX(edges[0], lineZ, -1), z1: lineZ,
      x2: endEdgeX(edges[1], lineZ, 1), z2: lineZ });
  }
  for (const index of turns) {
    const vertex = sweep.vertices[index];
    const x = planPointToWallX(frame, vertex.at);
    if (vertex.type !== 'turn' || x <= minX + EPSILON || x >= maxX - EPSILON) continue;
    // A 90-degree turn projects to the boundary contour of the end-on member.
    const a = sweep.segments[index];
    const b = sweep.segments[index + 1];
    if (Math.abs(dot(a.frame.r, frame.r)) <= EPSILON || Math.abs(dot(b.frame.r, frame.r)) <= EPSILON) continue;
    const edge = vertexEdge(sweep, index, frame);
    lines.push(...edge.slice(1).map(([x2, z2], i) => ({ x1: edge[i][0], z1: edge[i][1], x2, z2 })));
  }
  return { x: minX, z: sweep.z, width: maxX - minX, height: sweep.height, outline, lines,
    strips: hidingStrips({ ...sweep, section }) };
}

function cornerWallView(sweep, frame) {
  const boundaries = [0, 1].map((index) => {
    const segment = index === 0 ? sweep.segments[0] : sweep.segments.at(-1);
    if (Math.abs(dot(segment.frame.r, frame.r)) <= EPSILON) {
      return contourEdge(segment, segment.from, segment.frame.n, frame, sweep);
    }
    return projectedCap(sweep, index, frame);
  });
  const segment = sweep.segments.find((segment) => !segment.diagonal
    && Math.abs(dot(segment.frame.r, frame.r)) > EPSILON);
  return cornerView(sweep, frame, boundaries, segment?.section ?? sweep.section);
}

/** See a sweep along the viewing wall's horizontal axis. Straight sweeps retain D3's view. */
export function viewFromWall(room, sweep, wall, face = wall.side ?? 'front') {
  if (!sweep || !KINDS.has(sweep.kind) || !sweep.segments.length) return null;
  if (sweep.vertices) return cornerWallView(sweep, wallSideFrame(room, wall, face));
  if (sweep.segments.some(({ wallId, face: side }) => wallId !== wall.id || side !== face)) return null;
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
  const band = { x: minX, z, width: maxX - minX, height, outline, lines, strips: hidingStrips(sweep) };
  return finishRunBand(sweep, band, edges);
}

/** Apply the run-owned waterfall ends and furniture cutouts after projecting its edges. */
function finishRunBand(sweep, band, edges) {
  if (sweep.waterfall) {
    const { ends, run, thickness, surface, overhangs } = sweep.waterfall;
    band = { ...band, ...waterfallBand(band, edges, ends, run, thickness, surface, overhangs) };
  }
  if (sweep.kind !== 'furnitureBase') return band;
  const cutouts = (sweep.cutouts ?? [])
    .filter(({ x0, x1 }) => x0 >= band.outline[0][0] - EPSILON && x1 <= band.outline[1][0] + EPSILON);
  return { ...insertBaseCutouts(band, cutouts), hasCutouts: cutouts.length > 0 };
}

/** Follow the owner's diagonal to the turn where the next member becomes end-on. */
function ownerCornerEdge(sweep, index, owner, frame) {
  let vertex = sweep.vertices[index];
  let at = vertex.at;
  let endOn = sweep.segments[index] === owner ? sweep.segments[index + 1] : sweep.segments[index];
  let direction = endOn.frame.n;
  if (endOn.diagonal) {
    const diagonalIndex = sweep.segments.indexOf(endOn);
    const next = diagonalIndex > sweep.segments.indexOf(owner) ? diagonalIndex : diagonalIndex - 1;
    if (sweep.vertices[next]) {
      vertex = sweep.vertices[next];
      at = vertex.at;
      endOn = sweep.segments[next] === endOn ? sweep.segments[next + 1] : sweep.segments[next];
      direction = endOn.frame.n;
    } else {
      // The path ends on the diagonal (no leg): the owner still runs to the diagonal's far end,
      // seen end-on to where leg B would run (square to the owner), never stopping at turn.a.
      const far = [endOn.from, endOn.to].reduce((a, b) => Math.hypot(a.x - vertex.at.x, a.y - vertex.at.y)
        >= Math.hypot(b.x - vertex.at.x, b.y - vertex.at.y) ? a : b);
      const n = owner.frame.n;
      const perpendicular = { x: -n.y, y: n.x };
      at = far;
      direction = dot(perpendicular, endOn.frame.n) >= 0 ? perpendicular : { x: n.y, y: -n.x };
    }
  }
  return contourEdge(owner, at, direction, frame, sweep);
}

/** Cut a corner sweep at a member's joins and the turn where its path goes end-on. */
function cornerMemberView(room, path, sweep, member, settings) {
  const leg = member.startsWith('corner-leg:');
  const segment = sweep.segments.find((segment) => leg ? segment.memberKey === member
    : !segment.corner && !segment.return && segment.runId === member);
  // A 45 leg can have zero plan length; its diagonal still has a projected leg part.
  const diagonal = leg && sweep.segments.find((segment) => segment.diagonal
    && segment.memberKey.replace('corner-diagonal:', 'corner-leg:') === member);
  if (!segment && !diagonal) return null;
  if (leg) {
    const tag = (segment ?? diagonal).corner;
    const ownerWall = room.walls.find(({ id }) => id === tag.ownerWallId);
    const owner = ownerWall.runs.find(({ id }) => id === tag.runId);
    const point = cornerReturnPoint(room, wallSideView(ownerWall, owner.wallSide ?? 'front'), owner, tag.side);
    const wall = room.walls.find(({ id }) => id === point.wallId);
    const frame = wallSideFrame(room, wall, point.wallSide);
    const ownerSegment = sweep.segments.find((segment) => !segment.corner && segment.runId === owner.id);
    const near = contourEdge(ownerSegment, ownerSegment[tag.side === 'left' ? 'from' : 'to'],
      ownerSegment.frame.n, frame, sweep);
    const index = sweep.segments.indexOf(segment ?? diagonal);
    const nearIndex = sweep.vertices.findIndex((vertex, i) => vertex.corner?.runId === owner.id
      && vertex.corner.side === tag.side && (sweep.segments[i] === ownerSegment || sweep.segments[i + 1] === ownerSegment));
    // Walk away from the owner, independent of the component's traversal direction.
    const towardEnd = index > sweep.segments.indexOf(ownerSegment);
    const joint = towardEnd ? index : index - 1;
    const far = joint < 0 ? projectedCap(sweep, 0, frame)
      : joint >= sweep.vertices.length ? projectedCap(sweep, 1, frame) : vertexEdge(sweep, joint, frame);
    const turns = sweep.vertices.map((_, i) => i).filter((i) => i !== nearIndex && i !== joint
      && sweep.vertices[i].corner?.runId === owner.id && sweep.vertices[i].corner.side === tag.side);
    const band = cornerView(sweep, frame, [near, far], ownerSegment.section, turns);
    return { ...band, pieces: [{ ...band, profiled: !!ownerSegment.section?.loop }], ends: [] };
  }
  const index = sweep.segments.indexOf(segment);
  const wall = room.walls.find(({ id }) => id === segment.wallId);
  const frame = wallSideFrame(room, wall, segment.face);
  const view = { ...wallSideView(wall, segment.face), length: segment.frame.length };
  const run = view.runs.find(({ id }) => id === member);
  const edges = ['left', 'right'].map((side) => {
    const at = segment[side === 'left' ? 'from' : 'to'];
    const joint = sweep.vertices.findIndex((vertex, i) => (i === index || i + 1 === index)
      && Math.hypot(vertex.at.x - at.x, vertex.at.y - at.y) <= EPSILON);
    if (joint >= 0) {
      const vertex = sweep.vertices[joint];
      if (vertex.type === 'mitre') {
        const edge = mitreEdge(sweep, joint, segment, frame);
        const other = sweep.segments[joint] === segment ? sweep.segments[joint + 1] : sweep.segments[joint];
        // Return sections measure depth from the neighbour's wall face; its back-face
        // origin includes wall thickness, which is already accounted for by that section.
        const otherWall = room.walls.find(({ id }) => id === other.wallId);
        const offset = other.face === 'back' ? Math.max(0, otherWall.thickness ?? 0) : 0;
        return offset ? transformOutline(edge, ([x, z]) => [x - offset * dot(other.frame.n, frame.r), z]) : edge;
      }
      const tag = vertex.corner;
      if (tag?.runId === run.id && tag.ownerWallId === wall.id) {
        return ownerCornerEdge(sweep, joint, segment, frame);
      }
      return vertexEdge(sweep, joint, frame);
    }
    const cap = [path.start, path.end].findIndex((end) => end.runId === run.id && end.side === side);
    return projectedCap(sweep, cap, frame);
  });
  const memberSweep = { ...sweep, ...segment,
    caps: edges.map((edge, i) => ({ type: 'square', x: endEdgeX(edge, path.z, i === 0 ? -1 : 1) })) };
  const owns = sweep.vertices.some(({ corner }) => corner?.runId === run.id && corner.ownerWallId === wall.id);
  const turns = owns ? undefined : [];
  const project = (caps) => {
    const memberEdges = caps.map((cap, i) => cap === memberSweep.caps[i] ? edges[i]
      : capEdge(cap, segment.section, frame, path.z, path.height, i, path.kind));
    // Only the owner shows its corner's turn contours inside its span; a return run ends at its own edge.
    return finishRunBand(memberSweep, cornerView(sweep, frame, memberEdges, segment.section, turns), memberEdges);
  };
  const band = project(memberSweep.caps);
  const scene = runScene(room, view, run, settings);
  return splitRunView(room, path, view, run, settings, scene, memberSweep, band, project);
}

/** D3's run splitting, shared by straight, joined and corner-owner members. */
function splitRunView(room, path, view, run, settings, scene, sweep, band, project) {
  let pieces = [band];
  if (path.kind === 'countertop') {
    const top = runTop(view, run, resolveProfile(settings, room, view));
    const surface = sweep.section || sweep.waterfall || band.lines?.length ? band
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
        return project(caps);
      }).filter((piece) => piece.width > EPSILON);
  }
  return { ...band, pieces,
    ends: runBandEnds(room, view, run, settings, scene, path.kind, path.z, path.height, undefined, path) };
}

/** A member's wall view, split at top inserts or open floor spans. */
export function viewRun(room, path, runId, settings) {
  if (!path) return null;
  const cache = buildCacheFor(room);
  const build = () => whileBuildingPaths(() => viewRunOf(room, path, runId, settings));
  return cache ? cache.byPath('viewRun', room, path, settings, runId, build) : build();
}

function viewRunOf(room, path, runId, settings) {
  const sweep = sweepBand(room, path, settings);
  if (!sweep) return null;
  if (sweep.vertices) return cornerMemberView(room, path, sweep, runId, settings);
  const segment = sweep.segments.find(({ runId: id }) => id === runId);
  if (!segment) return null;
  const wall = room.walls.find(({ id }) => id === segment.wallId);
  const frame = wallSideFrame(room, wall, segment.face);
  const view = { ...wallSideView(wall, segment.face), length: frame.length };
  const run = view.runs.find(({ id }) => id === runId);
  const scene = runScene(room, view, run, settings);
  const memberSweep = sweep.segments.length === 1 ? sweep : {
    ...sweep, waterfall: null, ...runSweepDetails(room, view, run, path.kind, settings, segment.x1),
    section: sectionFor(room, view, run, path.kind, settings), segments: [segment],
    caps: ['left', 'right'].map((side, index) => {
      if ([path.start, path.end].some((end) => end.runId === runId && end.side === side)) return sweep.caps[index];
      const x = segment[index === 0 ? 'x1' : 'x2'];
      return { type: 'square', x, side: x, facing: index === 0 ? -1 : 1 };
    }),
  };
  const band = viewFromWall(room, memberSweep, wall, segment.face);
  if (!band) return null;
  return splitRunView(room, path, view, run, settings, scene, memberSweep, band,
    (caps) => viewFromWall(room, { ...memberSweep, caps }, wall, segment.face));
}

const legPaths = new WeakMap();

/**
 * Leg bands carry an outline as before: a profiled 45's always, anything else only when it isn't a plain
 * rectangle (a profiled Corner 90 leg now draws its profile).
 */
const legOutline = ({ outline, x, width, profiled }, kind) => outline && (kind === 45 && profiled
  || !(outline.length === 4
    && outline.every(([px]) => Math.abs(px - x) <= EPSILON || Math.abs(px - x - width) <= EPSILON)));

/**
 * One corner's leg bands on its return face, from the paths' leg members, cut by `viewRun`.
 */
export function cornerLegBandParts(room, ownerWallId, owner, side, settings) {
  const cache = buildCacheFor(room);
  const build = () => buildCornerLegBandParts(room, ownerWallId, owner, side, settings);
  // Resolved wall views can clone the owner; every consumer shares its stored wall/run/end key.
  const key = `cornerLegBandParts:${ownerWallId}:${owner.id}:${side}`;
  return cache ? cache.byRoom(key, room, settings, build) : build();
}

function buildCornerLegBandParts(room, ownerWallId, owner, side, settings) {
  const { paths } = bandPaths(room, settings);
  let index = legPaths.get(paths);
  if (!index) {
    index = new Map();
    for (const path of paths) for (const segment of path.segments) {
      if (!segment.corner || !segment.memberKey) continue;
      const key = segment.memberKey.replace('corner-diagonal:', 'corner-leg:');
      if (!index.has(key)) index.set(key, { path, segment: null });
      if (segment.corner.leg === 'b') index.get(key).segment = segment;
    }
    legPaths.set(paths, index);
  }
  const prefix = `corner-leg:${ownerWallId}:${owner.id}:${side}:`;
  const parts = [];
  for (const [key, { path, segment }] of index) {
    if (!key.startsWith(prefix)) continue;
    const view = viewRun(room, path, key, settings)?.pieces[0];
    if (!view || view.width <= EPSILON) continue;
    const diagonal = segment ? null : path.segments.find((candidate) => candidate.diagonal
      && candidate.memberKey.replace('corner-diagonal:', 'corner-leg:') === key);
    let front = segment?.front;
    if (front === undefined) {
      // A 45 whose diagonal mitres straight into the return run has no leg segment: its far end sits at frontB.
      const ownerWall = room.walls.find(({ id }) => id === ownerWallId);
      const point = cornerReturnPoint(room, wallSideView(ownerWall, owner.wallSide ?? 'front'), owner, side);
      const frame = wallSideFrame(room, room.walls.find(({ id }) => id === point.wallId), point.wallSide);
      front = dot(subtract(diagonal.to, frame.leftPoint), frame.n);
    }
    const part = { id: key, kind: key.slice(prefix.length), ownerWallId, runId: owner.id, side,
      x: view.x, z: view.z, width: view.width, height: view.height, back: runBackOffset(owner), front,
      ...(legOutline(view, (segment ?? diagonal).corner.kind) ? { outline: view.outline } : {}),
      ...(view.lines?.length ? { lines: view.lines } : {}) };
    const strips = partStrips(view.strips, { z: view.z, height: view.height, front });
    parts.push(strips ? { ...part, strips } : part);
  }
  return parts;
}
