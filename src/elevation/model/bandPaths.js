import { bandFronts } from './bandParts.js';
import { buildCacheFor } from './buildCache.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { cornerBandEdge, lazyCornerShapes, profileBandJoint } from './cornerBands.js';
import { cornerLegBandJointsForOwner } from './cornerLegBands.js';
import { cornerAt, cornerEndActive, cornerReturnPoint, frontDepth, runBackOffset } from './corners.js';
import { floorEndOpen } from './floorOpenings.js';
import { runBase } from './furnitureBase.js';
import { elevationToPlan, lineIntersection, scale, subtract } from './geometry.js';
import { moldingProfiles } from './moldingProfiles.js';
import { woodTopSection } from './nosing.js';
import { wallEndPanelPartKey } from './parts.js';
import { resolveProfile } from './profile.js';
import { recessesOn } from './recesses.js';
import { bandPast, carries, freeEdge, isOpenWallEnd, touching, wallReach, waterfallEnds } from './runBands.js';
import { runScene } from './runScene.js';
import { topOverhangs } from './topOverhang.js';
import { isCountertop, runMoldings, runTop } from './tops.js';
import { wallNumbers } from './topology.js';
import { WALL_SIDES, wallEndPanelAt, wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const SIDES = ['left', 'right'];
const opposite = (side) => side === 'left' ? 'right' : 'left';
const same = (a, b) => Math.abs(a - b) <= EPSILON;
const endKey = (entry, side) => `${entry.segment.memberKey ?? entry.run.id}|${entry.kind}|${entry.z}|${side}`;
const PART_KINDS = {
  toeKick: 'toe_kick', furnitureBase: 'furniture_base', countertop: 'countertop',
  topMold: 'top_mold', crown: 'crown',
};

/** The main bands and the section heights passed to runBandEnds, before any end cuts. */
function runEntries(room, source, face, settings) {
  const frame = wallSideFrame(room, source, face);
  const view = { ...wallSideView(source, face), length: frame.length };
  const profile = resolveProfile(settings, room, view);
  const shapes = lazyCornerShapes(room, view, settings);
  return view.runs.flatMap((run) => {
    const scene = runScene(room, view, run, settings);
    const base = runBase(room, view, run, settings, scene);
    const top = runTop(view, run, profile);
    const drawn = runMoldings(view, run, profile, settings);
    const fronts = bandFronts(room, view, run, settings);
    const boxTop = run.z + run.height;
    const bands = [];
    if (base.kind === 'toe_kick' || base.kind === 'furniture_base') {
      bands.push([base.kind === 'toe_kick' ? 'toeKick' : 'furnitureBase', 0, base.height]);
    }
    if (isCountertop(top.kind)) {
      const overhangs = topOverhangs(room, view, run, settings);
      const section = top.kind === 'wood' && woodTopSection(
        moldingProfiles(profile, settings, run).nosing, top.height,
        runBackOffset(run) - overhangs.back - frontDepth(run, settings) - overhangs.front,
      );
      const z = section ? boxTop + top.height + section.minY : boxTop;
      bands.push(['countertop', z, boxTop + top.height - z]);
    }
    if (drawn.topMold) bands.push(['topMold', boxTop, profile.topMoldHeight]);
    if (drawn.crown) {
      bands.push(['crown', boxTop + profile.crownStackHeight - profile.crownHeight, profile.crownHeight]);
    }
    const x1 = Math.min(run.x, scene.panelBySide.left?.x ?? run.x);
    const x2 = Math.max(run.x + run.width, scene.panelBySide.right
      ? scene.panelBySide.right.x + scene.panelBySide.right.width : run.x + run.width);
    return bands.map(([kind, z, height]) => ({
      run, view, scene, shapes, frame, top, kind, z, height,
      segment: { runId: run.id, wallId: source.id, face, x1, x2, front: fronts[kind],
        from: elevationToPlan(frame, x1, fronts[kind]), to: elevationToPlan(frame, x2, fronts[kind]) },
    }));
  });
}

function endRule(room, settings, entries, entry, side) {
  const { run, view, scene, shapes, kind, z, height, segment } = entry;
  const rule = (type, against, extra) => ({ type, runId: run.id, side,
    ...(against ? { against } : {}), ...extra });
  const againstRun = (other) => ({ kind: 'run', id: other.id });
  const furniture = kind === 'furnitureBase';
  const floorBand = furniture || kind === 'toeKick';
  const matching = (other) => other.kind === kind && same(other.z, z)
    && same(other.height, height);
  const link = (other, otherSide, type, at) => ({
    ...rule(type), other, otherSide, at,
    ...(type === 'mitre' && kind === 'countertop' && entry.top.kind === 'wood' && other.top.kind === 'wood'
      ? { mode: settings.woodTopCorner ?? DEFAULT_SETTINGS.woodTopCorner } : {}),
  });

  // Valid corner geometry replaces this free end with links after all run entries exist.
  if (cornerEndActive(room, view, run, side).active) {
    return rule('return', { kind: 'corner', ownerWallId: view.id, runId: run.id, side });
  }
  const panel = scene.panelBySide[side];
  if (panel) return rule('die-in', { kind: 'panel', id: `${run.id}:${side}` });
  const waterfall = (floorBand || kind === 'countertop') && waterfallEnds(room, view, run, settings)[side];
  if (waterfall) {
    if (!floorBand || waterfall.baseToLeg || topOverhangs(room, view, run, settings)[side] === 0) {
      return rule('waterfall');
    }
  }

  const neighbors = touching(view, run, side, furniture);
  const taller = !floorBand && neighbors.find((other) => other.z + other.height > run.z + run.height + EPSILON);
  if (taller) return rule('die-in', againstRun(taller));
  const floorEnds = new Map();
  const floorEnd = (other) => {
    if (!floorEnds.has(other.id)) {
      floorEnds.set(other.id, floorEndOpen(other, runScene(room, view, other, settings), opposite(side)));
    }
    return floorEnds.get(other.id);
  };
  const carriers = neighbors.filter((other) => carries(room, view, other, kind, settings)
    && !(floorBand && floorEnd(other).open)).flatMap((other) => entries.filter((candidate) => (
    candidate.run.id === other.id && candidate.view.id === view.id && candidate.view.side === view.side
      && matching(candidate)
  )));
  if (carriers.length) {
    const other = carriers.reduce((best, candidate) => candidate.segment.front > best.segment.front ? candidate : best);
    if (same(segment.front, other.segment.front)) {
      return rule('square'); // Same-wall joins remain separate run paths until D5.
    }
    return segment.front > other.segment.front ? rule('return') : rule('cope', againstRun(other.run));
  }
  if ((furniture && neighbors.length)
    || (kind === 'toeKick' && neighbors.some((other) => (floorEnd(other).open && floorEnd(other).onFloor)
      || carries(room, view, other, 'furnitureBase', settings)))) return rule('square');

  const edge = cornerBandEdge(shapes, run, side, kind, z, height);
  if (edge) {
    const other = entries.find((candidate) => candidate.run.id === edge.runId
      && candidate.view.id === edge.wallId && matching(candidate));
    if (other) {
      const otherSide = SIDES.find((end) => {
        const back = cornerBandEdge(other.shapes, other.run, end, kind, z, height);
        return back?.runId === run.id && back.wallId === view.id;
      });
      if (otherSide && Math.abs(segment.front - other.segment.front) <= 1 / 32) {
        const at = lineIntersection(segment.from, entry.frame.r, other.segment.from, other.frame.r);
        if (at) return link(other, otherSide, 'mitre', at);
      }
      return rule('cope', againstRun(other.run));
    }
    return rule('cope', edge.runId ? { kind: 'run', id: edge.runId } : { kind: 'wall', id: edge.wallId });
  }
  const joint = profileBandJoint(shapes, run, side, kind, z, height, frontDepth(run, settings));
  if (joint) {
    const shape = shapes().find((shape) => shape.parts.includes(joint.part));
    return rule(joint.relation === 'cope' ? 'cope' : 'return',
      joint.relation === 'cope' && shape?.runId ? { kind: 'run', id: shape.runId } : null);
  }
  if (!floorBand || furniture) {
    const reach = wallReach(room, view, run, side, settings);
    // Molding/base past comes from the same predicate as today's free end.
    const front = kind === 'countertop' ? segment.front
      : frontDepth(run, settings) + bandPast(room, view, run, side, kind, settings);
    if (reach !== null && front > reach + 1 / 64) return rule('return', null, { returnLength: front - reach });
  }
  const anchor = run.anchors?.[side];
  if (anchor?.to === 'recess') {
    const feature = recessesOn(view).find(({ id }) => id === anchor.recessId);
    if (feature?.kind === 'projection' && run._plane?.recessId !== feature.id
      && segment.front > feature.depth) {
      return rule('return', null, { returnLength: segment.front - feature.depth });
    }
    return rule('die-in', { kind: feature?.kind === 'projection' ? 'solid' : 'wall', id: anchor.recessId });
  }
  if (anchor?.to === 'wall') return rule('die-in', { kind: 'landing', id: anchor.wallId });
  if (anchor === true && !isOpenWallEnd(room, view, run, side, settings)) {
    const corner = cornerAt(room, view, side);
    if (corner.type === 'outside') return rule('return');
    const panel = wallEndPanelAt(room, view, side, settings);
    if (panel) return rule(kind === 'toeKick' ? 'die-in' : 'return',
      { kind: 'panel', id: wallEndPanelPartKey(view.id, panel.endpoint) });
    return rule('die-in', { kind: corner.anchorWallId ? 'landing' : 'wall',
      id: corner.anchorWallId ?? corner.neighborWallId ?? view.id });
  }
  return rule('return');
}

/** Extend owners around their cabinet fronts, then resolve the leg/return-run joint. */
function addCornerEntries(room, settings, entries, rules, sources) {
  const joints = new Map();
  const setEnd = (entry, side, type, extra = {}) => {
    rules.set(endKey(entry, side), { type, runId: entry.run.id, side,
      ...(entry.segment.memberKey ? { memberKey: entry.segment.memberKey } : {}), ...extra });
  };
  const connect = (a, aSide, b, bSide, type, at, corner) => {
    setEnd(a, aSide, type, { other: b, otherSide: bSide, at, corner });
    setEnd(b, bSide, type, { other: a, otherSide: aSide, at, corner });
    a.segment[aSide === 'left' ? 'from' : 'to'] = { ...at };
    b.segment[bSide === 'left' ? 'from' : 'to'] = { ...at };
  };
  for (const owner of [...entries]) for (const side of SIDES) {
    const point = cornerReturnPoint(room, owner.view, owner.run, side);
    if (!point) continue;
    const view = wallSideView(sources.get(point.wallId), point.wallSide);
    const cacheKey = `${owner.run.id}:${side}`;
    if (!joints.has(cacheKey)) {
      joints.set(cacheKey, cornerLegBandJointsForOwner(room, view, owner.view, owner.run, side, settings));
    }
    const joint = joints.get(cacheKey).find(({ band }) => band.kind === owner.kind
      && same(band.z, owner.z) && same(band.height, owner.height));
    if (!joint) continue;
    const { corner, turn, near, far, carriers, blocked, jointX, deepest, returned, miter, endX, blockingRun } = joint;
    const tag = { ownerWallId: owner.view.id, runId: owner.run.id, side, kind: corner.kind };
    const against = { kind: 'corner', ownerWallId: owner.view.id, runId: owner.run.id, side };
    const frame = wallSideFrame(room, sources.get(point.wallId), point.wallSide);
    const aX = corner.cornerX + corner.dir * turn.a[0];
    const bX = point.at + point.dir * turn.b[1];
    const a = elevationToPlan(owner.frame, aX, turn.frontA);
    const b = elevationToPlan(frame, bX, turn.frontB);
    owner.segment[side === 'left' ? 'x1' : 'x2'] = aX;
    owner.segment[side === 'left' ? 'from' : 'to'] = a;
    let previous = owner;
    let exit = side;
    if (corner.kind === 45) {
      const delta = subtract(b, a);
      const diagonal = { ...owner, frame: { ...owner.frame, r: scale(delta, 1 / Math.hypot(delta.x, delta.y)) },
        segment: { ...owner.segment, memberKey: `corner-diagonal:${owner.view.id}:${owner.run.id}:${side}:${PART_KINDS[owner.kind]}`,
          corner: tag, diagonal: true, from: a, to: b } };
      entries.push(diagonal);
      connect(owner, side, diagonal, 'left', 'turn', a, tag);
      previous = diagonal;
      exit = 'right';
    }
    // An equal-front 45 may meet its return run directly at the second turn.
    if (!same(bX, jointX)) {
      const leg = { ...owner, view, frame,
        segment: { runId: owner.run.id, wallId: point.wallId, face: point.wallSide,
          memberKey: `corner-leg:${owner.view.id}:${owner.run.id}:${side}:${PART_KINDS[owner.kind]}`,
          corner: { ...tag, leg: 'b' }, x1: Math.min(bX, jointX), x2: Math.max(bX, jointX), front: turn.frontB,
          from: elevationToPlan(frame, Math.min(bX, jointX), turn.frontB),
          to: elevationToPlan(frame, Math.max(bX, jointX), turn.frontB) } };
      entries.push(leg);
      connect(previous, exit, leg, near, 'turn', corner.kind === 45 ? b : a, tag);
      previous = leg;
      exit = far;
    }
    const legType = blocked ? 'die-in' : returned ? 'return'
      : same(turn.frontB, deepest) ? (miter ? 'turn' : 'joined') : 'square';
    setEnd(previous, exit, legType, { x: endX, jointX,
      ...(blockingRun ? { against: { kind: 'run', id: blockingRun.id } } : {}) });
    let linked = false;
    for (const carrier of carriers) {
      const entry = entries.find((candidate) => !candidate.segment.corner && candidate.run.id === carrier.run.id
        && candidate.view.id === view.id && candidate.view.side === view.side && candidate.kind === owner.kind);
      if (!entry || blocked) continue;
      const front = carrier.fronts[owner.kind];
      if (!linked && same(front, deepest) && same(front, turn.frontB)
        && (previous.segment.corner?.leg === 'b' || miter)) {
        connect(previous, exit, entry, near, miter ? 'turn' : 'joined',
          elevationToPlan(frame, jointX, turn.frontB), tag);
        linked = true;
      } else {
        const adjusted = { ...carrier.run, x: near === 'left' ? jointX : carrier.run.x,
          width: near === 'left' ? carrier.run.x + carrier.run.width - jointX : jointX - carrier.run.x };
        const type = front <= turn.frontB + EPSILON ? 'square' : 'return';
        setEnd(entry, near, type, { against, jointX,
          x: type === 'square' ? jointX : freeEdge(room, view, adjusted, near, owner.kind, settings) });
        entry.segment[near === 'left' ? 'from' : 'to'] = elevationToPlan(frame, jointX, front);
        entry.segment[near === 'left' ? 'x1' : 'x2'] = jointX;
      }
    }
  }
}

/** Front-line plan paths. Stored runs and all drawing geometry remain untouched. */
export function bandPaths(room, settings) {
  const cache = buildCacheFor(room);
  if (!cache) return buildBandPaths(room, settings);
  return cache.byRoom('bandPaths', room, settings, () => buildBandPaths(room, settings));
}

function buildBandPaths(room, settings) {
  const sources = new Map((room.walls ?? []).map((wall) => [wall.id, wall]));
  const entries = [...wallNumbers(room)].sort((a, b) => a[1] - b[1]).flatMap(([id]) => (
    WALL_SIDES.flatMap((face) => runEntries(room, sources.get(id), face, settings))
  ));
  const rules = new Map();
  for (const entry of entries) for (const side of SIDES) {
    rules.set(endKey(entry, side), endRule(room, settings, entries, entry, side));
  }
  addCornerEntries(room, settings, entries, rules, sources);
  // Only reciprocal joins can consume both run ends. A one-sided corner meet remains a cope.
  for (const entry of entries) for (const side of SIDES) {
    const key = endKey(entry, side);
    const rule = rules.get(key);
    if (!rule.other) continue;
    const back = rules.get(endKey(rule.other, rule.otherSide));
    if (back.other !== entry || back.otherSide !== side || back.type !== rule.type) {
      rules.set(key, { type: rule.type === 'mitre' ? 'cope' : 'return', runId: entry.run.id, side,
        ...(rule.type === 'mitre' ? { against: { kind: 'run', id: rule.other.run.id } } : {}) });
    }
  }
  const paths = [];
  const ends = new Map();
  const visited = new Set();
  const walk = (first, firstSide) => {
    const path = { id: `${first.kind}:${first.run.id}:${firstSide}`, kind: first.kind,
      z: first.z, height: first.height, segments: [], vertices: [],
      start: rules.get(endKey(first, firstSide)), end: null };
    let entry = first;
    let side = firstSide;
    while (!visited.has(entry)) {
      visited.add(entry);
      path.segments.push(entry.segment);
      for (const end of SIDES) {
        const endRule = Object.fromEntries(Object.entries(rules.get(endKey(entry, end)))
          .filter(([key]) => key !== 'other' && key !== 'otherSide'));
        ends.set(endKey(entry, end), { ...endRule, pathId: path.id });
      }
      const exit = opposite(side);
      const rule = rules.get(endKey(entry, exit));
      if (!rule.other) { path.end = rule; break; }
      const { other, otherSide, type, at, mode, corner } = rule;
      const direction = scale(entry.frame.r, side === 'left' ? 1 : -1);
      const nextDirection = scale(other.frame.r, otherSide === 'left' ? 1 : -1);
      const turn = type === 'joined' ? 0 : Math.atan2(
        direction.x * nextDirection.y - direction.y * nextDirection.x,
        direction.x * nextDirection.x + direction.y * nextDirection.y,
      ) * 180 / Math.PI;
      path.vertices.push({ type, turn, at, ...(mode ? { mode } : {}), ...(corner ? { corner } : {}) });
      if (type === 'mitre') {
        entry.segment[exit === 'left' ? 'from' : 'to'] = { ...at };
        other.segment[otherSide === 'left' ? 'from' : 'to'] = { ...at };
      }
      if (other === first) { path.start = null; path.end = null; path.closed = true; break; }
      entry = other;
      side = otherSide;
    }
    paths.push(path);
  };
  // Open components start at their first unlinked end; the remaining components are loops.
  for (const entry of entries) for (const side of SIDES) {
    if (!visited.has(entry) && !rules.get(endKey(entry, side)).other) walk(entry, side);
  }
  for (const entry of entries) if (!visited.has(entry)) walk(entry, 'left');
  return { paths, ends };
}
