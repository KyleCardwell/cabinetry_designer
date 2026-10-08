/** SPEC-47 known section profile tags in library filter order. */
export const PROFILE_TAG_LABELS = {
  door_outside: 'Door outside edge',
  door_inside: 'Door inside (sticking)',
  door_panel: 'Raised panel',
  applied_molding: 'Applied molding',
  crown: 'Crown',
  top_mold: 'Top mold',
  furniture_base: 'Furniture base',
  toe_kick: 'Toe kick',
  nosing: 'Nosing',
  countertop_edge: 'Countertop edge',
  light_rail: 'Light rail',
};

/** SPEC-47 allowed named attach points for section profiles. */
export const ATTACH_POINTS = [
  'door_edge', 'frame_edge', 'panel_edge', 'apply_point', 'box_top', 'box_front', 'floor',
  'edge_top', 'edge_face',
];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Allowed own keys, with every required key present. */
function hasKeys(value, allowed, required = allowed) {
  return isPlainObject(value)
    && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isCoordinate = (value) => Array.isArray(value) && value.length === 2
  && Number.isFinite(value[0]) && Number.isFinite(value[1]);
const RADIUS_TOLERANCE = 1 / 256;

/** SPEC-47 tags are lowercase snake_case, including custom team tags. */
export function isProfileTag(tag) {
  return typeof tag === 'string' && /^[a-z0-9]+(_[a-z0-9]+)*$/.test(tag);
}

function isSegment(segment, points) {
  if (!isPlainObject(segment)) return false;
  const keys = segment.type === 'line' ? ['type', 'from', 'to']
    : ['type', 'from', 'to', 'center', 'ccw'];
  if (!hasKeys(segment, keys)
    || !isNonEmptyString(segment.from) || !isNonEmptyString(segment.to)
    || !Object.hasOwn(points, segment.from) || !Object.hasOwn(points, segment.to)
    || segment.from === segment.to) return false;
  if (segment.type === 'line') return true;
  if (segment.type !== 'arc' || !isCoordinate(segment.center)
    || typeof segment.ccw !== 'boolean') return false;
  const [cx, cy] = segment.center;
  const [fx, fy] = points[segment.from];
  const [tx, ty] = points[segment.to];
  const radius = Math.hypot(fx - cx, fy - cy);
  const endRadius = Math.hypot(tx - cx, ty - cy);
  return radius > RADIUS_TOLERANCE
    && Math.abs(radius - endRadius) <= RADIUS_TOLERANCE;
}

/** SPEC-47 geometry uses named inch points and chained line or arc loops. */
export function isProfileGeometry(geometry) {
  if (!hasKeys(geometry, ['units', 'points', 'loops']) || geometry.units !== 'in'
    || !isPlainObject(geometry.points)) return false;
  const pointIds = Reflect.ownKeys(geometry.points);
  if (pointIds.length < 2
    || !pointIds.every((id) => isNonEmptyString(id) && isCoordinate(geometry.points[id]))
    || !Array.isArray(geometry.loops) || geometry.loops.length === 0) return false;
  const loopIds = new Set();
  for (const loop of geometry.loops) {
    if (!hasKeys(loop, ['id', 'closed', 'segs']) || !isNonEmptyString(loop.id)
      || loopIds.has(loop.id) || typeof loop.closed !== 'boolean'
      || !Array.isArray(loop.segs) || loop.segs.length === 0) return false;
    loopIds.add(loop.id);
    let previousTo;
    let hasArc = false;
    for (const segment of loop.segs) {
      if (!isSegment(segment, geometry.points)
        || (previousTo !== undefined && segment.from !== previousTo)) return false;
      previousTo = segment.to;
      hasArc ||= segment.type === 'arc';
    }
    const closes = previousTo === loop.segs[0].from;
    if (loop.closed !== closes
      || (loop.closed && loop.segs.length < (hasArc ? 2 : 3))) return false;
  }
  return true;
}

function isPointList(list, points) {
  return Array.isArray(list) && new Set(list).size === list.length
    && Array.from(list).every((id) => isNonEmptyString(id) && Object.hasOwn(points, id));
}

/** SPEC-47 section profiles validate metadata, geometry and named point references. */
export function isSectionProfile(profile) {
  if (!hasKeys(profile, [
    'id', 'name', 'tags', 'geometry', 'attach', 'drawnPoints', 'version', 'archived',
  ]) || !isNonEmptyString(profile.id)
    || !isNonEmptyString(profile.name) || profile.name !== profile.name.trim()
    || !Array.isArray(profile.tags) || !Array.from(profile.tags).every(isProfileTag)
    || new Set(profile.tags).size !== profile.tags.length
    || !isProfileGeometry(profile.geometry)
    || !hasKeys(profile.attach, ATTACH_POINTS, [])
    || !hasKeys(profile.drawnPoints, ['elevation', 'plan'], ['elevation'])
    || !Number.isInteger(profile.version) || profile.version < 1
    || typeof profile.archived !== 'boolean') return false;
  const points = profile.geometry.points;
  return Reflect.ownKeys(profile.attach).every((name) => (
    isNonEmptyString(profile.attach[name]) && Object.hasOwn(points, profile.attach[name])
  )) && isPointList(profile.drawnPoints.elevation, points)
    && (!Object.hasOwn(profile.drawnPoints, 'plan') || isPointList(profile.drawnPoints.plan, points));
}

/** SPEC-47 section profile libraries contain valid profiles with unique ids. */
export function isSectionProfileList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  for (const profile of list) {
    if (!isSectionProfile(profile) || ids.has(profile.id)) return false;
    ids.add(profile.id);
  }
  return true;
}
