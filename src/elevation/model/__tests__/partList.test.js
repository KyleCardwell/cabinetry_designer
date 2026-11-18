import { expect, it, vi } from 'vitest';
import { toDrawingPayload } from '../drawingPayload.js';
import { roomPartList } from '../partList.js';
import { partNumbers } from '../partNumbers.js';
import { syncRoom } from '../room.js';
import { goldenRooms } from './helpers/goldenRooms.js';

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
    ['elevationDimensions', import('../elevationDimensions.js'), 'elevationDimensions'],
    ['elevationMarks', import('../elevationMarks.js'), 'elevationMarks'],
    ['elevationPartNumbers', import('../elevationPartNumbers.js'), 'elevationPartNumbers'],
    ['planDimensions', import('../planDimensions.js'), 'planDimensions'],
    ['planMarks', import('../planMarks.js'), 'planMarks'],
    ['planShapes', import('../planParts.js'), 'planShapes'],
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
      const start = performance.now();
      roomPartList(room, settings);
      const elapsed = performance.now() - start;
      return { ...totals, geometryOnly: elapsed - annotations.reduce((sum, name) => sum + (totals[name] ?? 0), 0) };
    });
    return Object.fromEntries([...new Set(builders.map(([category]) => category)), 'geometryOnly']
      .map((category) => [category, samples.map((row) => row[category] ?? 0).sort((a, b) => a - b)[2]]));
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
  const { room, settings } = rooms.find(({ key }) => key === 'N1').load();
  console.log('GC2 N1 builder medians (ms):', JSON.stringify(await builderSplit(syncRoom(room, settings), settings)));
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
