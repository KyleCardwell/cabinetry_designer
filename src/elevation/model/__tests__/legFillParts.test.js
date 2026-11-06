import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { legPreset } from '../legs.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { shippingList } from '../../../reports/shippingList.js';
import { E, Sf, fourEndLegs, legShape, noEnds } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const R = run({ x: 10, width: 36, legs: four });

describe('SH7.2 step b leg fill parts', () => {
  it('anchor 1: inserts the placed fill after its leg in parts, numbers and badges', () => {
    const endLegs = { ...fourEndLegs, left: { ...E, fit: 'between' } };
    const W = wall({ runs: [{ ...R, legs: undefined, ends: noEnds, endLegs }] });
    const input = room({ walls: [W] });
    const parts = roomParts(input, settings).filter(({ runId }) => runId === R.id);
    expect(parts.slice(-5).map(({ key }) => key)).toEqual(['run-1:endleg:left-front', 'run-1:endleg:left-front:fill', 'run-1:endleg:left-back', 'run-1:endleg:right-front', 'run-1:endleg:right-back']);
    expect(parts.find(({ key }) => key === 'run-1:endleg:left-front:fill')).toEqual({
      key: 'run-1:endleg:left-front:fill', kind: 'leg_panel', wallId: W.id, side: 'front', runId: R.id,
      pieceId: null, molding: null, x: 10.25, z: 0, width: 0.8125, height: 34.5, source: 'leg_fill',
    });
    const numbered = partNumbers(input, settings);
    expect(numbered.byKey.get('run-1:endleg:left-front:fill')).toBe(numbered.byKey.get('run-1:endleg:left-front') + 1);
    expect(wallBadgeGroups(input, W, settings).find(({ key }) => key === `legs:${R.id}`))
      .toEqual({ key: `legs:${R.id}`, lift: 0, pieces: parts.slice(-5).map(({ key: id, x, z, width, height }) =>
        ({ id, x, z, width, height })) });

    // Invalid placements never acquire numbers or badges.
    for (const changes of [{ front: { ...Sf, shapeId: 'missing' } }, { panel: { top: 34.5 } }]) {
      const endLegs = { ...fourEndLegs, left: { ...E, fit: 'between', ...changes } };
      const w = wall({ runs: [{ ...R, legs: undefined, ends: noEnds, endLegs }] });
      const r = room({ walls: [w] });
      const fills = roomParts(r, settings).filter(({ source }) => source === 'leg_fill');
      const badges = wallBadgeGroups(r, w, settings).flatMap(({ pieces }) => pieces)
        .filter(({ id }) => id.endsWith(':fill'));
      expect(badges.map(({ id }) => id)).toEqual(fills.map(({ key }) => key));
      expect(fills).toHaveLength(0);
    }
  });

  it('step f: numbers each filler once at its face bounds, without numbering the plan return', () => {
    const endLegs = { left: { legs: 'front', front: Sf, fit: 'behind' },
      right: { legs: 'front', front: Sf } };
    const W = wall({ runs: [{ ...R, legs: undefined, ends: noEnds, endLegs }] });
    const input = room({ walls: [W] });
    expect(roomParts(input, settings).filter(({ source }) => source === 'leg_fill')).toEqual([
      { key: 'run-1:endleg:left-front:fill', kind: 'leg_filler', wallId: W.id, side: 'front', runId: R.id,
        pieceId: null, molding: null, x: 10, z: 4, width: 3.5, height: 30.5, source: 'leg_fill' },
    ]);
    const numbered = partNumbers(input, settings);
    expect(numbered.byKey.get('run-1:endleg:left-front:fill')).toBe(numbered.byKey.get('run-1:endleg:left-front') + 1);
    expect(numbered.byKey.has('run-1:endleg:left-front:fill:return')).toBe(false);
    expect(wallBadgeGroups(input, W, settings).flatMap(({ pieces }) => pieces)
      .filter(({ id }) => id === 'run-1:endleg:left-front:fill')).toEqual([
      { id: 'run-1:endleg:left-front:fill', x: 10, z: 4, width: 3.5, height: 30.5 },
    ]);
  });

  it('anchor 4: preserves parts, part numbers and shipping list without fills', () => {
    const input = room({ walls: [wall({ runs: [R] })] });
    expect({ parts: roomParts(input, settings), numbers: partNumbers(input, settings),
      shipping: shippingList(input, settings) }).toMatchSnapshot();
  });
});
