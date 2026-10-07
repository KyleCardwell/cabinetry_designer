import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, findDoorDesign } from '../doorStyles.js';
import { frontStackWarnings, partSizes } from '../doorSizes.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;

/** Insets and molding height of a 15" wide Slab AM front, or the whole result when it isn't slab_applied. */
function inset(height, sizes) {
  const result = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height, ...(sizes ? { sizes } : {}) });
  return result.construction === 'slab_applied'
    ? [result.rails.top, result.rails.bottom, result.opening.height]
    : result;
}

describe('SPEC-46.1 slab with applied molding (P17)', () => {
  it('seeds a third design and takes the applied slot off plain slab', () => {
    expect(SLAB_AM).toEqual({
      id: 'slab-applied',
      code: 'Slab AM',
      vendor: null,
      description: 'Slab with applied molding',
      construction: 'slab_applied',
      topRail: { shape: 'flat' },
      bottomRail: { shape: 'flat' },
      slots: ['outside', 'applied'],
    });
    expect(SLAB.slots).toEqual(['outside']);
    expect(findDoorDesign('slab-applied')).toBe(SLAB_AM);
  });

  it('sets the molding in by the stile and rail widths', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height: 30 })).toEqual({
      construction: 'slab_applied',
      slab: null,
      stiles: { left: 3, right: 3 },
      rails: { top: 3, bottom: 3 },
      midRails: [],
      midStiles: [],
      opening: { width: 9, height: 24 },
      sources: { top: 'style', bottom: 'style', left: 'style', right: 'style' },
      notes: {},
    });
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design' });
  });

  it('shrinks the inset on short fronts like rails, and leaves the molding off under the cutoff', () => {
    expect([9, 8, 7, 4.8125].map((height) => inset(height))).toEqual([
      [3, 3, 3],
      [2.9375, 2.9375, 2.125],
      [2.4375, 2.4375, 2.125],
      [1.625, 1.625, 1.5625],
    ]);
    expect(inset(4.75)).toEqual({ construction: 'slab', slab: 'rule', molding: false });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule' });
  });

  it('keeps typed insets, notes and mid rails/stiles', () => {
    const typed = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, {
      width: 15, height: 10, sizes: { rails: { top: 2 }, stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    });
    expect([typed.rails, typed.stiles, typed.opening, typed.sources, typed.notes]).toEqual([
      { top: 2, bottom: 3 },
      { left: 3.5, right: 3 },
      { width: 8.5, height: 5 },
      { top: 'part', bottom: 'style', left: 'part', right: 'style' },
      { left: 'scribe' },
    ]);
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { extra: 0.625 } };
    const pantry = partSizes(profiled, SLAB_AM, {
      width: 15, height: 60, sizes: { midRails: [{ at: 30 }], midStiles: [{ at: 7.5, width: 2 }] },
    });
    expect([pantry.midRails, pantry.midStiles]).toEqual([[{ at: 30, width: 3.625 }], [{ at: 7.5, width: 2 }]]);
  });

  it('checks slab-applied fronts in the stacking check too', () => {
    const front = (path, z, height, design) => ({
      path, x: 0, z, width: 15, height, sizes: partSizes(DEFAULT_DOOR_STYLE, design, { width: 15, height }),
    });
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM), front('r.0', 8.125, 7.9375, SLAB_AM)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SQUARE), front('r.0', 8.125, 7.9375, SLAB_AM)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM), front('r.0', 8.125, 4.5, SLAB_AM)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB), front('r.0', 8.125, 7.9375, SLAB_AM)])).toEqual([]);
  });
});
