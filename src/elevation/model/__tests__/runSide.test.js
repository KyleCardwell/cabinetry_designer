import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSide } from '../runSide.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

/** runSide of the run whose id starts with `prefix`, on one wall face of a golden room, as rows. */
function sideOf(name, wallIndex, prefix, side = 'front') {
  const room = syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
  const view = resolveWall(room, room.walls[wallIndex], side);
  const run = view.runs.find(({ id }) => id.startsWith(prefix));
  return runSide(room, view, run, settings).map(({ piece, z, height, back, front }) => [piece, z, height, back, front]);
}

describe('SPEC-42.2 a run seen from its side', () => {
  it('gives the toe kick, box, faces and top with their depths from the wall face (G1 elevation A)', () => {
    // The tall: crown over a top mold that stops under it.
    expect(sideOf('G1 Euro kitchen', 0, 'b38f2f11')).toEqual([
      ['toe_kick', 0, 4, 0, 22],
      ['box', 4, 86, 0, 25],
      ['faces', 4, 86, 25, 25.875],
      ['top_mold', 90, 1.5, 0, 26.125],
      ['crown', 91.5, 4.5, 0, 28.875],
    ]);
    expect(sideOf('G1 Euro kitchen', 0, 'b822e8ac')).toEqual([
      ['toe_kick', 0, 4, 0, 21],
      ['box', 4, 30.5, 0, 24],
      ['faces', 4, 30.5, 24, 24.875],
      ['countertop', 34.5, 1.5, 0, 25.625],
    ]);
    // An upper has no toe kick.
    expect(sideOf('G1 Euro kitchen', 0, '434f1164').map(([piece]) => piece))
      .toEqual(['box', 'faces', 'top_mold', 'crown']);
  });

  it('a face frame stands 13/16 off the box; a panel-only run has no faces (G2)', () => {
    expect(sideOf('G2 Face frame kitchen', 0, 'a42e9a57')[2]).toEqual(['faces', 4, 86, 25, 25.8125]);
    expect(sideOf('G2 Face frame kitchen', 1, '2c8ab1e3', 'back')).toEqual([
      ['toe_kick', 0, 4, 0, 21],
      ['box', 4, 30.5, 0, 24],
      ['countertop', 34.5, 1.5, 0, 24.75],
    ]);
  });

  it('moves out with an outset run and back into a recess; a run with no top is only its box (G5, G6)', () => {
    expect(sideOf('G6 Stacked runs', 1, '01a2a0e1')).toEqual([
      ['toe_kick', 0, 4, 8, 29],
      ['box', 4, 30.5, 8, 32],
      ['faces', 4, 30.5, 32, 32.875],
      ['countertop', 34.5, 1.5, 8, 33.625],
    ]);
    expect(sideOf('G5 Recess room', 1, 'e9abb5dc')[1]).toEqual(['box', 4, 30.5, -24, -3]);
    expect(sideOf('G6 Stacked runs', 1, 'b1ec1b4a')).toEqual([['box', 36, 16.5, 0, 12]]);
  });
});
