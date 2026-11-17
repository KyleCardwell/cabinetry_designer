import { expect, it, vi } from 'vitest';
import { toDrawingPayload } from '../drawingPayload.js';
import { roomPartList } from '../partList.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const rooms = goldenRooms();
const drawingNames = ['doorDetails', 'swingMarks', 'pulls', 'interiors', 'shapes', 'glassMarks'];
const withoutTags = (pieces) => pieces.map(({ itemKey, ...piece }) => {
  expect(itemKey === null || typeof itemKey === 'string').toBe(true);
  return piece;
});

it.each(rooms)('matches $key drawing geometry and item order (GC1)', ({ key, load }) => {
  const { room: source, settings } = load();
  const room = syncRoom(source, settings);
  const list = roomPartList(room, settings);
  const payload = toDrawingPayload(room, settings);
  expect(list.items).toEqual(roomParts(room, settings));
  expect(list.elevations.map(({ key, letter }) => [key, letter]))
    .toEqual(payload.elevations.map(({ key, letter }) => [key, letter]));
  list.elevations.forEach((elevation, i) => {
    const expected = payload.elevations[i];
    for (const name of ['key', 'letter', 'wallId', 'side', 'length', 'height']) {
      expect(elevation[name]).toEqual(expected[name]);
    }
    expect(withoutTags(elevation.pieces)).toEqual(expected.parts);
    for (const name of drawingNames) expect(elevation.drawings[name]).toEqual(expected[name] ?? []);
  });
  expect(withoutTags(list.plan.pieces)).toEqual(payload.plan.parts);
  if (process.env.PERF) {
    const pieces = [...list.elevations.flatMap(({ pieces }) => pieces), ...list.plan.pieces];
    const tagged = new Set(pieces.map(({ itemKey }) => itemKey));
    const untagged = {};
    for (const piece of pieces.filter(({ itemKey }) => itemKey === null)) {
      untagged[piece.kind] = (untagged[piece.kind] ?? 0) + 1;
    }
    console.log(JSON.stringify({ room: key, untagged,
      noTaggedPiece: list.items.filter(({ key }) => !tagged.has(key)).map(({ key, kind }) => ({ key, kind })) }));
  }
});

it.each([
  ['N1', 'toe_kick'],
  ['N1', 'face'],
  ['N2', 'furniture_base'],
])('tags %s %s pieces with their owning item (GC1)', (key, kind) => {
  const { room: source, settings } = rooms.find((room) => room.key === key).load();
  const list = roomPartList(syncRoom(source, settings), settings);
  const cabinets = list.items.filter(({ kind }) => kind === 'cabinet');
  const pieces = list.elevations.flatMap(({ pieces }) => pieces).filter((piece) => piece.kind === kind)
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

it('tags a run\'s second furniture base and extra wood tops with their own items (GC1)', () => {
  const { room: source, settings } = rooms.find((room) => room.key === 'N2').load();
  const list = roomPartList(syncRoom(source, settings), settings);
  const tagged = new Set(list.elevations.flatMap(({ pieces }) => pieces).map(({ itemKey }) => itemKey));
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

async function builderSplit(room, settings) {
  const builders = [
    ['elevationParts', import('../elevationParts.js'), 'elevationParts'],
    ['bandParts', import('../bandParts.js'), 'bandParts'],
    ['wallParts', import('../wallParts.js'), 'wallParts'],
    ['corner', import('../cornerParts.js'), 'cornerParts', 'combinedCornerShapes'],
    ['legs/fills', import('../cornerLegPayload.js'), 'cornerLegPayload'],
    ['legs/fills', import('../legs.js'), 'runLegs'],
    ['legs/fills', import('../legFills.js'), 'runLegFills'],
    ['door details', import('../elevationDoorDetails.js'), 'elevationDoorDetails'],
    ['pulls', import('../pullLayouts.js'), 'elevationPulls'],
    ['show-through', import('../showThrough.js'), 'wallShowThrough'],
    ['plan', import('../planParts.js'), 'planParts'],
  ];
  let active = false;
  let totals = {};
  const spies = [];
  try {
    for (const [category, modulePromise, ...names] of builders) {
      const module = await modulePromise;
      for (const name of names) {
        const build = module[name];
        spies.push(vi.spyOn(module, name).mockImplementation((...args) => {
          // Attribute nested builders to their outer builder, avoiding double counting.
          if (active) return build(...args);
          active = true;
          const start = performance.now();
          try { return build(...args); } finally {
            totals[category] = (totals[category] ?? 0) + performance.now() - start;
            active = false;
          }
        }));
      }
    }
    roomPartList(room, settings);
    const samples = Array.from({ length: 5 }, () => {
      totals = {};
      roomPartList(room, settings);
      return totals;
    });
    return Object.fromEntries([...new Set(builders.map(([category]) => category))]
      .map((category) => [category, samples.map((row) => row[category] ?? 0).sort((a, b) => a - b)[2]]));
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

it.runIf(process.env.PERF)('builds N1 part list within 50 ms and measures G4 (GC1)', async () => {
  const medians = {};
  for (const key of ['N1', 'G4']) {
    const { room: source, settings } = rooms.find((room) => room.key === key).load();
    const room = syncRoom(source, settings);
    medians[key] = {
      roomPartList: medianTime(() => roomPartList(room, settings)),
      toDrawingPayload: medianTime(() => toDrawingPayload(room, settings)),
    };
  }
  console.log('GC1 medians (ms):', JSON.stringify(medians));
  if (medians.N1.roomPartList >= 50) {
    const { room, settings } = rooms.find(({ key }) => key === 'N1').load();
    console.log('GC1 N1 builder medians (ms):', JSON.stringify(await builderSplit(syncRoom(room, settings), settings)));
  }
  expect(medians.N1.roomPartList).toBeLessThan(50);
}, 60000);
