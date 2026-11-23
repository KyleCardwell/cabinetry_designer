import { expect, it } from 'vitest';
import { bandFootprints } from '../bandFootprints.js';
import { withBuildCache } from '../buildCache.js';
import { planSolidParts } from '../planParts.js';
import { planTopEdges } from '../planTops.js';
import { syncRoom } from '../room.js';
import { goldenRooms } from './helpers/goldenRooms.js';

function edgeMismatches(room, mode, old, actual) {
  const failures = [];
  const mismatch = (id, field, before, after) => failures.push(JSON.stringify({
    room, mode, id, field, old: before ?? null, new: after ?? null,
  }));
  if (old.length !== actual.length) mismatch('all', 'length', old.length, actual.length);
  for (let i = 0; i < Math.max(old.length, actual.length); i += 1) {
    const before = old[i];
    const after = actual[i];
    if (!before || !after) {
      mismatch(before?.id ?? after?.id, 'edge', before, after);
      continue;
    }
    for (const field of ['id', 'kind', 'closed']) {
      if (before[field] !== after[field]) mismatch(before.id, field, before[field], after[field]);
    }
    if (before.points.length !== after.points.length || before.points.some((point, p) => (
      point.some((coordinate, axis) => !Number.isFinite(after.points[p]?.[axis])
        || Math.abs(coordinate - after.points[p][axis]) > 0.001)
    ))) mismatch(before.id, 'points', before.points, after.points);
  }
  return failures;
}

it('draws the same ordered top edges from path footprints in golden rooms and butt corners (D6)', () => {
  const failures = [];
  for (const { key, load } of goldenRooms()) {
    for (const variant of ['default', ...(['G1', 'S1', 'N1'].includes(key) ? ['butt'] : [])]) {
      const loaded = load();
      const settings = variant === 'butt' ? { ...loaded.settings, woodTopCorner: 'butt' } : loaded.settings;
      const room = syncRoom(loaded.room, settings);
      withBuildCache(() => {
        const solids = planSolidParts(room, settings, { bottoms: true });
        const old = planTopEdges(room, settings, solids);
        const actual = planTopEdges(room, settings, solids, { pieces: bandFootprints(room, settings) });
        failures.push(...edgeMismatches(key, settings.woodTopCorner, old, actual));
      }, room);
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

it('keeps N4 right-angle butt joints and mitres its two angled corners (D6)', () => {
  const loaded = goldenRooms().find(({ key }) => key === 'N4').load();
  const settings = { ...loaded.settings, woodTopCorner: 'butt' };
  const room = syncRoom(loaded.room, settings);
  const actual = withBuildCache(() => planTopEdges(room, settings,
    planSolidParts(room, settings, { bottoms: true }), { pieces: bandFootprints(room, settings) }), room);
  const expected = [
    // Outline and 90° joints from today's butt output.
    { id: 'top:0:0', kind: 'edge', closed: false,
      points: [[-72, 0], [-46.125, 0], [-46.125, 34.625], [-18, 34.625]] },
    { id: 'top:0:1', kind: 'edge', closed: false,
      points: [[12, 34.625], [46.125, 34.625], [46.125, -24.782224073596154],
        [35.782224073596154, -35.125], [2.5, -35.125], [2.5, -61]] },
    { id: 'top-joint:0:0', kind: 'joint', closed: false,
      points: [[-47, 60.5], [-47, 34.625], [-46.125, 34.625]] },
    { id: 'top-joint:0:1', kind: 'joint', closed: false,
      points: [[46.125, 34.625], [47, 34.625], [47, 60.5]] },
    // The two 45° joints from today's miter output; no exposed corner triangles.
    { id: 'top-joint:0:2', kind: 'joint', closed: false,
      points: [[46.125, -24.782224073596147], [72, -35.5]] },
    { id: 'top-joint:0:3', kind: 'joint', closed: false,
      points: [[46.5, -61], [35.782224073596154, -35.125]] },
  ];
  const failures = edgeMismatches('N4', 'butt', expected, actual);
  expect(failures, failures.join('\n')).toEqual([]);
});
