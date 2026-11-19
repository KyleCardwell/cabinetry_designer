import { expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerLap } from '../cornerLaps.js';
import { cornerReserveParts } from '../corners.js';

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
