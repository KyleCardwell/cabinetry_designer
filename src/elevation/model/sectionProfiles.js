import { DOOR_PROFILE_SLOTS, teamDoorStyle } from './doorStyles.js';

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

/** SPEC-47 section profiles validate metadata, geometry and drawn point references (SPEC-48.2: no pins). */
export function isSectionProfile(profile) {
  if (!hasKeys(profile, [
    'id', 'name', 'kind', 'geometry', 'drawnPoints', 'version', 'archived',
  ]) || !isNonEmptyString(profile.id)
    || !isNonEmptyString(profile.name) || profile.name !== profile.name.trim()
    || !isProfileKind(profile.kind)
    || !isProfileGeometry(profile.geometry)
    || !hasKeys(profile.drawnPoints, ['elevation', 'plan'], ['elevation'])
    || !Number.isInteger(profile.version) || profile.version < 1
    || typeof profile.archived !== 'boolean') return false;
  const points = profile.geometry.points;
  return isPointList(profile.drawnPoints.elevation, points)
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

/** SPEC-48.1.1 slots take one profile kind. */
export const PROFILE_SLOTS = {
  door_outside: 'door_outside',
  door_inside: 'door_inside',
  door_panel: 'door_panel',
  door_applied: 'applied_molding',
  slab_applied: 'applied_molding',
  crown: 'crown',
  top_mold: 'top_mold',
  furniture_base: 'furniture_base',
  toe_kick: 'toe_kick',
  nosing: 'nosing',
};

/** A profile fits a slot of its own kind (SPEC-48.2). */
export function profileFitsSlot(profile, slot) {
  return Object.hasOwn(PROFILE_SLOTS, slot)
    && profile.kind === PROFILE_SLOTS[slot];
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
    kind: 'other',
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

/** SPEC-47 filters library profiles by name, kind and archive status in list order. */
export function filterSectionProfiles(profiles, { search = '', kind = null, showArchived = false } = {}) {
  const query = search.trim().toLowerCase();
  return profiles.filter((profile) => (showArchived || !profile.archived)
    && profile.name.toLowerCase().includes(query)
    && (kind === null || profile.kind === kind));
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
      ? file.profiles.map(migrateSectionProfile) : null;
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

/** SPEC-48.1.1 profile kinds in library order with their drawing axes; SPEC-48.2 adds what 0, 0 means. */
export const PROFILE_KINDS = {
  door_outside: { label: 'Door outside edge', axes: 'door', origin: "the door's outside edge, at the front face" },
  door_inside: { label: 'Door inside profile', axes: 'door', origin: 'the edge of the panel opening, at the front face' },
  door_panel: { label: 'Raised panel', axes: 'door', origin: 'the edge of the panel opening, at the front face' },
  applied_molding: { label: 'Applied molding', axes: 'door', origin: 'the line the molding is applied along, at the front face' },
  crown: { label: 'Crown', axes: 'run', origin: 'the front face of the box, at the top of the box' },
  top_mold: { label: 'Top mold', axes: 'run', origin: 'the front face of the box, at the top of the box' },
  furniture_base: { label: 'Furniture base', axes: 'run', origin: 'the front face of the box, at the floor' },
  toe_kick: { label: 'Toe kick', axes: 'run', origin: "the toe kick's face, at the floor" },
  nosing: { label: 'Nosing', axes: 'run', origin: 'the front edge of the part, at its top' },
  other: { label: 'Other', axes: 'free', origin: null },
};

/** SPEC-48.1.1 recognizes only own string kind names. */
export function isProfileKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(PROFILE_KINDS, kind);
}

/** SPEC-48.1.1 labels known kinds and returns unknown kinds as stored. */
export function profileKindLabel(kind) {
  return Object.hasOwn(PROFILE_KINDS, kind) ? PROFILE_KINDS[kind].label : kind;
}

/** SPEC-48.1.1 lists used kinds in library order, including archived profiles. */
export function profileKindOptions(profiles) {
  const used = new Set(profiles.map((profile) => profile.kind));
  return Object.keys(PROFILE_KINDS).filter((kind) => used.has(kind));
}

const OLD_PINS = {
  door_outside: { x: 'door_edge', y: 'door_edge' },
  door_inside: { x: 'frame_edge', y: 'frame_edge' },
  door_panel: { x: 'panel_edge', y: 'panel_edge' },
  applied_molding: { x: 'apply_point', y: 'apply_point' },
  crown: { x: 'box_front', y: 'box_top' },
  top_mold: { x: 'box_front', y: 'box_top' },
  furniture_base: { x: 'box_front', y: 'floor' },
  toe_kick: { x: 'box_front', y: 'floor' },
  nosing: { x: 'edge_face', y: 'edge_top' },
};

function round6(value) {
  const rounded = Number(value.toFixed(6));
  return rounded === 0 ? 0 : rounded;
}

/** SPEC-48.2 turns older tags into a kind and moves the old pin to 0, 0, without mutating the input. */
export function migrateSectionProfile(entry) {
  if (!isPlainObject(entry)) return entry;
  const fromTags = Array.isArray(entry.tags) && !Object.hasOwn(entry, 'kind');
  const hasAttach = Object.hasOwn(entry, 'attach');
  if (!fromTags && !hasAttach) return entry;
  const next = structuredClone(entry);
  if (fromTags) {
    const tag = entry.tags.find((value) => (isProfileKind(value) && value !== 'other')
      || value === 'door_applied' || value === 'slab_applied');
    next.kind = tag === 'door_applied' || tag === 'slab_applied' ? 'applied_molding' : tag ?? 'other';
    delete next.tags;
  }
  if (hasAttach) {
    const { points, loops } = next.geometry ?? {};
    const pin = (name) => {
      const id = isPlainObject(entry.attach) ? entry.attach[name] : null;
      return isNonEmptyString(id) && isPlainObject(points)
        && Object.hasOwn(points, id) && isCoordinate(points[id]) ? points[id] : null;
    };
    const pins = Object.hasOwn(OLD_PINS, next.kind) ? OLD_PINS[next.kind] : null;
    const dx = pins ? pin(pins.x)?.[0] ?? 0 : 0;
    const dy = pins ? pin(pins.y)?.[1] ?? 0 : 0;
    if (dx !== 0 || dy !== 0) {
      const move = ([x, y]) => [round6(x - dx), round6(y - dy)];
      for (const id of Object.keys(points)) {
        if (isCoordinate(points[id])) points[id] = move(points[id]);
      }
      if (Array.isArray(loops)) {
        for (const loop of loops) {
          if (!Array.isArray(loop?.segs)) continue;
          for (const segment of loop.segs) {
            if (segment?.type === 'arc' && isCoordinate(segment.center)) {
              segment.center = move(segment.center);
            }
          }
        }
      }
    }
    delete next.attach;
  }
  return next;
}
