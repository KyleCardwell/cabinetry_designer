import { expect, it } from 'vitest';
import { frontContour } from '../bandEnds.js';
import { pathNeighbors } from '../bandNeighbors.js';
import { bandPathEntries, buildBandPaths, endRule } from '../bandPaths.js';
import { cornerBandEdge } from '../cornerBands.js';
import { cornerShapes } from '../cornerParts.js';
import { whileBuildingPaths } from '../pathBuilding.js';
import { syncRoom } from '../room.js';
import { outlineBounds } from '../sectionProfileOutline.js';
import { wallNumbers } from '../topology.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const SIDES = ['left', 'right'];
const ANCHORS = [
  ['G1', 1, 'front', '434f1164', 'right', 'crown', 91.5, 2, '4a087225', 152.125, 154.875, [152.125, 154.875]],
  ['N4', 2, 'front', '66903ebc', 'right', 'topMold', 90, 3, '7739abc1', 89.320806, 90.563447, [89.320806, 90.563447]],
  ['N4', 1, 'front', '72daa65d', 'left', 'countertop', 34.5, 7, 'c3dacb3a', 25.875, 0, [0, 25.875]],
  ['S3', 4, 'back', 'c3e90115', 'right', 'furnitureBase', null, 2, '0cc425d0', 59.375, 60.1875, null],
];

it.each(goldenRooms().map(({ key, load }) => [key, load]))(
  'finds every requested corner band neighbour in %s (D9)', (roomKey, load) => {
    const { room: source, settings } = load();
    const room = syncRoom(source, settings);
    const entries = bandPathEntries(room, settings);
    const sections = entries.map((entry) => ({ ...entry, shapes: () => cornerShapes(
      room, entry.view, entry.view.side, settings, { profiles: false, returns: 'section', legBands: false },
    ) }));
    const firstPass = whileBuildingPaths(() => new Map(entries.map((entry, i) => [entry,
      Object.fromEntries(SIDES.map((side) => [side,
        endRule(room, settings, sections, sections[i], side, { profiles: false }),
      ])),
    ])));
    const neighbors = pathNeighbors(room, settings, entries, firstPass);
    const numbers = wallNumbers(room);
    const failures = [];
    const compare = (label, field, old, value) => {
      const equal = (a, b) => typeof a === 'number' ? typeof b === 'number' && Math.abs(a - b) <= 0.001
        : Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i])) : a === b;
      if (!equal(old, value)) failures.push(`${label}, ${field}: ${JSON.stringify(old)} -> ${JSON.stringify(value)}`);
    };
    const labelOf = (entry, side) => `${roomKey}, W${numbers.get(entry.view.id)} ${entry.view.side}, run ${entry.run.id}, ${side}, ${entry.kind}`;
    whileBuildingPaths(() => buildBandPaths(room, settings, { cornerLookup(shapes, run, side, kind, z, height) {
      const old = cornerBandEdge(shapes, run, side, kind, z, height);
      const entry = entries.find((entry) => entry.run === run && entry.kind === kind
        && Math.abs(entry.z - z) < 1e-6 && Math.abs(entry.height - height) < 1e-6);
      const value = neighbors.get(entry)?.[side].corner ?? null;
      const label = entry ? labelOf(entry, side) : `${roomKey}, run ${run.id}, ${side}, ${kind}`;
      compare(label, 'present', Boolean(old), Boolean(value));
      if (old && value) {
        compare(label, 'wallId', old.wallId, value.entry.view.id);
        compare(label, 'runId', old.runId, value.entry.run.id);
        for (const field of ['x', 'reach']) compare(label, field, old[field], value[field]);
        compare(label, 'outline front contour', frontContour(old.outline, side === 'left' ? 1 : -1),
          frontContour(value.outline, side === 'left' ? 1 : -1));
      }
      return old;
    } }));
    for (const [key, wall, face, run, side, kind, z, otherWall, otherRun, x, reach, bounds] of ANCHORS) {
      if (key !== roomKey) continue;
      const entry = entries.find((entry) => numbers.get(entry.view.id) === wall && entry.view.side === face
        && entry.run.id.startsWith(run) && entry.kind === kind && (z === null || Math.abs(entry.z - z) < 1e-6));
      const value = neighbors.get(entry)?.[side].corner;
      const label = `${key}, W${wall} ${face}, run ${run}, ${side}, ${kind}, anchor`;
      compare(label, 'present', true, Boolean(value));
      compare(label, 'wall', otherWall, value && numbers.get(value.entry.view.id));
      compare(label, 'run', otherRun, value?.entry.run.id.slice(0, 8));
      compare(label, 'x', x, value?.x);
      compare(label, 'reach', reach, value?.reach);
      if (bounds) {
        const actual = value?.outline && outlineBounds(value.outline);
        compare(label, 'outline x bounds', bounds, actual && [actual.minX, actual.maxX]);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  },
);
