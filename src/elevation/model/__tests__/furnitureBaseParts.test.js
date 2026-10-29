import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run as buildRun, wall as buildWall, auto } from '../../../test/builders.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { partNumbers, wallMoldingBadges } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0, sectionProfiles: load('sectionProfiles').profiles };
// cb33d7… identifies the golden wall; its first lower run is this tall.
const WALL = 'cb33d774-f31e-41c1-bbe4-198cbf981619';
const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const KEY = `furniture_base:${TALL}`;
const goldenWithBase = () => {
  const stored = structuredClone(document.rooms[0]);
  for (const run of stored.walls.find(({ id }) => id === WALL).runs) {
    if ([TALL, BASE].includes(run.id)) {
      run.overrides = { ...run.overrides, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
    }
  }
  return syncRoom(stored, settings);
};
const badges = (room, wall, side, result = partNumbers(room, settings)) => wallMoldingBadges(
  room, wallSideView(wall, side), settings, result.byKey,
).filter(({ label }) => label === 'FB');

describe('SPEC-50.7 step 496 furniture base part numbers and badges', () => {
  it('keeps golden parts and numbers unchanged (anchor 1)', () => {
    const counts = [33, 21, 12, 12, 12, 19];
    for (const [index, stored] of document.rooms.entries()) {
      const room = syncRoom(stored, settings);
      const result = partNumbers(room, settings);
      expect(roomParts(room, settings)).toHaveLength(counts[index]);
      expect(result.parts.map(({ number }) => number))
        .toEqual(Array.from({ length: counts[index] }, (_, i) => i + 1));
      expect(result.parts.some(({ kind }) => kind === 'furniture_base')).toBe(false);
      for (const wall of room.walls) {
        for (const side of ['front', 'back']) expect(badges(room, wall, side, result)).toEqual([]);
      }
    }
  });

  it('places one FB before its first touching run and badges only that run (anchor 2)', () => {
    const room = goldenWithBase();
    const result = partNumbers(room, settings);
    const before = partNumbers(syncRoom(document.rooms[0], settings), settings);
    const index = result.parts.findIndex(({ key }) => key === KEY);
    expect(roomParts(room, settings)[index]).toEqual({ key: KEY, kind: 'furniture_base', runIds: [TALL, BASE] });
    expect(result.parts[index + 1].runId).toBe(TALL);
    expect(result.parts.filter(({ key }) => key !== KEY).map(({ key }) => key))
      .toEqual(before.parts.map(({ key }) => key));
    expect(result.parts.slice(-3).map(({ key, number }) => [key, number])).toEqual([
      ['molding:toeKick', 32], ['molding:topMold', 33], ['molding:crown', 34],
    ]);
    // The tall's deeper base returns 13/16 inch at its open left end and the touching shallower run.
    expect(badges(room, room.walls.find(({ id }) => id === WALL), 'front', result)).toEqual([
      { molding: 'furniture_base', slot: 0, key: KEY, number: result.byKey.get(KEY), label: 'FB', x: -0.8125, z: 0, width: 31.625, height: 4 },
    ]);
  });

  it('uses the FB key override and allocates the other numbers in walk order (anchor 3)', () => {
    const room = goldenWithBase();
    const before = partNumbers(syncRoom(document.rooms[0], settings), settings);
    room.partNumberOverrides = { ...room.partNumberOverrides, [KEY]: 99 };
    const result = partNumbers(room, settings);
    expect(result.parts.find(({ key }) => key === KEY))
      .toEqual({ key: KEY, kind: 'furniture_base', runIds: [TALL, BASE], number: 99 });
    expect(result.parts.filter(({ key }) => key !== KEY))
      .toEqual(before.parts.filter(({ key }) => key !== KEY));
    expect(result.overrideKeys.has(KEY)).toBe(true);
    expect(badges(room, room.walls.find(({ id }) => id === WALL), 'front', result)[0].number).toBe(99);
  });

  it('orders separate groups by wall walk and badges the first member on each face in face coordinates', () => {
    const stored = structuredClone(document.rooms[0]);
    const template = stored.walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
    const run = (id, x, width, wallSide = 'front') => buildRun({ ...structuredClone(template), id, x, width, wallSide,
      items: [auto(`${id}:box`)],
      anchors: {}, overrides: {}, ends: { left: { type: 'none' }, right: { type: 'none' } } });
    const wall = (id, runs) => buildWall({ ...structuredClone(stored.walls[0]), id, runs,
      x1: 0, y1: 0, x2: 120, y2: 0, connections: { start: null, end: null },
      endPanels: { start: null, end: null }, openings: [], joints: [] });
    stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
    stored.walls = [wall('A', [run('right', 30, 30), run('left', 10, 20),
      run('back-right', 80, 20, 'back'), run('back-left', 60, 20, 'back'),
      run('separate', 100, 10)]), wall('B', [run('first-wall', 30, 30)])];
    stored.wallOrder = ['B', 'A'];
    const room = syncRoom(stored, settings);
    const result = partNumbers(room, settings);
    expect(result.parts.filter(({ kind }) => kind === 'furniture_base').map(({ key, runIds }) => ({ key, runIds })))
      .toEqual([
        { key: 'furniture_base:first-wall', runIds: ['first-wall'] },
        { key: 'furniture_base:left', runIds: ['left', 'right', 'back-left', 'back-right'] },
        { key: 'furniture_base:separate', runIds: ['separate'] },
      ]);
    const a = room.walls.find(({ id }) => id === 'A');
    expect(badges(room, a, 'front', result).map(({ key, x, width }) => ({ key, x, width }))).toEqual([
      { key: 'furniture_base:left', x: 9.1875, width: 20.8125 },
      { key: 'furniture_base:separate', x: 99.1875, width: 11.625 },
    ]);
    expect(badges(room, a, 'back', result)).toEqual([
      { molding: 'furniture_base', slot: 0, key: 'furniture_base:left',
        number: result.byKey.get('furniture_base:left'), label: 'FB', x: 59.1875, z: 0, width: 20.8125, height: 4 },
    ]);
    expect(wallMoldingBadges(room, wallSideView(a, 'front'), settings, new Map())).toEqual([]);
  });
});
