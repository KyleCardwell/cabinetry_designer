import { describe, expect, it } from 'vitest';
import { bandPaths } from '../bandPaths.js';
import { sweepBand, viewFromWall } from '../bandSweep.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { syncRoom } from '../roomSync.js';
import { wallNumbers } from '../topology.js';
import { wallSideView } from '../wallSides.js';
import { goldenRooms } from './helpers/goldenRooms.js';

describe('band sweep wall views', () => {
  it('covers profiled crowns and plain toe kicks with conservative hiding strips (D2)', () => {
    const loaded = goldenRooms().find(({ key }) => key === 'N4').load();
    const { settings } = loaded;
    const room = syncRoom(loaded.room, settings);
    const numbers = wallNumbers(room);
    const wall = room.walls.find(({ id }) => numbers.get(id) === 1);
    const runs = wallSideView(wall, 'front').runs.toSorted((a, b) => a.x - b.x);
    const r1 = runs.filter(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.UPPER)[1];
    const base2 = runs.filter(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE)[1];
    const { paths } = bandPaths(room, settings);
    const crownPath = paths.find((path) => path.kind === 'crown'
      && path.segments.some(({ runId }) => runId === r1.id));
    const crown = viewFromWall(room, sweepBand(room, crownPath, settings), wall, 'front');
    expect(crownPath.segments[0].front).toBe(16 + 5 / 8);
    expect(crown.strips.length).toBeGreaterThan(1);
    expect(crown.strips[0].z1).toBe(crown.z);
    expect(crown.strips.at(-1).z2).toBe(crown.z + crown.height);
    crown.strips.forEach((strip, index) => {
      expect(strip.z2).toBeGreaterThan(strip.z1);
      expect(strip.front).toBeLessThanOrEqual(16 + 5 / 8);
      if (index) expect(strip.z1).toBe(crown.strips[index - 1].z2);
    });
    expect(crown.strips.at(-1).front).toBe(Math.max(...crown.strips.map(({ front }) => front)));
    expect(crown.strips.at(-1).front).toBeGreaterThan(crown.strips[0].front);
    const toePath = paths.find((path) => path.kind === 'toeKick'
      && path.segments.some(({ runId }) => runId === base2.id));
    // This toe-kick path turns onto other walls; isolate its straight segment for D2's wall view.
    const straightToe = { ...toePath,
      segments: toePath.segments.filter(({ runId }) => runId === base2.id), vertices: [],
      end: { type: 'square', runId: base2.id, side: 'right' },
    };
    const toe = viewFromWall(room, sweepBand(room, straightToe, settings), wall, 'front');
    expect(toe.strips).toEqual([{ z1: toe.z, z2: toe.z + toe.height, front: 21 }]);
  });
});
