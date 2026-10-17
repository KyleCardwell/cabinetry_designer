import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combinedElevationPayload, shiftPayloadRecord } from '../combinedPayload.js';
import { combinedViewOf } from '../combinedElevations.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallExtent } from '../wallExtent.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { run } from '../../store/__tests__/helpers/sliceFixtures.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const settings = { ...document.settings, runFlex: 0 };
const to = (wallId, endpoint) => ({ wallId, endpoint });
const wall = (id, x1, y1, x2, y2, start, end, runs = []) => ({
  id, name: id, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
  runs, openings: [], recesses: [], soffits: [], connections: { start, end },
});

function steppedRoom() {
  return syncRoom({
    id: 'room-1', name: 'Stepped room', profile: document.rooms[0].profile,
    wallOrder: ['C', 'K', 'B', 'J', 'A'], swingMarks: true, doorDetails: true,
    combinedElevations: [{ id: 'g', on: true, faces: ['A', 'B', 'C'] }],
    walls: [
      wall('A', 0, 0, 100, 0, null, to('J', 'start'), [run({ id: 'a', x: 10, width: 30 })]),
      wall('J', 100, 0, 100, 16, to('A', 'end'), to('B', 'start')),
      wall('B', 100, 16, 160, 16, to('J', 'end'), to('K', 'start'), [run({ id: 'b', x: 10, width: 30 })]),
      wall('K', 160, 16, 160, 0, to('B', 'end'), to('C', 'start')),
      wall('C', 160, 0, 240, 0, to('K', 'end'), null, [run({ id: 'c', x: 10, width: 30 })]),
    ],
  }, settings);
}

describe('combined drawing payload', () => {
  it('exports one elevation A with the lead identity, anchor faces and shifted parts/columns', () => {
    const room = steppedRoom();
    const payload = toDrawingPayload(room, settings);
    expect(payload.elevations).toHaveLength(1);
    const [elevation] = payload.elevations;
    // §1 retains the lead key C; A is the elevation's letter.
    expect(elevation).toMatchObject({ key: 'C', wallId: 'C', side: 'front', letter: 'A', length: 240, height: 96 });
    expect(elevation.faces).toEqual([
      { key: 'C', wallId: 'C', side: 'front', dx: 0, depth: 0, length: 80, height: 96, wallLabel: 'Wall 1 · C' },
      { key: 'B', wallId: 'B', side: 'front', dx: 80, depth: -16, length: 60, height: 96, wallLabel: 'Wall 3 · B', note: '16" back' },
      { key: 'A', wallId: 'A', side: 'front', dx: 140, depth: 0, length: 100, height: 96, wallLabel: 'Wall 5 · A' },
    ]);
    expect(elevation.wallLabel).toBe('Wall 1 · C, Wall 3 · B, Wall 5 · A');
    const off = { ...room, combinedElevations: [] };
    const separate = toDrawingPayload(off, settings).elevations;
    const ownA = separate.find(({ wallId }) => wallId === 'A');
    const at10 = ownA.parts.find(({ runId, x }) => runId === 'a' && x === 10);
    expect(at10).toBeDefined();
    expect(elevation.parts.find(({ id }) => id === at10.id).x).toBe(150);
    const cDimensions = separate.find(({ wallId }) => wallId === 'C').dimensions;
    expect(elevation.dimensions.filter(({ row }) => row.startsWith('left.')))
      .toEqual(cDimensions.filter(({ row }) => row.startsWith('left.')));
    expect(elevation.dimensions.filter(({ row }) => row.startsWith('right.')))
      .toEqual(ownA.dimensions.filter(({ row }) => row.startsWith('right.')).map((record) => shiftPayloadRecord(record, 140)));
    expect(elevation.dimensions.slice(0, cDimensions.filter(({ row }) => !row.startsWith('right.')).length))
      .toEqual(cDimensions.filter(({ row }) => !row.startsWith('right.')));
    for (const collection of ['marks', 'doorDetails', 'partNumbers', 'swingMarks', 'pulls']) {
      const expected = separate.flatMap((face) => (face[collection] ?? [])
        .map((record) => shiftPayloadRecord(record, { C: 0, B: 80, A: 140 }[face.wallId])));
      if (collection !== 'marks') expect(expected.length).toBeGreaterThan(0);
      expect(elevation[collection] ?? []).toEqual(expected);
    }
  });

  it('shifts every geometry x field, including nested coordinates, without shifting heights or bulges', () => {
    const part = { x: 10, z: 20, width: 30, height: 40, back: 0, front: 24,
      holes: [{ x: 11, z: 21, width: 2, height: 3 }],
      lines: [{ x1: 10, z1: 20, x2: 12, z2: 22 }], outline: [[10, 20, 0.5], [12, 22]] };
    const copy = structuredClone(part);
    expect(shiftPayloadRecord(part, 140)).toEqual({ ...part, x: 150,
      holes: [{ x: 151, z: 21, width: 2, height: 3 }],
      lines: [{ x1: 150, z1: 20, x2: 152, z2: 22 }], outline: [[150, 20, 0.5], [152, 22]] });
    expect(part).toEqual(copy);
    const dim = { row: 'pins', start: 1, end: 9, base: 5, at: 7, textX: 3, textZ: 11, startBase: 2, endBase: 4 };
    expect(shiftPayloadRecord(dim, 80)).toEqual({ ...dim, start: 81, end: 89, textX: 83 });
    expect(shiftPayloadRecord({ ...dim, orientation: 'vertical' }, 80))
      .toEqual({ ...dim, orientation: 'vertical', base: 85, at: 87, textX: 83, startBase: 82, endBase: 84 });
    expect(shiftPayloadRecord({ x: 10, textX: 12, textZ: 90, bottom: 0, top: 96 }, 80))
      .toEqual({ x: 90, textX: 92, textZ: 90, bottom: 0, top: 96 });
    expect(shiftPayloadRecord({ partId: 'p', openings: [{ x: 1 }], profileLines: [{ x: 2 }],
      miters: [{ x1: 3, x2: 4 }] }, 80)).toEqual({ partId: 'p', openings: [{ x: 81 }],
      profileLines: [{ x: 82 }], miters: [{ x1: 83, x2: 84 }] });
    expect(shiftPayloadRecord({ partId: 'p', outlines: [[[1, 2, -1], [3, 4, 1]]] }, 80))
      .toEqual({ partId: 'p', outlines: [[[81, 2, -1], [83, 4, 1]]] });
    expect(shiftPayloadRecord({ key: 'p', x: 1, z: 2, leader: { x1: 1, z1: 2, x2: 3, z2: 4 } }, 80))
      .toEqual({ key: 'p', x: 81, z: 2, leader: { x1: 81, z1: 2, x2: 83, z2: 4 } });
  });

  it('lays rows against the shared tallest top and lowest bottom, keeping each face\'s own column bases', () => {
    const room = steppedRoom();
    room.walls.find(({ id }) => id === 'B').height = 120;
    room.walls.find(({ id }) => id === 'A').runs[0].z = -8;
    const combined = combinedViewOf(room, 'C');
    const [elevation] = toDrawingPayload(room, settings).elevations;
    expect(elevation.height).toBe(120);
    const extents = combined.faces.map(({ wallId, side }) => {
      const wall = room.walls.find(({ id }) => id === wallId);
      return wallExtent(room, resolveWall(room, wall, side), settings);
    });
    const extent = { top: 120, bottom: -8 };
    expect(Math.max(...extents.map(({ top }) => top))).toBe(extent.top);
    expect(Math.min(...extents.map(({ bottom }) => bottom))).toBe(extent.bottom);
    const expected = combined.faces.flatMap(({ wallId, side, dx }) => {
      const wall = room.walls.find(({ id }) => id === wallId);
      const own = elevationDimensions(room, wall, side, settings);
      const shared = elevationDimensions(room, wall, side, settings, { extent });
      expect(shared.filter(({ orientation }) => orientation === 'vertical'))
        .toEqual(own.filter(({ orientation }) => orientation === 'vertical'));
      expect(shared.filter(({ row }) => row.startsWith('lower.')).every(({ base }) => base === -8)).toBe(true);
      expect(shared.filter(({ row }) => row.startsWith('upper.')).every(({ base }) => base === 120)).toBe(true);
      return shared.filter(({ row }) => (!row.startsWith('left.') || wallId === 'C')
        && (!row.startsWith('right.') || wallId === 'A')).map((record) => shiftPayloadRecord(record, dx));
    });
    expect(elevation.dimensions).toEqual(expected);
  });

  it('keeps the first occurrence of a part and drops later references and badges', () => {
    const room = steppedRoom();
    const combined = combinedViewOf(room, 'C');
    const result = combinedElevationPayload(room, combined, settings, (wall) => ({
      key: 'C', wallId: 'C', side: 'front', parts: [{ id: 'shared', x: 1 }, { id: wall.id, x: 2 }],
      doorDetails: [{ partId: 'shared', openings: [{ x: 3 }] }, { partId: wall.id, openings: [{ x: 4 }] }],
      swingMarks: [{ partId: 'shared', lines: [{ x1: 1, x2: 2 }] }, { partId: wall.id, lines: [{ x1: 3, x2: 4 }] }],
      pulls: [{ partId: 'shared', outlines: [[[1, 2], [3, 4]]] }, { partId: wall.id, outlines: [[[5, 6], [7, 8]]] }],
      partNumbers: [{ key: 'shared', x: 1 }, { key: wall.id, x: 2 }],
    }));
    expect(result.parts).toEqual([{ id: 'shared', x: 1 }, { id: 'C', x: 2 }, { id: 'B', x: 82 }, { id: 'A', x: 142 }]);
    for (const key of ['doorDetails', 'swingMarks', 'pulls']) {
      expect(result[key].map(({ partId }) => partId)).toEqual(['shared', 'C', 'B', 'A']);
    }
    expect(result.doorDetails[0].openings).toEqual([{ x: 3 }]);
    expect(result.partNumbers).toEqual([{ key: 'shared', x: 1 }, { key: 'C', x: 2 }, { key: 'B', x: 82 }, { key: 'A', x: 142 }]);
  });

  it('formats fractional/outward notes from the lead and omits equal-depth notes and empty options', () => {
    const room = steppedRoom();
    const combined = combinedViewOf(room, 'C');
    combined.faces[0].depth = -16.5;
    combined.faces[1].depth = 0;
    combined.faces[2].depth = -16.5 + 1e-7;
    const result = combinedElevationPayload(room, combined, settings, () => ({ parts: [] }));
    expect(result.faces.map(({ note }) => note)).toEqual([undefined, '16 1/2" out', undefined]);
    expect(result).not.toHaveProperty('swingMarks');
    expect(result).not.toHaveProperty('pulls');
  });

  it('keeps disabled groups byte-identical to separate output in every golden room', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      const expected = JSON.stringify(toDrawingPayload(room, settings));
      const off = { ...room, combinedElevations: [{ id: 'off', on: false, faces: room.wallOrder }] };
      expect(JSON.stringify(toDrawingPayload(off, settings))).toBe(expected);
    }
  });
});
