import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { frontStackWarnings, partSizes } from '../doorSizes.js';

const [SQUARE, SLAB] = DOOR_DESIGNS;
const withRails = (width) => ({ ...DEFAULT_DOOR_STYLE, rails: { top: width, bottom: width } });

/** Rails and opening height of a 15" wide face, or 'slab'. */
function rails(height, style = DEFAULT_DOOR_STYLE, sizes) {
  const result = partSizes(style, SQUARE, { width: 15, height, ...(sizes ? { sizes } : {}) });
  return result.construction === 'slab' ? 'slab' : [result.rails.top, result.rails.bottom, result.opening.height];
}

describe('SPEC-46 stile and rail sizes', () => {
  it('shrinks 3" rails on short faces to keep a 2 1/8" panel, down to 1 5/8" rails, then slab (Kyle\'s table)', () => {
    expect([9, 8.125, 8, 7.9375, 7, 6, 5.375, 5, 4.8125, 4.75].map((height) => rails(height))).toEqual([
      [3, 3, 3],
      [3, 3, 2.125],
      [2.9375, 2.9375, 2.125],
      [2.875, 2.875, 2.1875],
      [2.4375, 2.4375, 2.125],
      [1.9375, 1.9375, 2.125],
      [1.625, 1.625, 2.125],
      [1.625, 1.625, 1.75],
      [1.625, 1.625, 1.5625],
      'slab',
    ]);
  });

  it('drops 2 3/4" rails below 7 5/8" and 2 1/2" rails below 7 1/8"', () => {
    expect([7.625, 7.5625].map((height) => rails(height, withRails(2.75))))
      .toEqual([[2.75, 2.75, 2.125], [2.6875, 2.6875, 2.1875]]);
    expect([7.125, 7.0625].map((height) => rails(height, withRails(2.5))))
      .toEqual([[2.5, 2.5, 2.125], [2.4375, 2.4375, 2.1875]]);
  });

  it('gives the whole result for a 7" drawer front, rails from the rule', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 7 })).toEqual({
      construction: 'five_piece',
      slab: null,
      stiles: { left: 3, right: 3 },
      rails: { top: 2.4375, bottom: 2.4375 },
      midRails: [],
      midStiles: [],
      opening: { width: 9, height: 2.125 },
      sources: { top: 'rule', bottom: 'rule', left: 'style', right: 'style' },
      notes: {},
    });
  });

  it('keeps typed sizes and fits the other rail around them (P13)', () => {
    const oneRail = partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 7, sizes: { rails: { top: 3 } } });
    expect([oneRail.rails, oneRail.opening.height, oneRail.sources.top, oneRail.sources.bottom])
      .toEqual([{ top: 3, bottom: 1.875 }, 2.125, 'part', 'rule']);
    const scribe = partSizes(DEFAULT_DOOR_STYLE, SQUARE, {
      width: 15, height: 30, sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    });
    expect([scribe.stiles, scribe.rails, scribe.opening, scribe.sources, scribe.notes]).toEqual([
      { left: 3.5, right: 3 },
      { top: 3, bottom: 3 },
      { width: 8.5, height: 24 },
      { top: 'style', bottom: 'style', left: 'part', right: 'style' },
      { left: 'scribe' },
    ]);
    expect(rails(6, DEFAULT_DOOR_STYLE, { rails: { top: 2.625, bottom: 2.625 } })).toEqual([2.625, 2.625, 0.75]);
  });

  it('never widens a rail narrower than the minimum', () => {
    expect([30, 5].map((height) => rails(height, withRails(1.5)))).toEqual([[1.5, 1.5, 27], [1.5, 1.5, 2]]);
    expect(partSizes(withRails(1.5), SQUARE, { width: 15, height: 5 }).sources.top).toBe('style');
  });

  it('makes slab-design parts slab at any size, and short parts slab by the rule', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design' });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule' });
  });

  it('places mid rails and stiles, outside width plus the style\'s extra unless typed (DOOR-003)', () => {
    const tall = { width: 15, height: 60 };
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { ...tall, sizes: { midRails: [{ at: 31.5 }] } }).midRails)
      .toEqual([{ at: 31.5, width: 3 }]);
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { extra: 0.625 } };
    expect(partSizes(profiled, SQUARE, { ...tall, sizes: { midRails: [{ at: 31.5 }] } }).midRails)
      .toEqual([{ at: 31.5, width: 3.625 }]);
    const typed = partSizes(DEFAULT_DOOR_STYLE, SQUARE, {
      ...tall, sizes: { midRails: [{ at: 31.5, width: 4 }], midStiles: [{ at: 7.5 }] },
    });
    expect([typed.midRails, typed.midStiles, typed.opening]).toEqual([
      [{ at: 31.5, width: 4 }], [{ at: 7.5, width: 3 }], { width: 9, height: 54 },
    ]);
  });
});

describe('SPEC-46 stacking check', () => {
  const front = (path, z, height, sizes, x = 0) => ({
    path, x, z, width: 15, height,
    sizes: partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height, ...(sizes ? { sizes } : {}) }),
  });

  it('is quiet for fronts stacking shorter above taller, equal fronts, or a taller one above', () => {
    expect(frontStackWarnings([front('r.2', 0, 9), front('r.1', 9.125, 7), front('r.0', 16.25, 5.375)])).toEqual([]);
    expect(frontStackWarnings([front('r.2', 0, 10), front('r.1', 10.125, 10), front('r.0', 20.25, 10)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 9), front('r.0', 9.125, 10)])).toEqual([]);
  });

  it('warns when rounding gives a 7 15/16" front above an 8" one the bigger panel', () => {
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 7.9375)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
  });

  it('warns when typed rails give a shorter front above the bigger panel', () => {
    expect(frontStackWarnings([front('r.1', 0, 10), front('r.0', 10.125, 9, { rails: { top: 2, bottom: 2 } })]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
  });

  it('ignores fronts side by side and slab fronts', () => {
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 7.9375, undefined, 16)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 4.5)])).toEqual([]);
  });
});
