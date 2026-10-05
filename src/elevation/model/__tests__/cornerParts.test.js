import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cornerParts, cornerShapes } from '../cornerParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => cornerParts(synced, synced.walls[wallIndex], side, settings);
const shapesOf = (synced, wallIndex, side = 'front') => cornerShapes(synced, synced.walls[wallIndex], side, settings);
/** A part as [last id segment, kind, x, z, width, height, back, front, opaque]. */
const row = (part) => [
  part.id.split(':').pop(), part.kind, part.x, part.z, part.width, part.height, part.back, part.front,
  part.opaque ?? true,
];

const G1_A = 'cb33d774-f31e-41c1-bbe4-198cbf981619';
const G3_HOST = '6d7021c6-5293-4d11-ae7f-47086e301920';
const G3_WING = '5ab00c5d-9ea6-4d32-9586-d266db26a4d2';

describe('SPEC-42.2 corner returns', () => {
  it('cuts the next wall\'s runs where they meet this face: box and faces hatched, bands outlined (G1 elevation B)', () => {
    const shapes = shapesOf(room('G1 Euro kitchen'), 1);
    expect(shapes.map(({ key, kind, wallId }) => [key, kind, wallId])).toEqual([
      [`left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a`, 'return', G1_A],
      [`left:${G1_A}:434f1164-3b6b-4a97-89e7-1c6438c4d95a`, 'return', G1_A],
    ]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 0, 0, 21, 4, 24.875, 138, false],
      ['box', 'section', 0, 4, 24, 30.5, 24.875, 138, true],
      ['faces', 'section', 24, 4, 0.875, 30.5, 24.875, 138, true],
      ['countertop', 'countertop', 0, 34.5, 25.625, 1.5, 24.875, 138, false],
    ]);
    expect(shapes[1].parts.map(row)).toEqual([
      ['box', 'section', 0, 54, 12, 36, 12.875, 59.5, true],
      ['faces', 'section', 12, 54, 0.875, 36, 12.875, 59.5, true],
      ['top_mold', 'top_mold', 0, 90, 13.125, 1.5, 12.875, 59.5, false],
      ['crown', 'crown', 0, 91.5, 15.875, 4.5, 12.875, 59.5, false],
    ]);
    expect(shapes[0].parts[1]).toEqual({
      id: `left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a:box`, kind: 'section',
      runId: 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a',
      x: 0, z: 4, width: 24, height: 30.5, back: 24.875, front: 138, coversBoxEdges: false,
    });
  });

  it('a right-hand corner measures back from the wall end; a soffit that dies in is one section (G3)', () => {
    const shapes = shapesOf(room('G3 Bath alcove'), 0);
    expect(shapes.map(({ kind, wallId, soffitId }) => [kind, wallId, soffitId])).toEqual([
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, '5ac8edd3-2c75-476d-bc64-f80ade3f5fba'],
    ]);
    expect(partsOf(room('G3 Bath alcove'), 0).map(row)).toEqual([
      ['toe_kick', 'toe_kick', 12, 0, 18, 4, 0, 72, false],
      ['box', 'section', 9, 4, 21, 30.5, 0, 72, true],
      ['faces', 'section', 8.125, 4, 0.875, 30.5, 0, 72, true],
      ['countertop', 'countertop', 7.375, 34.5, 22.625, 1.5, 0, 72, false],
      ['box', 'section', 6, 36, 24, 42, 0, 72, true],
      ['top_mold', 'top_mold', 5.75, 78, 24.25, 1.5, 0, 72, false],
      ['crown', 'crown', 3, 79.5, 27, 4.5, 0, 72, false],
      ['5ac8edd3-2c75-476d-bc64-f80ade3f5fba', 'section', 16, 84, 14, 12, 0, 72, true],
    ]);
    expect(shapes[2].parts[0].id).toBe(`soffit:right:${G3_HOST}:5ac8edd3-2c75-476d-bc64-f80ade3f5fba`);
  });

  it('cuts a wing wall\'s run anchored into the host face, from the wing wall\'s side (G3)', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'back', anchors: { right: true } }];
    const shapes = shapesOf(syncRoom(copy, settings), 1);
    expect(shapes.map(({ key }) => key)).toEqual([`landing:${G3_WING}:left:wing-base`]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 76.5, 0, 18, 4, 0, 24, false],
      ['box', 'section', 76.5, 4, 21, 30.5, 0, 24, true],
      ['faces', 'section', 97.5, 4, 0.875, 30.5, 0, 24, true],
      ['countertop', 'countertop', 76.5, 34.5, 22.625, 1.5, 0, 24, false],
    ]);
  });
});
