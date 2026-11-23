import { expect, it } from 'vitest';
import { withBuildCache } from '../buildCache.js';
import { planSolidParts } from '../planParts.js';
import { planTopEdges } from '../planTops.js';
import { syncRoom } from '../room.js';
import { goldenRooms } from './helpers/goldenRooms.js';

it.each([
  ['G1', [
    { id: 'top:0:0', kind: 'edge', closed: false,
      points: [[-34.375, -54], [-34.375, 58.375], [60, 58.375]] },
    { id: 'top:0:1', kind: 'edge', closed: true,
      points: [[8.75, -17.5], [101.75, -17.5], [101.75, 21.75], [8.75, 21.75]] },
  ]],
  ['N4', [
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
  ]],
])('draws %s butt tops with right-angle joints and mitres at angled corners (D6)', (key, expected) => {
  const loaded = goldenRooms().find((room) => room.key === key).load();
  const settings = { ...loaded.settings, woodTopCorner: 'butt' };
  const room = syncRoom(loaded.room, settings);
  const actual = withBuildCache(() => planTopEdges(room, settings,
    planSolidParts(room, settings, { bottoms: true })), room);
  expect(actual).toHaveLength(expected.length);
  actual.forEach(({ points, ...edge }, i) => {
    const { points: expectedPoints, ...expectedEdge } = expected[i];
    expect(edge).toEqual(expectedEdge);
    expect(points).toHaveLength(expectedPoints.length);
    points.forEach((point, p) => point.forEach((value, axis) => {
      expect(value).toBeCloseTo(expectedPoints[p][axis], 6);
    }));
  });
});
