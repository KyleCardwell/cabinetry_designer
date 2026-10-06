import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { profileReach } from '../cornerParts.js';
import { resolveWall, syncRoom } from '../room.js';
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
