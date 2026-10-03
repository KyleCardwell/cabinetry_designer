import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { frontDepth } from '../corners.js';
import { horizontalChains, openingChain, openingClearances } from '../dimensions.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { partNumbers } from '../partNumbers.js';
import { planClearances } from '../clearances.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, roomDiagnostics, syncRoom } from '../room.js';
import { wallFaceSegments } from '../wallFaceRow.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

// Anything that creates an id while deriving gets a predictable one.
vi.mock('uuid', () => {
  let count = 0;
  return { v4: () => `golden-${(count += 1)}` };
});

const NAMES = [
  'G1 Euro kitchen', 'G2 Face frame kitchen', 'G3 Bath alcove',
  'G4 T-filler run', 'G5 Recess room', 'G6 Stacked runs',
];
const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

/** The part fields that exist today; step 298 adds more, and the snapshot mustn't notice. */
function partsOf({ parts }) {
  return parts.map(({ key, kind, wallId, side, runId, pieceId, molding, width, number }) => ({
    key, kind, wallId, side, runId, pieceId, molding, width, number,
  }));
}

function derived(room) {
  const synced = syncRoom(room, settings);
  return {
    room: synced,
    diagnostics: roomDiagnostics(room, settings),
    parts: partsOf(partNumbers(synced, settings)),
    clearances: planClearances(synced, settings),
    walls: synced.walls.map((wall) => ({
      id: wall.id,
      faceRows: Object.fromEntries(WALL_SIDES.map((side) => [
        side, wallFaceSegments(synced, wall, side, settings),
      ])),
      sides: Object.fromEntries(WALL_SIDES.map((side) => {
        const view = resolveWall(synced, wall, side);
        return [side, {
          lower: horizontalChains(synced, view, 'lower', settings),
          upper: horizontalChains(synced, view, 'upper', settings),
          wallRow: openingChain(synced, view, settings),
          clearanceRow: openingClearances(synced, view, settings),
          runs: view.runs.map((run) => {
            const layout = layoutRun(synced, view, run, settings);
            return {
              id: run.id,
              frontDepth: frontDepth(run, settings),
              layout,
              plan: planRunPieces(synced, view, run, settings, layout,
                runFaceLayouts(synced, view, run, settings, layout)),
            };
          }),
        }];
      })),
    })),
  };
}

describe('C1 golden rooms', () => {
  it('holds the six rooms', () => {
    expect(document.rooms.map(({ name }) => name)).toEqual(NAMES);
  });

  for (const name of NAMES) {
    it(`${name} derives exactly what it did`, () => {
      const room = document.rooms.find((candidate) => candidate.name === name);
      expect(derived(room)).toMatchSnapshot();
    });
  }
});
