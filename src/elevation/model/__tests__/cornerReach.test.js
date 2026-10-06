import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { profileReach } from '../cornerParts.js';
import { horizontalChains } from '../dimensions.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallExtent } from '../wallExtent.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const reachOf = (synced, wallIndex, side = 'front') => profileReach(synced, synced.walls[wallIndex], side, settings);

const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';
const BACK_RUN = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

describe('SPEC-43.4 corner reach from cornerShapes', () => {
  it('gives each profile\'s box-and-faces span past the wall end, with its run\'s type (G2 elevation A)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(reachOf(g2, 0)).toEqual([{
      key: `${PENINSULA}:back:${BACK_RUN}:right`,
      wallId: PENINSULA,
      runId: BACK_RUN,
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      x: 172,
      width: 24,
    }]);
    // The same face resolved first gives the same reach.
    expect(profileReach(g2, resolveWall(g2, g2.walls[0], 'front'), 'front', settings)).toEqual(reachOf(g2, 0));
  });

  it('reaches no run in a neighbour\'s recess and no corner return (G5, G1)', () => {
    const g5 = room('G5 Recess room');
    expect([0, 1, 2].map((index) => reachOf(g5, index))).toEqual([[], [], []]);
    const g1 = room('G1 Euro kitchen');
    expect([0, 1, 2].map((index) => reachOf(g1, index))).toEqual([[], [], []]);
  });
});

describe('SPEC-43.4 reach dimensions from cornerShapes', () => {
  it('dimensions a profile\'s reach past the wall end, and never a recess run\'s (G2 A, G5)', () => {
    const g2 = room('G2 Face frame kitchen');
    const lower = horizontalChains(g2, resolveWall(g2, g2.walls[0], 'front'), 'lower', settings);
    const reach = { start: 172, end: 196, kind: 'neighbor', wallId: PENINSULA, neighborRunId: BACK_RUN };
    expect(lower.inner.at(-1)).toEqual(reach);
    expect(lower.outer.at(-1)).toEqual(reach);
    const g5 = room('G5 Recess room');
    for (const index of [0, 2]) {
      const chains = horizontalChains(g5, resolveWall(g5, g5.walls[index], 'front'), 'lower', settings);
      expect(chains).toEqual({ inner: [], outer: [{ start: 0, end: 30, kind: 'wall' }] });
    }
  });
});

describe('SPEC-43.4 the extent takes in everything cornerShapes draws', () => {
  it('reaches a profile\'s countertop and a return above a low wall; drops a recess run (G2, G5)', () => {
    const g2 = room('G2 Face frame kitchen');
    const extentOf = (synced, wallIndex, side) => wallExtent(
      synced, resolveWall(synced, synced.walls[wallIndex], side), settings,
    );
    // The peninsula's back run in profile: box to 196, countertop 3/4" past it.
    expect(extentOf(g2, 0, 'front')).toEqual({ left: 0, right: 196.75, top: 96, bottom: 0 });
    // Wall A's upper returns into the 36" peninsula's corner, up to its crown at 96".
    expect(extentOf(g2, 1, 'front')).toEqual({ left: 0, right: 78.5, top: 96, bottom: 0 });
    expect(extentOf(g2, 1, 'back')).toEqual({ left: 0, right: 78.5, top: 36, bottom: 0 });
    const g5 = room('G5 Recess room');
    expect(extentOf(g5, 2, 'front')).toEqual({ left: 0, right: 30, top: 96, bottom: 0 });
  });

  it('moves the DXF\'s rows and columns out with it (G2 A right edge, the peninsula\'s row above)', () => {
    const g2 = room('G2 Face frame kitchen');
    const right = elevationDimensions(g2, g2.walls[0], 'front', settings)
      .filter(({ row: name }) => name.startsWith('right.'));
    expect([...new Set(right.map(({ row: name, base, at }) => `${name} ${base} ${at}`))]).toEqual([
      'right.inner 196.75 205.75', 'right.middle 196.75 222.25', 'right.outer 196.75 231.25',
    ]);
    expect(elevationDimensions(g2, g2.walls[1], 'front', settings)
      .filter(({ row: name }) => name.startsWith('upper.'))
      .map(({ row: name, kind, start, end, base, at }) => [name, kind, start, end, base, at]))
      .toEqual([['upper.outer', 'wall', 0, 78.5, 96, 105]]);
  });
});
