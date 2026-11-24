import { expect, it } from 'vitest';
import { bandPaths } from '../bandPaths.js';
import { syncRoom } from '../room.js';
import { outlineBounds } from '../sectionProfileOutline.js';
import { wallNumbers } from '../topology.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const ANCHORS = [
  ['G1', 1, 'front', '434f1164', 'right', 'crown', 91.5, 2, '4a087225', 152.125, 154.875, [152.125, 154.875]],
  ['N4', 2, 'front', '66903ebc', 'right', 'topMold', 90, 3, '7739abc1', 89.320806, 90.563447, [89.320806, 90.563447]],
  ['N4', 1, 'front', '72daa65d', 'left', 'countertop', 34.5, 7, 'c3dacb3a', 25.875, 0, [0, 25.875]],
  ['S3', 4, 'back', 'c3e90115', 'right', 'furnitureBase', null, 2, '0cc425d0', 59.375, 60.1875, null],
];

it.each(ANCHORS)(
  'finds the corner band neighbour for %s W%s %s run %s %s %s (D9)',
  (roomKey, wall, face, run, side, kind, z, otherWall, otherRun, x, reach, bounds) => {
    const { room: source, settings } = goldenRooms().find(({ key }) => key === roomKey).load();
    const room = syncRoom(source, settings);
    const numbers = wallNumbers(room);
    const sourceWall = room.walls.find(({ id }) => numbers.get(id) === wall);
    const runId = sourceWall.runs.find(({ id, wallSide = 'front' }) => id.startsWith(run) && wallSide === face)?.id;
    const end = [...bandPaths(room, settings).ends].find(([key]) => {
      const [id, band, height, endSide] = key.split('|');
      return id === runId && band === kind && endSide === side && (z === null || Math.abs(Number(height) - z) < 1e-6);
    })?.[1];
    const value = end?.neighbor;
    expect(value).toMatchObject({ kind: 'corner', wallId: expect.any(String), runId: expect.any(String) });
    expect(numbers.get(value.wallId)).toBe(otherWall);
    expect(value.runId.slice(0, 8)).toBe(otherRun);
    expect(value.x).toBeCloseTo(x, 3);
    expect(value.reach).toBeCloseTo(reach, 3);
    if (bounds) {
      const actual = outlineBounds(value.outline);
      expect(actual.minX).toBeCloseTo(bounds[0], 3);
      expect(actual.maxX).toBeCloseTo(bounds[1], 3);
    }
  },
);
