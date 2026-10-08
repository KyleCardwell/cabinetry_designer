import { isSectionProfile } from './sectionProfiles.js';
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
