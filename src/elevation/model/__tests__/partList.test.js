import { expect, it, vi } from 'vitest';
import { toDrawingPayload } from '../drawingPayload.js';
import { roomPartList } from '../partList.js';
import { partNumbers } from '../partNumbers.js';
import { syncRoom } from '../room.js';
import { goldenRooms } from './helpers/goldenRooms.js';
import { bandPaths } from '../bandPaths.js';
import { sweepBand, viewFromWall } from '../bandSweep.js';
import { buildCacheFor, withBuildCache } from '../buildCache.js';
import elevationReducer, { createInitialElevationState, renameRoom } from '../../store/elevationSlice.js';
import { effectiveSettings } from '../effectiveSettings.js';

const rooms = goldenRooms();
it.each([
  ['N1', 'toe_kick'],
  ['N1', 'face'],
  ['N2', 'furniture_base'],
])('tags %s %s pieces with their owning item (GC2)', (key, kind) => {
  const { room: source, settings } = rooms.find((room) => room.key === key).load();
  const room = syncRoom(source, settings);
  const list = roomPartList(room, settings);
  if (key === 'N1' && kind === 'toe_kick') {
    const payload = toDrawingPayload(room, settings);
    expect(JSON.stringify(payload)).not.toContain('itemKey');
  }
  const cabinets = list.items.filter(({ kind }) => kind === 'cabinet');
  const pieces = list.elevations.flatMap(({ parts }) => parts).filter((piece) => piece.kind === kind)
    .filter((piece) => kind === 'face'
      ? cabinets.some(({ key }) => piece.id.startsWith(`${key}:`))
      : kind !== 'furniture_base' || piece.runId);
  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    if (kind === 'toe_kick') expect(piece.itemKey).toBe('molding:toeKick');
    else if (kind === 'face') {
      expect(piece.itemKey).toBe(cabinets.find(({ key }) => piece.id.startsWith(`${key}:`)).key);
    } else {
      expect(piece.itemKey).toMatch(/^furniture_base:/);
      expect(list.items.find(({ key }) => key === piece.itemKey).runIds).toContain(piece.runId);
    }
  }
});

it('tags a run\'s second furniture base and extra wood tops with their own items (GC2)', () => {
  const { room: source, settings } = rooms.find((room) => room.key === 'N2').load();
  const list = roomPartList(syncRoom(source, settings), settings);
  const tagged = new Set(list.elevations.flatMap(({ parts }) => parts).map(({ itemKey }) => itemKey));
  const owned = list.items.filter(({ kind }) => kind === 'furniture_base' || kind === 'wood_top');
  expect(owned.filter(({ key }) => !tagged.has(key))).toEqual([]);
});

function medianTime(build) {
  build();
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    build();
    return performance.now() - start;
  });
  return times.sort((a, b) => a - b)[2];
}

const annotations = ['elevationDimensions', 'elevationMarks', 'elevationPartNumbers',
  'planDimensions', 'planMarks', 'planShapes'];

it('builds band paths once per part list and reuses them for the synced store room (D3)', () => {
  const { room: source, settings, shop } = rooms.find(({ key }) => key === 'N1').load();
  const room = syncRoom(source, settings);
  const check = (room, settings, build) => {
    const cache = buildCacheFor(room);
    const byRoom = cache.byRoom;
    const builds = vi.fn();
    const spy = vi.spyOn(cache, 'byRoom').mockImplementation((name, room, settings, builder) => (
      byRoom(name, room, settings, () => {
        if (name === 'bandPaths') builds();
        return builder();
      })
    ));
    try {
      const first = build();
      expect(bandPaths(room, settings)).toBe(first);
      expect(builds).toHaveBeenCalledTimes(1);
      return first;
    } finally { spy.mockRestore(); }
  };
  const build = () => withBuildCache(() => check(room, settings, () => {
    roomPartList(room, settings);
    return bandPaths(room, settings);
  }), room);
  expect(build()).not.toBe(build());

  const initial = createInitialElevationState({ rooms: [source], settings: shop, activeRoomId: source.id });
  const state = elevationReducer(initial, renameRoom({ roomId: source.id, name: 'Cache check' }));
  const stored = state.rooms[0];
  const screenSettings = effectiveSettings(state, stored);
  expect(Object.isFrozen(stored)).toBe(true);
  check(stored, screenSettings, () => {
    const first = bandPaths(stored, screenSettings);
    roomPartList(stored, screenSettings);
    expect(bandPaths(stored, effectiveSettings(state, stored))).toBe(first);
    return first;
  });
});

async function builderSplit(room, settings) {
  const builders = [
    ['elevationParts', import('../elevationParts.js'), 'elevationParts'],
    ['bandParts', import('../bandParts.js'), 'bandParts'],
    ['bandPaths', import('../bandPaths.js'), 'bandPaths'],
    ['sweeps', import('../bandSweep.js'), 'sweepBand', 'viewFromWall'],
    ['wallParts', import('../wallParts.js'), 'wallParts'],
    ['corner', import('../cornerParts.js'), 'cornerParts', 'combinedCornerShapes'],
    ['legs/fills', import('../cornerLegPayload.js'), 'cornerLegPayload'],
    ['legs/fills', import('../legs.js'), 'runLegs'],
    ['legs/fills', import('../legFills.js'), 'runLegFills'],
    ['door details', import('../elevationDoorDetails.js'), 'elevationDoorDetails'],
    ['pulls', import('../pullLayouts.js'), 'elevationPulls'],
    ['show-through', import('../showThrough.js'), 'wallShowThrough'],
    ['plan', import('../planParts.js'), 'planParts'],
    ['elevationDimensions', import('../elevationDimensions.js'), 'elevationDimensions'],
    ['elevationMarks', import('../elevationMarks.js'), 'elevationMarks'],
    ['elevationPartNumbers', import('../elevationPartNumbers.js'), 'elevationPartNumbers'],
    ['planDimensions', import('../planDimensions.js'), 'planDimensions'],
    ['planMarks', import('../planMarks.js'), 'planMarks'],
    ['planShapes', import('../planParts.js'), 'planShapes'],
  ];
  let active = false;
  let insideBandPaths = false;
  let totals = {};
  const spies = [];
  // Test-only entry point: share the part list's scenes/corners and time each path's sweep/view once.
  const build = () => withBuildCache(() => {
    const list = roomPartList(room, settings);
    for (const path of bandPaths(room, settings).paths) {
      const sweep = sweepBand(room, path, settings);
      const { wallId, face } = path.segments[0];
      viewFromWall(room, sweep, room.walls.find(({ id }) => id === wallId), face);
    }
    return list;
  }, room);
  try {
    for (const [category, modulePromise, ...names] of builders) {
      const module = await modulePromise;
      for (const name of names) {
        const build = module[name];
        spies.push(vi.spyOn(module, name).mockImplementation((...args) => {
          // Attribute nested builders to their outer builder, avoiding double counting.
          if (active) return build(...args);
          active = true;
          insideBandPaths = category === 'bandPaths';
          const start = performance.now();
          try { return build(...args); } finally {
            totals[category] = (totals[category] ?? 0) + performance.now() - start;
            active = false;
            insideBandPaths = false;
          }
        }));
      }
    }
    build();
    const samples = Array.from({ length: 5 }, () => {
      totals = {};
      const start = performance.now();
      build();
      const elapsed = performance.now() - start;
      return { ...totals, geometryOnly: elapsed - annotations.reduce((sum, name) => sum + (totals[name] ?? 0), 0) };
    });
    const medians = Object.fromEntries([...new Set(builders.map(([category]) => category)), 'geometryOnly']
      .map((category) => [category, samples.map((row) => row[category] ?? 0).sort((a, b) => a - b)[2]]));

    // Separate diagnostic pass keeps fine-grained spy overhead out of the baseline above.
    // Attribute nested calls to the outermost imported function used by bandPaths.
    const dependencies = [
      [import('../bandParts.js'), 'bandFronts'],
      [import('../cornerBands.js'), 'cornerBandEdge', 'lazyCornerShapes', 'profileBandJoint'],
      [import('../cornerLegBands.js'), 'cornerLegBandEdge'],
      [import('../corners.js'), 'cornerAt', 'cornerEndActive', 'frontDepth', 'runBackOffset'],
      [import('../floorOpenings.js'), 'floorEndOpen'],
      [import('../furnitureBase.js'), 'runBase'],
      [import('../geometry.js'), 'elevationToPlan', 'lineIntersection', 'scale'],
      [import('../moldingProfiles.js'), 'moldingProfiles'],
      [import('../nosing.js'), 'woodTopSection'],
      [import('../parts.js'), 'wallEndPanelPartKey'],
      [import('../profile.js'), 'resolveProfile'],
      [import('../recesses.js'), 'recessesOn'],
      [import('../runBands.js'), 'bandPast', 'carries', 'isOpenWallEnd', 'touching', 'wallReach', 'waterfallEnds'],
      [import('../runScene.js'), 'runScene'],
      [import('../topOverhang.js'), 'topOverhangs'],
      [import('../tops.js'), 'isCountertop', 'runMoldings', 'runTop'],
      [import('../topology.js'), 'wallNumbers'],
      [import('../wallSides.js'), 'wallEndPanelAt', 'wallSideFrame', 'wallSideView'],
    ];
    let costActive = false;
    let costs = {};
    for (const [modulePromise, ...names] of dependencies) {
      const module = await modulePromise;
      for (const name of names) {
        const fn = module[name];
        spies.push(vi.spyOn(module, name).mockImplementation((...args) => {
          if (!insideBandPaths || costActive) return fn(...args);
          costActive = true;
          const start = performance.now();
          try { return fn(...args); } finally {
            costs[name] = (costs[name] ?? 0) + performance.now() - start;
            costActive = false;
          }
        }));
      }
    }
    build();
    const costSamples = Array.from({ length: 5 }, () => {
      costs = {};
      build();
      return costs;
    });
    const bandPathsCosts = Object.fromEntries([...new Set(costSamples.flatMap(Object.keys))]
      .map((name) => [name, costSamples.map((row) => row[name] ?? 0).sort((a, b) => a - b)[2]])
      .sort((a, b) => b[1] - a[1]).slice(0, 3));
    return { ...medians, bandPathsCosts };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

it.runIf(process.env.PERF)('builds N1 payload within 300 ms and measures G4 (GC2)', async () => {
  const medians = {};
  for (const key of ['N1', 'G4']) {
    const { room: source, settings } = rooms.find((room) => room.key === key).load();
    const room = syncRoom(source, settings);
    medians[key] = {
      roomPartList: medianTime(() => roomPartList(room, settings)),
      toDrawingPayload: medianTime(() => toDrawingPayload(room, settings)),
      partNumbers: medianTime(() => partNumbers(room, settings)),
    };
  }
  console.log('GC2 medians (ms):', JSON.stringify(medians));
  for (const key of ['N1', 'G4']) {
    const { room, settings } = rooms.find((room) => room.key === key).load();
    console.log(`D3 ${key} builder medians (ms):`, JSON.stringify(await builderSplit(syncRoom(room, settings), settings)));
  }
  for (const { key, load } of rooms) {
    const { room: source, settings } = load();
    const list = roomPartList(syncRoom(source, settings), settings);
    const pieces = [...list.elevations.flatMap(({ parts }) => parts), ...list.plan.parts];
    const tagged = new Set(pieces.map(({ itemKey }) => itemKey));
    const untagged = {};
    for (const piece of pieces.filter(({ itemKey }) => itemKey === null)) {
      untagged[piece.kind] = (untagged[piece.kind] ?? 0) + 1;
    }
    console.log(JSON.stringify({ room: key, untagged,
      noTaggedPiece: list.items.filter(({ key }) => !tagged.has(key)).map(({ key, kind }) => ({ key, kind })) }));
  }
  expect(medians.N1.toDrawingPayload).toBeLessThan(300);
}, 60000);
