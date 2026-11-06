import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { legPreset } from '../legs.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { shippingList } from '../../../reports/shippingList.js';
import { legShape } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const R = run({ x: 10, width: 36, legs: four });

describe('SH7.2 step b leg fill parts', () => {
  it('anchor 1: inserts the placed fill after its leg in parts, numbers and badges', () => {
    const legs = four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel' } } : leg).reverse();
    const W = wall({ runs: [{ ...R, legs }] });
    const input = room({ walls: [W] });
    const parts = roomParts(input, settings).filter(({ runId }) => runId === R.id);
    expect(parts.slice(-5).map(({ key }) => key)).toEqual(['LF', 'LF:fill', 'LB', 'RF', 'RB']);
    expect(parts.find(({ key }) => key === 'LF:fill')).toEqual({
      key: 'LF:fill', kind: 'leg_panel', wallId: W.id, side: 'front', runId: R.id,
      pieceId: null, molding: null, x: 10.25, z: 0, width: 0.8125, height: 34.5, source: 'leg_fill',
    });
    const numbered = partNumbers(input, settings);
    expect(numbered.byKey.get('LF:fill')).toBe(numbered.byKey.get('LF') + 1);
    expect(wallBadgeGroups(input, W, settings).find(({ key }) => key === `legs:${R.id}`))
      .toEqual({ key: `legs:${R.id}`, lift: 0, pieces: parts.slice(-5).map(({ key: id, x, z, width, height }) =>
        ({ id, x, z, width, height })) });

    // Suppressed shared fills and invalid placements never acquire numbers or badges.
    for (const [changes, sharedGap, count] of [[{}, true, 1], [{ shapeId: 'missing' }, false, 0],
      [{ fill: { type: 'panel', top: 34.5 } }, false, 0]]) {
      const shared = four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel' }, ...changes }
        : i === 1 && sharedGap ? { ...leg, fill: { type: 'panel' } } : leg);
      const w = wall({ runs: [{ ...R, legs: shared }] });
      const r = room({ walls: [w] });
      const fills = roomParts(r, settings).filter(({ source }) => source === 'leg_fill');
      const badges = wallBadgeGroups(r, w, settings).flatMap(({ pieces }) => pieces)
        .filter(({ id }) => id.endsWith(':fill'));
      expect(badges.map(({ id }) => id)).toEqual(fills.map(({ key }) => key));
      expect(fills).toHaveLength(count);
    }
  });

  it('anchor 4: preserves parts, part numbers and shipping list without fills', () => {
    const input = room({ walls: [wall({ runs: [R] })] });
    expect({ parts: roomParts(input, settings), numbers: partNumbers(input, settings),
      shipping: shippingList(input, settings) }).toMatchSnapshot();
  });
});
