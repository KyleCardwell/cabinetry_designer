import { expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerLap } from '../cornerLaps.js';
import { cornerShapes } from '../cornerParts.js';
import { cornerReserveParts } from '../corners.js';
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
