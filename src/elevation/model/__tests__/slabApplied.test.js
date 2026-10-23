import { DOOR_DESIGNS } from '../doorStyles.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, findDoorDesign } from '../doorStyles.js';
import { frontStackWarnings, partSizes } from '../doorSizes.js';
import { partDetail } from '../doorDetails.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;

/** The region-free flat of a Slab - MDF Core front without moldings. */
function inset(height, sizes) {
  const result = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height, ...(sizes ? { sizes } : {}) });
  return result.molding
    ? result.opening.height
    : result;
}

describe('SPEC-46.1 slab with applied molding (P17)', () => {
  it('seeds two slab cores with applied slots', () => {
    expect(SLAB_AM).toEqual({
      id: 'slab-mdf',
      code: 'Slab - MDF Core',
      vendor: null,
      description: 'Slab, MDF core, edge banded',
      slabCore: 'mdf', panelJoint: null, defaults: { thickness: 0.75 },
      construction: 'slab',
      topRail: { shape: 'flat' },
      bottomRail: { shape: 'flat' },
      slots: ['outside', 'applied'],
    });
    expect(SLAB.slots).toEqual(['outside', 'applied']);
    expect(findDoorDesign('slab-mdf', DOOR_DESIGNS)).toBe(SLAB_AM);
  });

  it('keeps the whole part as the flat before molding placement', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height: 30 })).toEqual({
      construction: 'slab',
      slab: 'design', molding: true, designId: 'slab-mdf',
      midRails: [],
      midStiles: [],
      panels: [{ path: 'root', x: 0, z: 0, width: 15, height: 30 }], layoutWarnings: [],
      opening: { width: 15, height: 30 },
    });
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design', molding: true, designId: 'slab', midRails: [], midStiles: [], panels: [{ path: 'root', x: 0, z: 0, width: 15, height: 30 }], layoutWarnings: [], opening: { width: 15, height: 30 } });
  });

  it('keeps short-front dimensions and leaves the molding off under the cutoff', () => {
    expect([9, 8, 7, 4.8125].map((height) => inset(height))).toEqual([
      9, 8, 7, 4.8125,
    ]);
    expect(inset(4.75)).toEqual({ construction: 'slab', slab: 'design', molding: false, designId: 'slab-mdf' });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule', molding: false, designId: 'slab' });
  });

  it('ignores stile/rail sizes and makes mid rails/stiles zero-width splits', () => {
    const typed = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, {
      width: 15, height: 10, sizes: { rails: { top: 2 }, stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    });
    expect(typed).toEqual({ construction: 'slab', slab: 'design', molding: true, designId: 'slab-mdf',
      midRails: [], midStiles: [], panels: [{ path: 'root', x: 0, z: 0, width: 15, height: 10 }], layoutWarnings: [], opening: { width: 15, height: 10 } });
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { rail: 4, stile: 5 } };
    const pantry = partSizes(profiled, SLAB_AM, {
      width: 15, height: 60, sizes: { layout: { split: 'rows', children: [
        { split: 'cols', size: 30, children: [{ size: 7.5 }, {}], mids: [{ width: 2 }] },
        { split: 'cols', children: [{ size: 7.5 }, {}], mids: [{ width: 2 }] },
      ] } },
    });
    expect([pantry.midRails, pantry.midStiles]).toMatchObject([
      [{ at: 30, width: 0 }], [{ at: 7.5, width: 0 }, { at: 7.5, width: 0 }],
    ]);
  });

  it('checks slab-mdf fronts in the stacking check too', () => {
    const front = (path, z, height, design, offset = 0) => ({
      path, x: 0, z, width: 15, height,
      sizes: design.construction === 'slab'
        ? partDetail(DEFAULT_DOOR_STYLE, design, { x: 0, z, width: 15, height }, undefined, 0,
          [{ index: 0, profileId: null, offset, width: 0 }]).sizes ?? { construction: 'slab' }
        : partSizes(DEFAULT_DOOR_STYLE, design, { width: 15, height }),
    });
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB, 3), front('r.0', 8.125, 7.9375, SLAB, 1)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM, 3), front('r.0', 8.125, 7.9375, SLAB_AM, 1)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SQUARE), front('r.0', 8.125, 7.9375, SLAB_AM, 1)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM), front('r.0', 8.125, 4.5, SLAB_AM)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB), front('r.0', 8.125, 7.9375, SLAB_AM)])).toEqual([]);
  });
});
