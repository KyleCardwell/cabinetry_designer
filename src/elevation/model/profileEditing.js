import {
  ATTACH_POINTS, PROFILE_KINDS, isProfileKind, isSectionProfile,
} from './sectionProfiles.js';
import { formatInchesInput } from './units.js';

/** SPEC-48 grid choices in inches for profile editing. */
export const PROFILE_GRID_STEPS = [0.25, 0.125, 0.0625, 0.03125];

const isCoordinate = (xy) => Array.isArray(xy) && xy.length === 2
  && Number.isFinite(xy[0]) && Number.isFinite(xy[1]);

function round6(value) {
  const rounded = Number(value.toFixed(6));
  return rounded === 0 ? 0 : rounded;
}

function editProfile(profile, edit) {
  if (!isSectionProfile(profile)) return null;
  const next = structuredClone(profile);
  if (edit(next) === false || !isSectionProfile(next)) return null;
  return next;
}

function arcSweep(segment, points) {
  const [cx, cy] = segment.center;
  const from = points[segment.from];
  const to = points[segment.to];
  const start = Math.atan2(from[1] - cy, from[0] - cx);
  const end = Math.atan2(to[1] - cy, to[0] - cx);
  const angle = (segment.ccw ? end - start : start - end) * 180 / Math.PI;
  return ((angle % 360) + 360) % 360;
}

function centerFromSweep(from, to, sweep, ccw) {
  if (!Number.isFinite(sweep) || sweep <= 0 || sweep >= 360
    || typeof ccw !== 'boolean') return null;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0 || !Number.isFinite(chord)) return null;
  const distance = (ccw ? 1 : -1) * (chord / 2) / Math.tan(sweep * Math.PI / 360);
  const center = [
    round6(from[0] / 2 + to[0] / 2 - (dy / chord) * distance),
    round6(from[1] / 2 + to[1] / 2 + (dx / chord) * distance),
  ];
  return isCoordinate(center) ? center : null;
}

/** SPEC-48 checks names for newly added or renamed points. */
export function isPointId(id) {
  return typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(id);
}

/** SPEC-48 finds the first free numbered point name using only the points. */
export function nextPointId(profile) {
  let number = 1;
  while (Object.hasOwn(profile.geometry.points, `p${number}`)) number += 1;
  return `p${number}`;
}

/** SPEC-48 formats exact sixty-fourths as fractions and other coordinates as decimals. */
export function formatProfileCoord(n) {
  if (!Number.isFinite(n)) return '';
  return Math.abs(n * 64 - Math.round(n * 64)) < 1e-9
    ? formatInchesInput(n, 1 / 64) : String(Number(n.toFixed(4)));
}

/** SPEC-48 appends a named point with coordinates rounded to six decimals. */
export function addProfilePoint(profile, xy, id) {
  if (!isPointId(id) || !isCoordinate(xy)) return null;
  return editProfile(profile, (next) => {
    if (Object.hasOwn(next.geometry.points, id)) return false;
    next.geometry.points[id] = xy.map(round6);
  });
}

/** SPEC-48 moves a point while preserving the sweep and direction of touching arcs. */
export function moveProfilePoint(profile, id, xy) {
  if (typeof id !== 'string' || !isCoordinate(xy)) return null;
  return editProfile(profile, (next) => {
    const { points, loops } = next.geometry;
    if (!Object.hasOwn(points, id)) return false;
    const arcs = loops.flatMap((loop) => loop.segs)
      .filter((segment) => segment.type === 'arc' && (segment.from === id || segment.to === id))
      .map((segment) => ({ segment, sweep: arcSweep(segment, points) }));
    points[id] = xy.map(round6);
    for (const { segment, sweep } of arcs) {
      const center = centerFromSweep(points[segment.from], points[segment.to], sweep, segment.ccw);
      if (center === null) return false;
      segment.center = center;
    }
  });
}

/** SPEC-48 renames a point in place and updates segment, attach and drawn references. */
export function renameProfilePoint(profile, id, newId) {
  if (typeof id !== 'string' || !isPointId(newId)) return null;
  return editProfile(profile, (next) => {
    const { points, loops } = next.geometry;
    if (!Object.hasOwn(points, id) || (id !== newId && Object.hasOwn(points, newId))) return false;
    next.geometry.points = Object.fromEntries(
      Object.entries(points).map(([key, xy]) => [key === id ? newId : key, xy]),
    );
    for (const loop of loops) {
      for (const segment of loop.segs) {
        if (segment.from === id) segment.from = newId;
        if (segment.to === id) segment.to = newId;
      }
    }
    for (const name of Object.keys(next.attach)) {
      if (next.attach[name] === id) next.attach[name] = newId;
    }
    for (const view of Object.keys(next.drawnPoints)) {
      next.drawnPoints[view] = next.drawnPoints[view].map((pointId) => (pointId === id ? newId : pointId));
    }
  });
}

/** SPEC-48 deletes unused points and removes their attach and drawn references. */
export function deleteProfilePoint(profile, id) {
  if (typeof id !== 'string') return null;
  return editProfile(profile, (next) => {
    const { points, loops } = next.geometry;
    if (!Object.hasOwn(points, id)
      || loops.some((loop) => loop.segs.some((segment) => segment.from === id || segment.to === id))) {
      return false;
    }
    delete points[id];
    for (const name of Object.keys(next.attach)) {
      if (next.attach[name] === id) delete next.attach[name];
    }
    for (const view of Object.keys(next.drawnPoints)) {
      next.drawnPoints[view] = next.drawnPoints[view].filter((pointId) => pointId !== id);
    }
  });
}

/** SPEC-48 translates every point and arc center to place the named point at the origin. */
export function moveProfileOrigin(profile, id) {
  if (typeof id !== 'string') return null;
  return editProfile(profile, (next) => {
    const { points, loops } = next.geometry;
    if (!Object.hasOwn(points, id)) return false;
    const [x, y] = points[id];
    const translate = (xy) => [round6(xy[0] - x), round6(xy[1] - y)];
    for (const key of Object.keys(points)) points[key] = translate(points[key]);
    for (const loop of loops) {
      for (const segment of loop.segs) {
        if (segment.type === 'arc') segment.center = translate(segment.center);
      }
    }
  });
}

/** SPEC-48 snaps to the nearest reachable point in key order, otherwise to the grid. */
export function snapProfilePoint(profile, xy, options) {
  if (!isSectionProfile(profile) || !isCoordinate(xy)
    || options === null || typeof options !== 'object') return null;
  const { grid, reach, exclude = null } = options;
  if (!Number.isFinite(grid) || grid <= 0 || !Number.isFinite(reach) || reach < 0
    || (exclude !== null && typeof exclude !== 'string')) return null;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const [id, point] of Object.entries(profile.geometry.points)) {
    if (id === exclude) continue;
    const distance = Math.hypot(point[0] - xy[0], point[1] - xy[1]);
    if (distance <= reach && distance < nearestDistance) {
      nearest = { xy: [...point], id };
      nearestDistance = distance;
    }
  }
  if (nearest) return nearest;
  const snapped = xy.map((value) => round6(Math.round(value / grid) * grid));
  return isCoordinate(snapped) ? { xy: snapped, id: null } : null;
}

const lineSegment = (from, to) => ({ type: 'line', from, to });

function segmentAt(profile, loopId, index) {
  if (typeof loopId !== 'string' || !Number.isInteger(index) || index < 0) return null;
  return profile.geometry.loops.find((loop) => loop.id === loopId)?.segs[index] ?? null;
}

function jointIndex(loop, pointId) {
  return loop.segs.findIndex((segment, index) => {
    const next = loop.segs[index + 1] ?? (loop.closed ? loop.segs[0] : null);
    return segment.to === pointId && next?.from === pointId;
  });
}

function deleteUnusedLoopPoints(profile, segments) {
  const candidates = new Set(segments.flatMap((segment) => [segment.from, segment.to]));
  const used = new Set([
    ...profile.geometry.loops.flatMap((loop) => loop.segs.flatMap((segment) => [segment.from, segment.to])),
    ...Object.values(profile.attach),
    ...Object.values(profile.drawnPoints).flat(),
  ]);
  for (const id of candidates) {
    if (!used.has(id)) delete profile.geometry.points[id];
  }
}

/** SPEC-48 finds the first free numbered loop id. */
export function nextLoopId(profile) {
  const ids = new Set(profile.geometry.loops.map((loop) => loop.id));
  let number = 1;
  while (ids.has(`L${number}`)) number += 1;
  return `L${number}`;
}

/** SPEC-48 appends a line loop through the given points and validates the result. */
export function addProfileLoop(profile, pointIds, closed) {
  if (!Array.isArray(pointIds)) return null;
  return editProfile(profile, (next) => {
    const segs = pointIds.slice(1).map((id, index) => lineSegment(pointIds[index], id));
    if (closed) segs.push(lineSegment(pointIds.at(-1), pointIds[0]));
    next.geometry.loops.push({ id: nextLoopId(next), closed, segs });
  });
}

/** SPEC-48 deletes a loop and its unreferenced points while retaining at least one loop. */
export function deleteProfileLoop(profile, loopId) {
  return editProfile(profile, (next) => {
    const { loops } = next.geometry;
    const index = loops.findIndex((loop) => loop.id === loopId);
    if (index < 0 || loops.length === 1) return false;
    const [removed] = loops.splice(index, 1);
    deleteUnusedLoopPoints(next, removed.segs);
  });
}

/** SPEC-48 splits a line at its midpoint or an arc at half its sweep with an appended point. */
export function splitProfileSegment(profile, loopId, index, id) {
  return editProfile(profile, (next) => {
    const segment = segmentAt(next, loopId, index);
    const pointId = id === undefined ? nextPointId(next) : id;
    const { points, loops } = next.geometry;
    if (!segment || !isPointId(pointId) || Object.hasOwn(points, pointId)) return false;
    const from = points[segment.from];
    const to = points[segment.to];
    let xy;
    if (segment.type === 'line') {
      xy = [from[0] / 2 + to[0] / 2, from[1] / 2 + to[1] / 2];
    } else {
      const [cx, cy] = segment.center;
      const radius = Math.hypot(from[0] - cx, from[1] - cy);
      const angle = Math.atan2(from[1] - cy, from[0] - cx)
        + (segment.ccw ? 1 : -1) * arcSweep(segment, points) * Math.PI / 360;
      xy = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    }
    points[pointId] = xy.map(round6);
    loops.find((loop) => loop.id === loopId).segs.splice(index, 1,
      { ...segment, to: pointId }, { ...segment, from: pointId });
  });
}

/** SPEC-48 lists loops where the point joins consecutive segments, including closed starts. */
export function profilePointJoints(profile, pointId) {
  if (!isSectionProfile(profile) || typeof pointId !== 'string') return null;
  return profile.geometry.loops.filter((loop) => jointIndex(loop, pointId) >= 0)
    .map((loop) => loop.id);
}

/** SPEC-48 joins a corner's segments into a line and removes newly unused loop points. */
export function removeProfileVertex(profile, loopId, pointId) {
  return editProfile(profile, (next) => {
    const loop = next.geometry.loops.find((entry) => entry.id === loopId);
    if (!loop) return false;
    const index = jointIndex(loop, pointId);
    if (index < 0) return false;
    const { segs } = loop;
    const first = segs[index];
    const second = segs[(index + 1) % segs.length];
    const joined = lineSegment(first.from, second.to);
    if (index === segs.length - 1) {
      loop.segs = [...segs.slice(1, -1), joined];
    } else {
      loop.segs = [...segs.slice(0, index), joined, ...segs.slice(index + 2)];
    }
    deleteUnusedLoopPoints(next, segs);
  });
}

/** SPEC-48 sets an arc's sweep and direction using the chord-based center rule. */
export function setSegmentArc(profile, loopId, index, options) {
  if (options === null || typeof options !== 'object') return null;
  const { sweep, ccw } = options;
  return editProfile(profile, (next) => {
    const segment = segmentAt(next, loopId, index);
    if (!segment) return false;
    const { points, loops } = next.geometry;
    const center = centerFromSweep(points[segment.from], points[segment.to], sweep, ccw);
    if (center === null) return false;
    loops.find((loop) => loop.id === loopId).segs[index] = {
      type: 'arc', from: segment.from, to: segment.to, center, ccw,
    };
  });
}

/** SPEC-48 converts a segment to a line, dropping its arc center and direction. */
export function setSegmentLine(profile, loopId, index) {
  return editProfile(profile, (next) => {
    const segment = segmentAt(next, loopId, index);
    if (!segment) return false;
    next.geometry.loops.find((loop) => loop.id === loopId).segs[index] = lineSegment(segment.from, segment.to);
  });
}

/** SPEC-48 sets an arc radius while preserving direction and the major or minor sweep. */
export function setArcRadius(profile, loopId, index, radius) {
  if (!Number.isFinite(radius)) return null;
  return editProfile(profile, (next) => {
    const segment = segmentAt(next, loopId, index);
    if (segment?.type !== 'arc') return false;
    const { points } = next.geometry;
    const from = points[segment.from];
    const to = points[segment.to];
    const h = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2;
    if (radius < h - 1e-9) return false;
    let sweep = 2 * Math.asin(Math.min(1, h / radius)) * 180 / Math.PI;
    if (arcSweep(segment, points) > 180) sweep = 360 - sweep;
    const center = centerFromSweep(from, to, sweep, segment.ccw);
    if (center === null) return false;
    segment.center = center;
  });
}

/** SPEC-48 reports an arc's rounded center, radius, sweep and direction. */
export function profileArcInfo(profile, loopId, index) {
  if (!isSectionProfile(profile)) return null;
  const segment = segmentAt(profile, loopId, index);
  if (segment?.type !== 'arc') return null;
  const from = profile.geometry.points[segment.from];
  return {
    center: segment.center.map(round6),
    radius: round6(Math.hypot(from[0] - segment.center[0], from[1] - segment.center[1])),
    sweep: round6(arcSweep(segment, profile.geometry.points)),
    ccw: segment.ccw,
  };
}

/** SPEC-48.1 sets or clears a named attach point while preserving key order. */
export function setProfileAttach(profile, name, pointId) {
  if (!ATTACH_POINTS.includes(name) || (pointId !== null && typeof pointId !== 'string')) return null;
  return editProfile(profile, (next) => {
    if (pointId === null) {
      delete next.attach[name];
    } else {
      if (!Object.hasOwn(next.geometry.points, pointId)) return false;
      next.attach[name] = pointId;
    }
  });
}

/** SPEC-48.1.1 sets the kind and keeps only its pins in their existing key order. */
export function setProfileKind(profile, kind) {
  if (!isProfileKind(kind)) return null;
  return editProfile(profile, (next) => {
    next.kind = kind;
    next.attach = Object.fromEntries(Object.entries(next.attach)
      .filter(([pin]) => PROFILE_KINDS[kind].pins.includes(pin)));
  });
}

function pointIdsInOrder(points, ids) {
  const selected = new Set(ids);
  return Object.keys(points).filter((id) => selected.has(id));
}

/** SPEC-48.1 copies the drawn points for a view, with plan following elevation by default. */
export function profileDrawnIn(profile, view) {
  if (view === 'elevation') return [...profile.drawnPoints.elevation];
  if (view === 'plan') return [...(profile.drawnPoints.plan ?? profile.drawnPoints.elevation)];
  return [];
}

/** SPEC-48.1 lists segment endpoints from every loop in points order. */
export function profileVertexIds(profile) {
  const { points, loops } = profile.geometry;
  return pointIdsInOrder(points, loops.flatMap((loop) => loop.segs
    .flatMap((segment) => [segment.from, segment.to])));
}

/** SPEC-48.1 adds or removes a drawn point for one view in points order. */
export function setProfileDrawnPoint(profile, view, pointId, drawn) {
  if ((view !== 'elevation' && view !== 'plan')
    || typeof pointId !== 'string' || typeof drawn !== 'boolean') return null;
  return editProfile(profile, (next) => {
    if (!Object.hasOwn(next.geometry.points, pointId)) return false;
    const ids = profileDrawnIn(next, view).filter((id) => id !== pointId);
    if (drawn) ids.push(pointId);
    next.drawnPoints[view] = pointIdsInOrder(next.geometry.points, ids);
  });
}

/** SPEC-48.1 replaces one view's drawn points with unique known ids in points order. */
export function setProfileDrawnPoints(profile, view, ids) {
  if ((view !== 'elevation' && view !== 'plan') || !Array.isArray(ids)
    || new Set(ids).size !== ids.length) return null;
  return editProfile(profile, (next) => {
    for (const id of ids) {
      if (typeof id !== 'string' || !Object.hasOwn(next.geometry.points, id)) return false;
    }
    next.drawnPoints[view] = pointIdsInOrder(next.geometry.points, ids);
  });
}

/** SPEC-48.1 makes plan follow elevation or gives it a separate copy when needed. */
export function setProfilePlanSameAsElevation(profile, same) {
  if (typeof same !== 'boolean') return null;
  return editProfile(profile, (next) => {
    if (same) {
      delete next.drawnPoints.plan;
    } else if (next.drawnPoints.plan === undefined) {
      next.drawnPoints.plan = [...next.drawnPoints.elevation];
    }
  });
}

/** SPEC-48.1.1 rotates points and arc centers by integer quarter turns about the origin. */
export function rotateProfile(profile, turns) {
  if (!Number.isInteger(turns)) return null;
  const t = ((turns % 4) + 4) % 4;
  return editProfile(profile, (next) => {
    if (t === 0) return;
    const rotate = ([x, y]) => {
      if (t === 1) return [-y, x].map(round6);
      if (t === 2) return [-x, -y].map(round6);
      return [y, -x].map(round6);
    };
    const { points, loops } = next.geometry;
    for (const id of Object.keys(points)) points[id] = rotate(points[id]);
    for (const loop of loops) {
      for (const segment of loop.segs) {
        if (segment.type === 'arc') segment.center = rotate(segment.center);
      }
    }
  });
}

/** SPEC-48.1.1 mirrors points and arc centers on one axis and reverses arc direction. */
export function mirrorProfile(profile, axis) {
  if (axis !== 'x' && axis !== 'y') return null;
  return editProfile(profile, (next) => {
    const mirror = ([x, y]) => [axis === 'x' ? -x : x, axis === 'y' ? -y : y].map(round6);
    const { points, loops } = next.geometry;
    for (const id of Object.keys(points)) points[id] = mirror(points[id]);
    for (const loop of loops) {
      for (const segment of loop.segs) {
        if (segment.type === 'arc') {
          segment.center = mirror(segment.center);
          segment.ccw = !segment.ccw;
        }
      }
    }
  });
}
