import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { frontStackWarnings, midDefaults, partSizes } from '../doorSizes.js';
import { doorProfileOffsets } from '../doorProfileLines.js';

const [SQUARE, SLAB] = DOOR_DESIGNS;
const rows = (children, mids) => ({ split: 'rows', children, ...(mids ? { mids } : {}) });
const cols = (children, mids) => ({ split: 'cols', children, ...(mids ? { mids } : {}) });
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
      panels: [{ path: 'root', x: 3, z: 2.4375, width: 9, height: 2.125 }],
      layoutWarnings: [],
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
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design', molding: true, designId: 'slab', midRails: [], midStiles: [], panels: [{ path: 'root', x: 0, z: 0, width: 15, height: 30 }], layoutWarnings: [], opening: { width: 15, height: 30 } });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule', molding: false, designId: 'slab' });
  });

  it('uses style mid defaults or square widths without offsets, unless typed', () => {
    const tall = { width: 15, height: 60 };
    const base = rows([{ size: 27 }, {}]);
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { ...tall, sizes: { layout: base } }).midRails)
      .toMatchObject([{ at: 31.5, width: 3, source: 'flat', name: 'MR1', full: true }]);
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { rail: 3.625, stile: 4 } };
    const layout = rows([{ size: 26.6875 }, {}]);
    expect(partSizes(profiled, SQUARE, { ...tall, sizes: { layout } }).midRails)
      .toMatchObject([{ at: 31.5, width: 3.625, source: 'style' }]);
    expect(midDefaults(profiled, SQUARE)).toEqual({ rail: 3.625, stile: 4, lap: 0, over: 0 });
    const columns = cols([{ size: 3 }, {}]);
    const typed = partSizes(DEFAULT_DOOR_STYLE, SQUARE, {
      ...tall, sizes: { layout: rows([{ ...columns, size: 26.5 }, columns], [{ width: 4 }]) },
    });
    expect(typed.midRails).toMatchObject([{ at: 31.5, width: 4, source: 'part' }]);
    expect(typed.midStiles).toMatchObject([
      { at: 7.5, width: 3, source: 'flat' }, { at: 7.5, width: 3, source: 'flat' },
    ]);
    expect(typed.opening).toEqual({ width: 9, height: 54 });
  });
});

describe('MR1b mids keep the flat', () => {
  const profile = (id, kind, minX, maxX) => ({
    id, kind, name: id,
    geometry: {
      units: 'in', points: { a: [minX, 0], b: [maxX, -0.125] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }],
    },
  });
  const resolve = ({ inside, applied, style: patch, sizes, stileWidth, height = 30 }) => {
    const style = {
      ...DEFAULT_DOOR_STYLE,
      profiles: { inside: inside == null ? null : 'inside', outside: 'outside', panel: 'panel' },
      // Empty picks must not contribute lap or over, even with a large offset.
      appliedMoldings: [{ profileId: null, offset: -20 }, { profileId: null, offset: 20 },
        ...(applied ? [{ profileId: 'applied', offset: applied.offset ?? 0 }] : [])],
      ...patch,
    };
    const profiles = [profile('outside', 'door_outside', -10, 10), profile('panel', 'door_panel', -10, 10),
      ...(inside == null ? [] : [profile('inside', 'door_inside', inside, 0)]),
      ...(applied ? [profile('applied', 'applied_molding', -0.25, 0.5)] : [])];
    const mid = midDefaults(style, SQUARE, doorProfileOffsets(style, SQUARE, profiles));
    const columns = cols(height < 30 ? [{}, {}] : [
      { size: 12 - (sizes?.stiles?.left ?? style.stiles.left) - (stileWidth ?? mid.stile) / 2 }, {},
    ], stileWidth == null ? undefined : [{ width: stileWidth }]);
    const layout = rows([{ ...columns, ...(height < 30 ? {} : { size: 12 - mid.rail / 2 }) }, columns]);
    const result = partSizes(style, SQUARE, {
      width: 24, height, sizes: { layout, ...sizes },
    }, mid);
    return { mid, result };
  };

  it.each([
    [1, {}, { rail: 3, stile: 3, lap: 0, over: 0 }, { width: 3, source: 'flat' }],
    [2, { inside: -0.625 }, { rail: 3.625, stile: 3.625, lap: 0.625, over: 0 }, { width: 3.625, source: 'flat' }],
    [3, { inside: -0.375, style: { stiles: { left: 2.5, right: 2.5 } } },
      { rail: 3.375, stile: 2.875, lap: 0.375, over: 0 }, { width: 2.875, source: 'flat' }],
    [4, { applied: {} }, { rail: 3.25, stile: 3.25, lap: 0.25, over: 0.5 }, { width: 3.25, source: 'flat', overall: 4.25 }],
    [5, { applied: {}, style: { mid: { stile: 4 } } },
      { rail: 3.25, stile: 4, lap: 0.25, over: 0.5 }, { width: 4, source: 'style', overall: 5 }],
    [6, { inside: -0.625, stileWidth: 3.5 },
      { rail: 3.625, stile: 3.625, lap: 0.625, over: 0 }, { width: 3.5, source: 'part' }],
    [7, { inside: -0.625, sizes: { stiles: { left: 3.5 } } },
      { rail: 3.625, stile: 3.625, lap: 0.625, over: 0 }, { width: 3.625, source: 'flat' }],
    [8, { inside: -0.375, applied: { offset: -0.125 } },
      { rail: 3.375, stile: 3.375, lap: 0.375, over: 0.375 }, { width: 3.375, source: 'flat', overall: 4.125 }],
  ])('anchor %s', (number, input, defaults, stile) => {
    const { mid, result } = resolve(input);
    expect(mid).toEqual(defaults);
    expect(result.midStiles).toMatchObject([{ at: 12, ...stile }, { at: 12, ...stile }]);
    expect(result.midRails).toMatchObject([{ at: 15, width: defaults.rail, source: 'flat',
      ...(defaults.over > 0 ? { overall: defaults.rail + 2 * defaults.over } : {}) }]);
    // Short-face and typed outer rails must not change the mid defaults.
    const short = resolve({ ...input, height: 7, sizes: { ...input.sizes, rails: { top: 2 } } });
    const widths = (mids) => mids.map(({ width, source, overall }) => ({ width, source, overall }));
    expect(widths(short.result.midRails)).toEqual(widths(result.midRails));
    expect(widths(short.result.midStiles)).toEqual(widths(result.midStiles));
    if (number === 8) {
      const typed = resolve({ ...input, stileWidth: 3.5 });
      expect(typed.result.midStiles).toMatchObject([
        { at: 12, width: 3.5, source: 'part', overall: 4.25 },
        { at: 12, width: 3.5, source: 'part', overall: 4.25 },
      ]);
    }
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
