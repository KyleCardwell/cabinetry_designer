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

describe('SPEC-MR4 slab applied-molding gap (MD5)', () => {
  const rect = { x: 0, z: 0, width: 24, height: 30 };
  const molding = (index, offset, width = 0) => ({ index, profileId: null, offset, width });
  const outer = (detail, offset) => detail.openings.map((opening) => {
    const { x, z, width, height } = insetRect(opening, offset);
    return { x, z, width, height };
  });
  const insetRect = (r, d) => ({ x: r.x + d, z: r.z + d, width: r.width - 2 * d, height: r.height - 2 * d });
  const rows = { layout: { split: 'rows', children: [{}, {}] } };

  it('case 1: gap between molding rectangles equals the edge flat', () => {
    const detail = partDetail(DEFAULT_DOOR_STYLE, SLAB_AM, rect, rows, 0, [molding(0, 2)]);
    expect(outer(detail, 2)).toEqual([
      { x: 2, z: 2, width: 20, height: 12 },
      { x: 2, z: 16, width: 20, height: 12 },
    ]);
    expect(detail.sizes.midRails).toMatchObject([{ at: 15, width: 2, source: 'flat', name: 'MR1' }]);
    expect(detail.sizes.panels).toMatchObject([
      { x: 2, z: 2, width: 20, height: 12 }, { x: 2, z: 16, width: 20, height: 12 },
    ]);
  });

  it('case 2: an inner molding stays parallel', () => {
    const detail = partDetail(DEFAULT_DOOR_STYLE, SLAB_AM, rect, rows, 0, [molding(0, 2), molding(1, 3)]);
    expect(outer(detail, 3).map(({ z, height }) => [z, z + height])).toEqual([[3, 13], [17, 27]]);
  });

  it('case 3: no layout is unchanged', () => {
    const detail = partDetail(DEFAULT_DOOR_STYLE, SLAB_AM, rect, undefined, 0, [molding(0, 2)]);
    expect(detail.openings).toEqual([rect]);
    expect(outer(detail, 2)).toEqual([{ x: 2, z: 2, width: 20, height: 26 }]);
  });

  it('case 4: a typed panel is the outer molding rectangle; typed mid widths are ignored', () => {
    const detail = partDetail(DEFAULT_DOOR_STYLE, SLAB_AM, rect,
      { layout: { split: 'cols', children: [{ size: 8 }, {}], mids: [{ width: 5 }] } }, 0, [molding(0, 2)]);
    expect(outer(detail, 2).map(({ x, width }) => [x, x + width])).toEqual([[2, 10], [12, 22]]);
    expect(detail.sizes.midStiles).toMatchObject([{ at: 11, width: 2 }]);
  });

  it('the short-front shift moves the gap with the shifted flat', () => {
    const front = { x: 0, z: 0, width: 24, height: 8 };
    const cols = { layout: { split: 'cols', children: [{}, {}] } };
    const detail = partDetail(DEFAULT_DOOR_STYLE, SLAB_AM, front, cols, 0, [molding(0, 2, 1)]);
    const shift = detail.sizes.shift;
    expect(shift).toBeGreaterThan(0);
    const flat = 2 - shift;
    expect(detail.moldings).toMatchObject([{ offset: flat, shifted: true }]);
    const [left, right] = outer(detail, flat);
    expect(left.x).toBeCloseTo(flat);
    expect(left.z).toBeCloseTo(flat);
    expect(right.x - (left.x + left.width)).toBeCloseTo(flat);
    expect(right.x + right.width).toBeCloseTo(24 - flat);
    expect(detail.sizes.midStiles[0].width).toBeCloseTo(flat);
  });
});
