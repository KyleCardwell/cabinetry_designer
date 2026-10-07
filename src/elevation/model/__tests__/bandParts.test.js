import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const partsOf = (synced, wallIndex, side = 'front') => bandParts(synced, synced.walls[wallIndex], side, settings);
const row = ({ id, kind, x, z, width, height, back, front, coversBoxEdges }) => (
  [id, kind, x, z, width, height, back, front, coversBoxEdges]
);

const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';

describe('SPEC-42 band parts', () => {
  it('a toe kick sits back from the boxes; a top runs past the faces (G1 elevation A)', () => {
    const parts = partsOf(room('G1 Euro kitchen'), 0);
    expect(parts.map(row)).toEqual([
      [`${TALL}:toe_kick`, 'toe_kick', 0, 0, 29, 4, 0, 22, false],
      [`${TALL}:top_mold`, 'top_mold', 0, 90, 30.25, 3, 0, 26.125, false],
      [`${TALL}:crown`, 'crown', 0, 91.5, 33, 4.5, 0, 28.875, false],
      [`${BASE}:toe_kick`, 'toe_kick', 29, 0, 118, 4, 0, 21, false],
      [`${BASE}:countertop`, 'countertop', 30, 34.5, 112.375, 1.5, 0, 25.625, false],
      [`${UPPER}:top_mold`, 'top_mold', 108.25, 90, 46.625, 3, 0, 13.125, false],
      [`${UPPER}:crown`, 'crown', 105.5, 91.5, 46.625, 4.5, 0, 15.875, false],
    ]);
    expect(parts[0]).toEqual({
      id: `${TALL}:toe_kick`, kind: 'toe_kick', runId: TALL,
      x: 0, z: 0, width: 29, height: 4, back: 0, front: 22, coversBoxEdges: false,
    });
  });

  it('a face frame run\'s top runs past its frame; a recess run\'s bands sit back in the recess (G2, G5)', () => {
    const g2 = partsOf(room('G2 Face frame kitchen'), 0);
    const frameRun = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';
    expect(row(g2.find(({ id }) => id === `${frameRun}:crown`)))
      .toEqual([`${frameRun}:crown`, 'crown', 47, 91.5, 32.5, 4.5, 0, 28.8125, false]);
    const recessRun = 'e9abb5dc-e72c-44c9-ac96-d3279b7752d9';
    expect(partsOf(room('G5 Recess room'), 1).filter(({ runId }) => runId === recessRun).map(row)).toEqual([
      [`${recessRun}:toe_kick`, 'toe_kick', 140, 0, 48, 4, -24, -6, false],
      [`${recessRun}:countertop`, 'countertop', 140, 34.5, 48, 1.5, -24, -1.375, false],
    ]);
  });

  it('a part below a run is flush with its boxes; an outset run\'s bands move out with it (G6)', () => {
    const parts = partsOf(room('G6 Stacked runs'), 1);
    expect(parts.map(({ kind }) => kind)).toEqual([
      'toe_kick', 'countertop', 'bottom_cap', 'top_mold', 'crown', 'toe_kick', 'countertop',
    ]);
    expect(row(parts[2])).toEqual(['c77d332c-1c0f-46ec-80a7-269fd9db569b', 'bottom_cap', 0, 52.5, 100.25, 1.5, 0, 12, false]);
    const wood = '01a2a0e1-4bd1-434d-9c9b-66bc20ee7e54';
    expect(row(parts[6])).toEqual([`${wood}:countertop`, 'countertop', 127.75, 34.5, 72.25, 1.5, 8, 33.625, false]);
  });
});
