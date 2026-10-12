import { insertBaseCutouts, resolveBaseCutouts } from './baseCutouts.js';
import { runScene } from './runScene.js';
import { runFurnitureBaseBand } from './runBands.js';
import { hasToeKick } from './bandDepths.js';
import { bandOutline, endEdgeX, frontContour, placeAtEnd } from './bandEnds.js';
import { resolveProfile } from './profile.js';
import { outlineBounds, sectionProfileOutline } from './sectionProfileOutline.js';
import { sectionProfileBounds, stretchProfileGeometry } from './sectionProfiles.js';

const EPSILON = 1e-6;

/** Close the first open cut against the furniture base board, preserving drawn point ids. */
export function furnitureBaseSection(geometry, proud, height) {
  const warnings = [];
  if (geometry.loops.some((loop) => loop.closed)) return { geometry, warnings };
  const cuts = geometry.loops.filter((loop) => loop.closed === false);
  if (!cuts.length) return { geometry, warnings };
  if (cuts.length > 1) warnings.push({ code: 'furniture-base-extra-cuts' });
  const loop = cuts[0];
  const cutPoints = Object.fromEntries(loop.segs.flatMap(({ from, to }) => (
    [[from, geometry.points[from]], [to, geometry.points[to]]]
  )));
  const { minX, maxX, minY, maxY } = sectionProfileBounds({
    geometry: { ...geometry, points: cutPoints, loops: [loop] },
  });
  if (maxX > EPSILON || maxY > EPSILON || minY < -height - EPSILON) {
    warnings.push({ code: 'furniture-base-cut-bad' });
    return { geometry: null, warnings };
  }

  let cut = loop.segs;
  const [sx, sy] = geometry.points[cut[0].from];
  const [ex, ey] = geometry.points[cut.at(-1).to];
  if (sy < ey || (sy === ey && sx > ex)) {
    cut = [...cut].reverse().map((segment) => ({
      ...segment, from: segment.to, to: segment.from,
      ...(segment.type === 'arc' ? { ccw: !segment.ccw } : {}),
    }));
  }
  const points = { ...geometry.points };
  const start = cut[0].from;
  const end = cut.at(-1).to;
  const [tx, ty] = points[start];
  const [bx, by] = points[end];
  const x0 = Math.min(-proud, minX);
  const corner = (name, point, adjacent) => {
    if (points[adjacent][0] === point[0] && points[adjacent][1] === point[1]) return adjacent;
    let id = name;
    while (Object.hasOwn(points, id)) id += '_';
    points[id] = point;
    return id;
  };
  const top = ty < 0 ? corner('_top', [tx, 0], start) : start;
  const floor = by > -height ? corner('_floor', [bx, -height], end) : end;
  const backTop = corner('_backTop', [x0, 0], top);
  const backFloor = corner('_backFloor', [x0, -height], floor);
  const segs = [];
  const add = (segment) => {
    const [x, y] = points[segment.from];
    const [toX, toY] = points[segment.to];
    if (x !== toX || y !== toY) segs.push(segment);
  };
  const line = (from, to) => add({ type: 'line', from, to });
  line(backTop, top);
  line(top, start);
  cut.forEach(add);
  line(end, floor);
  line(floor, backFloor);
  line(backFloor, backTop);
  // A dropped zero-length edge can join different ids at the same coordinates.
  const closedSegs = segs.map((segment, index) => ({
    ...segment, from: segs[(index + segs.length - 1) % segs.length].to,
  }));
  return { geometry: { ...geometry, points,
    loops: [{ id: loop.id, closed: true, segs: closedSegs }] }, warnings };
}

/** Resolve a run's floor base and its profile, stretching furniture bases down from their top. */
export function runBaseProfile(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const height = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const proud = run.overrides?.furnitureBaseProud ?? profile.furnitureBaseProud;
  const kind = hasToeKick(run) && height > 0
    ? run.overrides?.baseKind ?? profile.baseKind
    : null;
  const warnings = [];
  const result = { kind, height, proud, picked: null, warnings };
  if (kind !== 'furniture_base') return result;

  const id = run.overrides?.furnitureBaseProfileId === undefined
    ? profile.furnitureBaseProfileId : run.overrides.furnitureBaseProfileId;
  if (id === null || id === undefined) return result;
  const picked = (settings?.sectionProfiles ?? [])
    .find((entry) => entry.id === id && entry.kind === 'furniture_base');
  if (!picked) {
    warnings.push({ code: 'molding-profile-missing', slot: 'furniture_base' });
    return result;
  }

  const geometry = stretchProfileGeometry(picked, -height);
  if (geometry === null) warnings.push({ code: 'furniture-base-too-short' });
  const stretched = geometry ?? picked.geometry;
  if (stretched.loops.some((loop) => loop.closed) && !Object.hasOwn(picked, 'stretch')) {
    const { minY, maxY } = sectionProfileBounds(picked);
    if (Math.abs(maxY - minY - height) > EPSILON) {
      warnings.push({ code: 'furniture-base-height-mismatch' });
    }
  }
  const section = furnitureBaseSection(stretched, proud, height);
  warnings.push(...section.warnings);
  result.picked = section.geometry === null ? null : { profile: picked, geometry: section.geometry };
  return result;
}

/** Resolve front cutouts and append their warnings to the run's base profile warnings. */
export function runBase(room, wall, run, settings, scene) {
  const base = runBaseProfile(room, wall, run, settings);
  if (!run.baseCutouts?.length) return base;
  if (base.kind === 'furniture_base') scene ??= runScene(room, wall, run, settings);
  const pieces = scene?.cells.pieces ?? [];
  const band = base.kind === 'furniture_base'
    ? runFurnitureBaseBand(room, wall, run, settings, base, scene) : null;
  const resolved = resolveBaseCutouts(run, settings, resolveProfile(settings, room, wall), base, pieces, band);
  base.cutouts = resolved.cutouts;
  base.warnings.push(...resolved.warnings);
  return base;
}

/** Front projection and free-end return, including any profile that projects beyond its origin. */
export function furnitureBasePast(base) {
  const maxX = base.picked ? sectionProfileBounds({ geometry: base.picked.geometry }).maxX : 0;
  return base.proud + Math.max(0, maxX);
}

/** Place the floor band and stop its profile lines on the returned or coped end contours. */
export function furnitureBaseBand(base, ends) {
  const [left, right] = ends;
  const rect = { x: left.x, z: 0, width: right.x - left.x, height: base.height, lines: [] };
  if (!base.picked) return insertBaseCutouts(rect, base.cutouts ?? []);
  const edges = ends.map((end, index) => {
    const source = end.base ?? base;
    const loop = source.picked && sectionProfileOutline(source.picked.geometry);
    const outline = end.outline ?? (loop && end.type !== 'square' && end.side !== undefined
      ? placeAtEnd(loop, end.side, source.proud, source.height, end.facing) : null);
    return (outline && frontContour(outline, end.facing ?? (index === 0 ? 1 : -1)))
      ?? [[end.x, 0, 0], [end.x, base.height, 0]];
  });
  rect.outline = bandOutline(...edges, 0, base.height);
  const { minX, maxX } = outlineBounds(rect.outline);
  rect.x = minX;
  rect.width = maxX - minX;
  for (const id of base.picked.profile.drawnPoints.elevation ?? []) {
    const z = base.height + base.picked.geometry.points[id][1];
    if (Math.abs(z) <= EPSILON || Math.abs(z - base.height) <= EPSILON
      || rect.lines.some((line) => Math.abs(line.z1 - z) <= EPSILON)) continue;
    rect.lines.push({ x1: endEdgeX(edges[0], z, -1), z1: z,
      x2: endEdgeX(edges[1], z, 1), z2: z });
  }
  return insertBaseCutouts(rect, base.cutouts ?? []);
}
