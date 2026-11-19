import { expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerLap } from '../cornerLaps.js';
import { cornerShapes } from '../cornerParts.js';
import { cornerReserveParts } from '../corners.js';
import { planSolidParts } from '../planParts.js';
import { syncRoom } from '../room.js';
import { resolveRunAnchorDatum } from '../runAnchors.js';

it.each([
  ['equal bases', 135, 24.875, 24.875, 10.3036],
  ['12-inch upper beside a 15-inch upper', 135, 12.875, 15.875, 9.5756],
  ['15-inch upper beside a 12-inch upper', 135, 15.875, 12.875, 2.3330],
  ['deep run beside a shallow one', 135, 24.875, 12.875, 0],
  ['shallow run beside a deep one', 135, 12.875, 24.875, 17.5893],
  ['90-degree corner', 90, 24.875, 24.875, 24.875],
])('meets fronts for %s (GC6.4)', (name, angle, ownDepth, neighborDepth, reserve) => {
  const cabinetTypeId = ownDepth < 20 && neighborDepth < 20 ? CABINET_TYPE_IDS.UPPER : CABINET_TYPE_IDS.BASE;
  const own = run({ id: 'own', cabinetTypeId, depth: ownDepth - 0.875, anchors: { right: true } });
  const neighbor = run({ id: 'neighbor', cabinetTypeId, depth: neighborDepth - 0.875, anchors: { left: true } });
  const angled = angle === 135;
  const first = wall({
    id: 'A', x1: 0, y1: 0, x2: 120, y2: 0, runs: [own],
    connections: { end: { wallId: 'B', endpoint: 'start' } },
  });
  const second = wall({
    id: 'B', x1: 120, y1: 0, x2: angled ? 180 : 120, y2: angled ? 60 : 120,
    runs: [neighbor],
    connections: {
      start: { wallId: 'A', endpoint: 'end' },
      end: angled ? { wallId: 'C', endpoint: 'start' } : null,
    },
  });
  const subject = room({ walls: [first, second, ...(angled ? [wall({
    id: 'C', x1: 180, y1: 60, x2: 180, y2: 180,
    connections: { start: { wallId: 'B', endpoint: 'end' } },
  })] : [])] });

  expect(cornerReserveParts(subject, first, 'right', own, DEFAULT_SETTINGS, { laps: false }).total)
    .toBeCloseTo(reserve, 3);
  if (name === 'equal bases') {
    expect(cornerLap(subject, first, own, 'right', DEFAULT_SETTINGS)).toBeNull();
  }
});

it('projects a base return onto the angled face (GC6.4)', () => {
  const subject = room({ walls: [
    wall({
      id: 'A', x1: 0, y1: 0, x2: 120, y2: 0,
      runs: [run({ id: 'base-A', width: 72, anchors: { right: true } })],
      connections: { end: { wallId: 'B', endpoint: 'start' } },
    }),
    wall({
      id: 'B', x1: 120, y1: 0, x2: 180, y2: 60,
      runs: [run({ id: 'base-B', width: 60, anchors: { left: true } })],
      connections: {
        start: { wallId: 'A', endpoint: 'end' },
        end: { wallId: 'C', endpoint: 'start' },
      },
    }),
    wall({
      id: 'C', x1: 180, y1: 60, x2: 180, y2: 180,
      connections: { start: { wallId: 'B', endpoint: 'end' } },
    }),
  ] });
  // Place at the exact anchor datums so shop-grid rounding doesn't obscure the projection.
  for (const [index, end] of [[0, 'right'], [1, 'left']]) {
    const currentWall = subject.walls[index];
    const currentRun = currentWall.runs[0];
    const { x } = resolveRunAnchorDatum(subject, currentWall, currentRun, end, DEFAULT_SETTINGS);
    currentRun.x = end === 'left' ? x : x - currentRun.width;
  }
  const shape = cornerShapes(subject, subject.walls[1], 'front', DEFAULT_SETTINGS, { returns: 'section' })
    .find(({ key }) => key === 'left:A:base-A');
  const body = shape.parts.filter(({ kind }) => kind === 'section');

  expect(Math.min(...body.map(({ x }) => x))).toBeCloseTo(0, 3);
  expect(Math.max(...body.map(({ x, width }) => x + width))).toBeCloseTo(10.3036, 3);
});

it('joins angled flex filler faces on one miter edge through the front meeting point (GC6.4)', () => {
  const subject = syncRoom(room({ walls: [
    wall({
      id: 'A', x1: 0, y1: 0, x2: 120, y2: 0,
      runs: [run({ id: 'base-A', width: 72, anchors: { right: true } })],
      connections: { end: { wallId: 'B', endpoint: 'start' } },
    }),
    wall({
      id: 'B', x1: 120, y1: 0, x2: 180, y2: 60,
      runs: [run({ id: 'base-B', width: 60, anchors: { left: true } })],
      connections: {
        start: { wallId: 'A', endpoint: 'end' },
        end: { wallId: 'C', endpoint: 'start' },
      },
    }),
    wall({
      id: 'C', x1: 180, y1: 60, x2: 180, y2: 180,
      connections: { start: { wallId: 'B', endpoint: 'end' } },
    }),
  ] }), DEFAULT_SETTINGS);
  const parts = planSolidParts(subject, DEFAULT_SETTINGS);
  const polygons = ['base-A:right', 'base-B:left'].map((id) => parts.find((part) => part.id === id).points);
  const meeting = [120 - 24.875 * (Math.SQRT2 - 1), -24.875];
  const back = [120 - (24.875 - DEFAULT_SETTINGS.fillerThickness) * (Math.SQRT2 - 1),
    -24.875 + DEFAULT_SETTINGS.fillerThickness];
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8;
  const sharedEdge = (polygon) => polygon.some((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return (same(p, meeting) && same(q, back)) || (same(p, back) && same(q, meeting));
  });
  for (const polygon of polygons) expect(sharedEdge(polygon)).toBe(true);

  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const signedArea = (polygon) => polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
  // Intersect the two convex faces independently of the model's miter construction.
  let intersection = polygons[0];
  const clip = polygons[1];
  const winding = Math.sign(signedArea(clip));
  clip.forEach((a, i) => {
    const b = clip[(i + 1) % clip.length];
    intersection = intersection.flatMap((p, j, input) => {
      const q = input[(j + 1) % input.length];
      const sp = winding * cross(a, b, p);
      const sq = winding * cross(a, b, q);
      const points = sp >= -1e-9 ? [p] : [];
      if ((sp > 1e-9 && sq < -1e-9) || (sp < -1e-9 && sq > 1e-9)) {
        const t = sp / (sp - sq);
        points.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
      return points;
    });
  });
  for (const polygon of polygons) expect(Math.abs(signedArea(polygon))).toBeGreaterThan(0.1);
  expect(Math.abs(signedArea(intersection))).toBeLessThan(1e-8);
});
