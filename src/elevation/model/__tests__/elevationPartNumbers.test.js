import { describe, expect, it } from 'vitest';
import { dxfMoldingBadges, layoutDxfBadges } from '../elevationPartNumbers.js';

const piece = { id: 'a', x: 0, z: 4, width: 30, height: 30.5 };
const numbers = new Map([['a', 1], ['b', 2], ['t', 4], ['f', 5]]);
const options = { lift: 0, plotScale: 24 };
const molding = { key: 'toeKick', x: 3, z: 0, width: 24, height: 4, slot: 0, label: 'TK', number: 7 };

describe('SPEC-50.13 step 517 DXF part badges', () => {
  it('anchor 1: rests at the piece centre', () => {
    expect(layoutDxfBadges([piece], numbers, options)).toEqual([
      { key: 'a', text: '1', x: 15, z: 19.25, width: 6, height: 4.5, leader: null },
    ]);
  });

  it('anchor 2: lifts a narrow filler one level and leads to its centre', () => {
    const filler = { ...piece, id: 'b', x: 30, width: 3 };
    expect(layoutDxfBadges([piece, filler], numbers, options)[1]).toEqual({
      key: 'b', text: '2', x: 31.5, z: 25.25, width: 6, height: 4.5,
      leader: { x1: 31.5, z1: 23, x2: 31.5, z2: 19.25 },
    });
  });

  it('anchor 3: lifts the T group even when the badge fits', () => {
    expect(layoutDxfBadges([{ ...piece, id: 't', z: 0, height: 30 }], numbers, {
      ...options, lift: 1,
    })[0]).toEqual({
      key: 't', text: '4', x: 15, z: 21, width: 6, height: 4.5,
      leader: { x1: 15, z1: 18.75, x2: 15, z2: 15 },
    });
  });

  it('anchor 4: places a frame two steps above its anchor', () => {
    expect(layoutDxfBadges([{
      ...piece, id: 'f', width: 60, anchor: { x: 45, z: 34.5 },
    }], numbers, { ...options, lift: 2 })[0]).toEqual({
      key: 'f', text: '5', x: 45, z: 46.5, width: 6, height: 4.5,
      leader: { x1: 45, z1: 44.25, x2: 45, z2: 34.5 },
    });
  });

  it('anchor 5: widens a three-character badge', () => {
    const badge = layoutDxfBadges([piece], new Map([['a', 105]]), options)[0];
    expect(badge.text).toBe('105');
    expect(badge.width).toBeCloseTo(7.8);
  });

  it('anchor 6: centres the labeled toe kick badge in its band', () => {
    const badge = dxfMoldingBadges([molding], 24)[0];
    expect(badge).toEqual({
      key: 'toeKick', text: 'TK 7', x: 15, z: 2, width: expect.closeTo(9.6), height: 4.5, leader: null,
    });
  });

  it('anchor 7: separates molding slots by badge width plus gap', () => {
    expect(dxfMoldingBadges([{ ...molding, slot: 1 }], 24)[0].x).toBeCloseTo(26.1);
    expect(dxfMoldingBadges([{ ...molding, slot: -1 }], 24)[0].x).toBeCloseTo(3.9);
  });

  it('anchor 8: scales badge dimensions without moving a resting centre', () => {
    expect(layoutDxfBadges([piece], numbers, { ...options, plotScale: 48 })[0]).toEqual({
      key: 'a', text: '1', x: 15, z: 19.25, width: 12, height: 9, leader: null,
    });
  });

  it('skips unnumbered pieces and obeys fit margins, available levels and collision gaps', () => {
    expect(layoutDxfBadges([], numbers, options)).toEqual([]);
    expect(layoutDxfBadges([{ ...piece, id: 'missing' }], numbers, options)).toEqual([]);
    // Exactly 6 + 1.5 inches fits; a slightly narrower part must lift.
    expect(layoutDxfBadges([{ ...piece, width: 7.5 }], numbers, options)[0].leader).toBeNull();
    expect(layoutDxfBadges([{ ...piece, width: 7.49 }], numbers, options)[0].z).toBe(25.25);
    expect(layoutDxfBadges([{ ...piece, width: 3, height: 6 }], numbers, options)[0].leader).toBeNull();
    const small = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), x: i * 3, z: 0, width: 3, height: 60,
    }));
    const numbered = new Map(small.map(({ id }) => [id, 1]));
    expect(layoutDxfBadges(small, numbered, options).map(({ z }) => z)).toEqual([36, 42, 48, 36, 42]);
    // A 7.5-inch separation lets the next badge share level one.
    expect(layoutDxfBadges([small[0], { ...small[1], x: 7.5 }], numbered, options)
      .map(({ z }) => z)).toEqual([36, 36]);
    // An anchor always takes two steps, regardless of the group's lift or available levels.
    expect(layoutDxfBadges([{
      ...piece, width: 3, height: 6, anchor: { x: 0, z: 0 },
    }], numbers, { ...options, lift: 3 })[0]).toMatchObject({ x: 0, z: 12 });
  });
});
