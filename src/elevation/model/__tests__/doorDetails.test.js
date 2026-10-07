import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partSizes } from '../doorSizes.js';
import { partDetail } from '../doorDetails.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const S = DEFAULT_DOOR_STYLE;
const box = (x, z, width, height) => ({ x, z, width, height });

describe('SPEC-46.2 a part\'s door detail: frame openings in wall coordinates', () => {
  it('insets a 5-piece door by its stiles and rails (G1 base door)', () => {
    expect(partDetail(S, SQUARE, box(30.0625, 4.125, 23.875, 30.125))).toEqual({
      construction: 'five_piece',
      openings: [box(33.0625, 7.125, 17.875, 24.125)],
      sizes: partSizes(S, SQUARE, { width: 23.875, height: 30.125 }),
    });
  });

  it('uses the short-face rails, and gives a slab no openings', () => {
    expect(partDetail(S, SQUARE, box(1.5625, 28.375, 19.375, 5.875)).openings)
      .toEqual([box(4.5625, 30.25, 13.375, 2.125)]);
    expect(partDetail(S, SQUARE, box(0, 0, 15, 10), { rails: { top: 2 } }).openings)
      .toEqual([box(3, 3, 9, 5)]);
    expect([
      partDetail(S, SQUARE, box(0, 0, 15, 4.75)),
      partDetail(S, SLAB, box(0, 0, 15, 30)),
      partDetail(S, SLAB_AM, box(0, 0, 15, 4.75)),
    ]).toEqual([
      { construction: 'slab', slab: 'rule', openings: [] },
      { construction: 'slab', slab: 'design', openings: [] },
      { construction: 'slab', slab: 'rule', molding: false, openings: [] },
    ]);
  });

  it('splits the opening at a mid rail, on centre from the bottom edge (G1 tall leaf)', () => {
    expect(partDetail(S, SQUARE, box(0.8125, 4.125, 14.125, 85.75), { midRails: [{ at: 42 }] }).openings).toEqual([
      box(3.8125, 7.125, 8.125, 37.5),
      box(3.8125, 47.625, 8.125, 39.25),
    ]);
  });

  it('makes a grid of mid rails and stiles, in any order, and trims a mid that lands on a rail', () => {
    const rect = box(0, 0, 30, 40);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 20 }], midStiles: [{ at: 15, width: 2 }] }).openings)
      .toEqual([box(3, 3, 11, 15.5), box(16, 3, 11, 15.5), box(3, 21.5, 11, 15.5), box(16, 21.5, 11, 15.5)]);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 30 }, { at: 10 }] }).openings)
      .toEqual([box(3, 3, 24, 5.5), box(3, 11.5, 24, 17), box(3, 31.5, 24, 5.5)]);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 2 }] }).openings).toEqual([box(3, 3.5, 24, 33.5)]);
  });

  it('gives Slab AM its molding rectangles the same way', () => {
    const molding = partDetail(S, SLAB_AM, box(0, 0, 15, 30));
    expect([molding.construction, molding.openings]).toEqual(['slab_applied', [box(3, 3, 9, 24)]]);
    expect(partDetail(S, SLAB_AM, box(0, 0, 15, 30), { midStiles: [{ at: 7.5 }] }).openings)
      .toEqual([box(3, 3, 3, 24), box(9, 3, 3, 24)]);
  });
});
