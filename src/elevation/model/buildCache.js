import { wallSideOf } from './wallSides.js';

// Internal interface for cached builders; only entry points start a build.
export let activeBuildCache = null;

function visit(value, seen, visitObject) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, child] of value) {
      visit(key, seen, visitObject);
      visit(child, seen, visitObject);
    }
  } else if (value instanceof Set) {
    for (const child of value) visit(child, seen, visitObject);
  }
  for (const key of Reflect.ownKeys(value)) visit(value[key], seen, visitObject);
  visitObject?.(value);
}

function sameSideElements(actual, source, side) {
  const expected = (source ?? []).filter((item) => wallSideOf(item) === side);
  return actual?.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function storedView(room, wall) {
  const source = wall.sideSource ?? wall;
  if (!room.walls?.includes(source)) return false;
  if (wall === source) return true;
  const side = wall.side ?? 'front';
  return sameSideElements(wall.runs, source.runs, side)
    && sameSideElements(wall.joints, source.joints, side)
    && (side === 'back' ? wall.openings?.length === source.openings?.length
      : wall.openings === source.openings);
}

const valueKey = (values) => values.map((value) => `${typeof value}:${String(value)}`).join('|');

function createBuildCache(freezeResults = import.meta.env.MODE === 'test') {
  const scenes = new WeakMap();
  const corners = new WeakMap();
  const rooms = new Map();
  const paths = new WeakMap();
  const inputs = new WeakSet();
  const inputRoots = new WeakSet();
  const frozen = new WeakSet();

  function cachedOrRun(table, objects, key, room, settings, build) {
    let values = table;
    for (const [index, object] of objects.entries()) {
      if (!values.has(object)) values.set(object, index === objects.length - 1 ? new Map() : new WeakMap());
      values = values.get(object);
    }
    if (values.has(key)) return values.get(key);
    const result = build();
    if (freezeResults) {
      for (const input of [room, settings]) {
        if (input === null || typeof input !== 'object' || inputRoots.has(input)) continue;
        visit(input, inputs);
        inputRoots.add(input);
      }
      // A seeded traversal stops at input objects, including Map keys and Set entries.
      const seen = { has: (value) => inputs.has(value) || frozen.has(value), add: (value) => frozen.add(value) };
      visit(result, seen, Object.freeze);
    }
    values.set(key, result);
    return result;
  }

  return {
    byRoom(name, room, settings, build) {
      if (!rooms.has(name)) rooms.set(name, new WeakMap());
      return cachedOrRun(rooms.get(name), [room], settings, room, settings, build);
    },
    byPath(name, room, path, settings, member, build) {
      return cachedOrRun(paths, [room, settings, path], valueKey([name, member]), room, settings, build);
    },
    runScene(room, wall, run, settings, build) {
      if (!storedView(room, wall)) return build();
      const key = valueKey([wall.side ?? 'front', wall.flipped, wall.length]);
      return cachedOrRun(scenes, [room, settings, run, wall.sideSource ?? wall], key, room, settings, build);
    },
    cornerShapes(room, wall, side, settings, options, build) {
      const { profiles = true, throughBands = false, legBands = true, returns: returnsMode, combined } = options ?? {};
      if (combined !== undefined) return build();
      const key = valueKey([side, profiles, throughBands, returnsMode, legBands]);
      return cachedOrRun(corners, [room, settings, wall.sideSource ?? wall], key, room, settings, build);
    },
  };
}

let viewCache = null;

/**
 * The cache a builder uses: the active build's, else one long-lived cache for frozen rooms (store rooms are
 * frozen by Immer, so identity keys can't go stale). Canvas renders (zoom, pan, hover) then reuse every run scene,
 * corner shape and room list until the room or settings object changes. Results are frozen outside production so
 * a caller that mutates one throws instead of corrupting later renders.
 */
export function buildCacheFor(room) {
  if (activeBuildCache) return activeBuildCache;
  if (!room || typeof room !== 'object' || !Object.isFrozen(room)) return null;
  viewCache ??= createBuildCache(import.meta.env.MODE !== 'production');
  return viewCache;
}

/**
 * One synchronous build; nested entry points share its cache, released even on failure.
 * A build for a frozen room uses the long-lived cache instead of a fresh one.
 */
export function withBuildCache(fn, room) {
  if (activeBuildCache) return fn();
  activeBuildCache = buildCacheFor(room) ?? createBuildCache();
  try {
    return fn();
  } finally {
    activeBuildCache = null;
  }
}
