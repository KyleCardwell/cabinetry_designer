import { DOOR_PROFILE_SLOTS, teamDoorStyle } from './doorStyles.js';

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

/** SPEC-47 slot options list the attach names required for a profile to fit. */
export const PROFILE_SLOTS = {
  door_outside: [['door_edge']],
  door_inside: [['frame_edge']],
  door_panel: [['panel_edge']],
  door_applied: [['frame_edge'], ['panel_edge']],
  slab_applied: [['apply_point']],
  crown: [['box_top', 'box_front']],
  top_mold: [['box_top', 'box_front']],
  furniture_base: [['floor', 'box_front']],
  toe_kick: [['floor', 'box_front']],
  nosing: [['edge_top', 'edge_face']],
};

/** SPEC-47 profiles fit by attach names, independently of their tags. */
export function profileFitsSlot(profile, slot) {
  return Object.hasOwn(PROFILE_SLOTS, slot)
    && PROFILE_SLOTS[slot].some((option) => option.every((name) => Object.hasOwn(profile.attach, name)));
}

const FULL_TURN = 2 * Math.PI;

function positiveAngle(angle) {
  const remainder = angle % FULL_TURN;
  return remainder < 0 ? remainder + FULL_TURN : remainder;
}

function arcMeasure(segment, points) {
  const [cx, cy] = segment.center;
  const [fx, fy] = points[segment.from];
  const [tx, ty] = points[segment.to];
  const start = Math.atan2(fy - cy, fx - cx);
  const end = Math.atan2(ty - cy, tx - cx);
  const direction = segment.ccw ? 1 : -1;
  return {
    radius: Math.hypot(fx - cx, fy - cy),
    start,
    direction,
    sweep: positiveAngle(direction * (end - start)),
  };
}

/** SPEC-47 bounds include every named point and axis extremes inside arc sweeps. */
export function sectionProfileBounds(profile) {
  const { points, loops } = profile.geometry;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = ([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  Object.values(points).forEach(include);
  for (const loop of loops) {
    for (const segment of loop.segs) {
      if (segment.type !== 'arc') continue;
      const { radius, start, direction, sweep } = arcMeasure(segment, points);
      const [cx, cy] = segment.center;
      const extremes = [
        [0, [cx + radius, cy]],
        [Math.PI / 2, [cx, cy + radius]],
        [Math.PI, [cx - radius, cy]],
        [3 * Math.PI / 2, [cx, cy - radius]],
      ];
      for (const [angle, point] of extremes) {
        const distance = positiveAngle(direction * (angle - start));
        if (distance > 0 && distance < sweep) include(point);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function svgNumber(value) {
  return String(Number(value.toFixed(4)));
}

/** SPEC-47 thumbnail paths flip y and round coordinates and radii to four decimals. */
export function sectionProfileSvgPath(profile) {
  const { points, loops } = profile.geometry;
  const coordinates = ([x, y]) => [svgNumber(x), svgNumber(-y)];
  return loops.map((loop) => {
    const tokens = ['M', ...coordinates(points[loop.segs[0].from])];
    for (const segment of loop.segs) {
      if (segment.type === 'arc') {
        const { radius, sweep } = arcMeasure(segment, points);
        const r = svgNumber(radius);
        tokens.push('A', r, r, '0', sweep > Math.PI ? '1' : '0', segment.ccw ? '0' : '1');
      } else {
        tokens.push('L');
      }
      tokens.push(...coordinates(points[segment.to]));
    }
    if (loop.closed) tokens.push('Z');
    return tokens.join(' ');
  }).join(' ');
}

/** SPEC-47 creates a square or independent copy with the first unused name. */
export function newSectionProfile(profiles, id, base = null) {
  const names = new Set(profiles.map((profile) => profile.name.toLowerCase()));
  const initialName = base ? `${base.name} copy` : 'New profile';
  let name = initialName;
  let number = 2;
  while (names.has(name.toLowerCase())) {
    name = `${initialName} ${number}`;
    number += 1;
  }
  const profile = base ? structuredClone(base) : {
    tags: [],
    geometry: {
      units: 'in',
      points: { p1: [0, 0], p2: [0.75, 0], p3: [0.75, -0.75], p4: [0, -0.75] },
      loops: [{
        id: 'L1',
        closed: true,
        segs: [
          { type: 'line', from: 'p1', to: 'p2' },
          { type: 'line', from: 'p2', to: 'p3' },
          { type: 'line', from: 'p3', to: 'p4' },
          { type: 'line', from: 'p4', to: 'p1' },
        ],
      }],
    },
    attach: {},
    drawnPoints: { elevation: [] },
  };
  return { ...profile, id, name, version: 1, archived: false };
}

/** SPEC-47 lists matching team slots first, then slots in room and style order. */
export function sectionProfileUses(settings, rooms, profileId) {
  const uses = [];
  for (const slot of DOOR_PROFILE_SLOTS) {
    if (teamDoorStyle(settings).profiles?.[slot] === profileId) uses.push({ level: 'team', slot });
  }
  for (const room of rooms) {
    for (const style of room.doorStyles ?? []) {
      for (const slot of DOOR_PROFILE_SLOTS) {
        if (style.profiles?.[slot] === profileId) {
          uses.push({ level: 'room', roomId: room.id, styleId: style.id, label: style.label, slot });
        }
      }
    }
  }
  return uses;
}

/** SPEC-47 filters library profiles by name, tag and archive status in list order. */
export function filterSectionProfiles(profiles, { search = '', tag = null, showArchived = false } = {}) {
  const query = search.trim().toLowerCase();
  return profiles.filter((profile) => (showArchived || !profile.archived)
    && profile.name.toLowerCase().includes(query)
    && (tag === null || profile.tags.includes(tag)));
}

/** SPEC-47 offers known tags first, then sorted custom tags from the entire library. */
export function profileTagOptions(profiles) {
  const known = Object.keys(PROFILE_TAG_LABELS);
  const custom = new Set(profiles.flatMap((profile) => profile.tags).filter((tag) => !known.includes(tag)));
  return [...known, ...[...custom].sort()];
}

/** SPEC-47 known tags have labels; custom tags display as stored. */
export function profileTagLabel(tag) {
  return PROFILE_TAG_LABELS[tag] ?? tag;
}

/** SPEC-47 normalizes comma-separated tags without validating them. */
export function normalizeProfileTags(text) {
  return [...new Set(text.split(',').map((piece) => piece.trim().toLowerCase().replace(/[ -]+/g, '_')).filter(Boolean))];
}

/** SPEC-47 exports the entire library in a versioned profiles file. */
export function profileFile(profiles) {
  return { kind: 'section-profiles', version: 1, profiles };
}

/** SPEC-47 parses the file envelope without validating entries or throwing. */
export function parseProfileFile(text) {
  try {
    const file = JSON.parse(text);
    return file?.kind === 'section-profiles' && file.version === 1 && Array.isArray(file.profiles)
      ? file.profiles : null;
  } catch {
    return null;
  }
}

/** SPEC-47 merges valid entries by id, replacing in place and appending new ids. */
export function mergeImportedProfiles(profiles, incoming) {
  const next = [...profiles];
  const indices = new Map(next.map((profile, index) => [profile.id, index]));
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const profile of incoming) {
    if (!isSectionProfile(profile)) {
      skipped += 1;
    } else if (indices.has(profile.id)) {
      next[indices.get(profile.id)] = profile;
      replaced += 1;
    } else {
      indices.set(profile.id, next.length);
      next.push(profile);
      added += 1;
    }
  }
  return { profiles: next, added, replaced, skipped };
}
