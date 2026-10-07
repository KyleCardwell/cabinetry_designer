import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cornerShapes } from '../cornerParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const shapesOf = (synced, wallIndex) => cornerShapes(synced, synced.walls[wallIndex], 'front', settings);
const row = (part) => [part.id.split(':').pop(), part.kind, part.x, part.z, part.width, part.height, part.back, part.front];

const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';
const BACK_RUN = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

describe('SPEC-42.2 neighbour profiles', () => {
  it('draws a run that reaches past this face\'s end from its side, after the returns (G2 elevation A)', () => {
    const shapes = shapesOf(room('G2 Face frame kitchen'), 0);
    expect(shapes.map(({ kind }) => kind)).toEqual(['return', 'profile']);
    expect(shapes[1]).toMatchObject({ key: `${PENINSULA}:back:${BACK_RUN}:right`, wallId: PENINSULA, runId: BACK_RUN });
    expect(shapes[1].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 172, 0, 21, 4, 0, 77.75],
      ['box', 'profile', 172, 4, 24, 30.5, 0, 77.75],
      ['countertop', 'countertop', 172, 34.5, 24.75, 1.5, 0, 77.75],
    ]);
    expect(shapes[1].parts.every((part) => !('opaque' in part))).toBe(true);
  });

  it('never sees a run in the neighbour\'s recess; a neighbour inside the wall\'s length is only a return (G5, G1)', () => {
    expect(shapesOf(room('G5 Recess room'), 0).map(({ kind }) => kind)).toEqual(['return']);
    expect(shapesOf(room('G5 Recess room'), 2)).toEqual([]);
    expect(shapesOf(room('G1 Euro kitchen'), 0).map(({ kind }) => kind)).toEqual(['return', 'return']);
  });
});
