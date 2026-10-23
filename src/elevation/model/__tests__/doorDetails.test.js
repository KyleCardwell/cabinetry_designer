import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partSizes } from '../doorSizes.js';
import { partDetail, placePanelDetail } from '../doorDetails.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const S = DEFAULT_DOOR_STYLE;
const rows = (children, mids) => ({ split: 'rows', children, ...(mids ? { mids } : {}) });
const cols = (children, mids) => ({ split: 'cols', children, ...(mids ? { mids } : {}) });
const box = (x, z, width, height) => ({ x, z, width, height });

describe('SPEC-46.2 a part\'s door detail: frame openings in wall coordinates', () => {
  it('insets a 5-piece door by its stiles and rails (G1 base door)', () => {
    expect(partDetail(S, SQUARE, box(30.0625, 4.125, 23.875, 30.125))).toEqual({
      construction: 'five_piece',
      core: box(30.0625, 4.125, 23.875, 30.125),
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
      { construction: 'slab', slab: 'rule', molding: false, designId: 'slab', core: box(0, 0, 15, 4.75), openings: [] },
      { construction: 'slab', slab: 'design', molding: true, designId: 'slab', core: box(0, 0, 15, 30), openings: [box(0, 0, 15, 30)], moldings: [], sizes: { ...partSizes(S, SLAB, { width: 15, height: 30 }), shift: 0, minPanel: 2.125 } },
      { construction: 'slab', slab: 'design', molding: false, designId: 'slab-mdf', core: box(0, 0, 15, 4.75), openings: [] },
    ]);
  });

  it('splits the opening at a mid rail, on centre from the bottom edge (G1 tall leaf)', () => {
    expect(partDetail(S, SQUARE, box(0.8125, 4.125, 14.125, 85.75), { layout: rows([{ size: 37.5 }, {}]) }).openings).toEqual([
      box(3.8125, 7.125, 8.125, 37.5),
      box(3.8125, 47.625, 8.125, 39.25),
    ]);
  });

  it('makes a grid, places typed rows bottom to top and suppresses exhausted panels', () => {
    const rect = box(0, 0, 30, 40);
    expect(partDetail(S, SQUARE, rect, { layout: rows([cols([{ size: 11 }, {}], [{ width: 2 }]), cols([{ size: 11 }, {}], [{ width: 2 }])]) }).openings)
      .toEqual([box(3, 3, 11, 15.5), box(16, 3, 11, 15.5), box(3, 21.5, 11, 15.5), box(16, 21.5, 11, 15.5)]);
    expect(partDetail(S, SQUARE, rect, { layout: rows([{ size: 5.5 }, { size: 17 }, {}]) }).openings)
      .toEqual([box(3, 3, 24, 5.5), box(3, 11.5, 24, 17), box(3, 31.5, 24, 5.5)]);
    expect(partDetail(S, SQUARE, rect, { layout: rows([{}, { size: 33.5 }], [{ width: 0.5 }]) }).openings)
      .toEqual([box(3, 3.5, 24, 33.5)]);
  });

  it('splits Slab - MDF Core at zero-width centres from the true door edge', () => {
    const molding = partDetail(S, SLAB_AM, box(0, 0, 15, 30));
    expect([molding.construction, molding.openings]).toEqual(['slab', [box(0, 0, 15, 30)]]);
    expect(partDetail(S, SLAB_AM, box(0, 0, 15, 30), { layout: cols([{ size: 7.5 }, {}]) }).openings)
      .toEqual([box(0, 0, 7.5, 30), box(7.5, 0, 7.5, 30)]);
  });
});

describe('DM8 step a placing a panel detail on the wall', () => {
  const detail = {
    width: 24.875, z: 4, height: 30.5, openings: [box(3, 7, 18.875, 24.5)],
    lines: [box(1, 5, 22.875, 28.5)], miters: [{ x1: 0, z1: 4, x2: 3, z2: 7 }], openingsShown: true,
  };

  it('anchor 6: maps u through xAt and cuts to the drawn range', () => {
    expect(placePanelDetail(detail, (u) => -10 + u, [-10, 0]).openings).toEqual([box(-7, 7, 7, 24.5)]);
  });

  it('maps a right-to-left frame, keeping rectangles positive and miters clipped by x', () => {
    const placed = placePanelDetail(detail, (u) => 168 - u, [143.125, 168]);
    expect(placed.openings).toEqual([box(146.125, 7, 18.875, 24.5)]);
    expect(placed.profileLines).toEqual([box(144.125, 5, 22.875, 28.5)]);
    expect(placed.miters).toEqual([{ x1: 165, z1: 7, x2: 168, z2: 4 }]);
    expect(placePanelDetail(detail, (u) => 168 - u, [166, 168]).miters)
      .toEqual([{ x1: 166, z1: 6, x2: 168, z2: 4 }]);
  });

  it('drops hidden openings and returns null when nothing is left', () => {
    expect(placePanelDetail({ ...detail, openingsShown: false }, (u) => u, [0, 30]).openings).toEqual([]);
    expect(placePanelDetail(detail, (u) => u + 100, [0, 50])).toBeNull();
  });
});

describe('MR2b layout openings', () => {
  it('anchor 1: moves the six nested panels to wall coordinates', () => {
    const layout = rows([cols([{}, { size: 8 }, {}]), cols([{}, {}]), {}]);
    const detail = partDetail(S, SQUARE, box(100, 10, 30, 39), { layout });
    expect(detail.openings).toEqual([
      box(103, 13, 5, 9), box(111, 13, 8, 9), box(122, 13, 5, 9),
      box(103, 25, 10.5, 9), box(116.5, 25, 10.5, 9), box(103, 37, 24, 9),
    ]);
    expect(detail.sizes.layoutWarnings).toEqual([]);
  });

  it('anchor 2: splits a slab with applied molding at the full-rect center', () => {
    const detail = partDetail(S, SLAB, box(100, 10, 30, 39), { layout: rows([{}, {}]) }, 0,
      [{ index: 0, profileId: 'molding', offset: 1, width: 1 }]);
    expect(detail.openings).toEqual([box(100, 10, 30, 19.5), box(100, 29.5, 30, 19.5)]);
    expect(detail.sizes.midRails).toMatchObject([{ at: 19.5, width: 0 }]);
  });

  it('passes mirror through and offsets panels from the inset core', () => {
    const detail = partDetail(S, SQUARE, box(100, 10, 31, 40), {
      layout: cols([{ size: 5 }, {}]),
    }, 0.5, [], undefined, { mirror: true });
    expect(detail.core).toEqual(box(100.5, 10.5, 30, 39));
    expect(detail.openings).toEqual([box(122.5, 13.5, 5, 33), box(103.5, 13.5, 16, 33)]);
    expect(detail.sizes.midStiles).toMatchObject([{ at: 20.5, from: 'BR', to: 'TR', full: true }]);
  });

  it('omits exhausted panels and retains the resolver warning and mid members', () => {
    const detail = partDetail(S, SQUARE, box(100, 10, 30, 39), {
      layout: rows([{ size: 30 }, {}]),
    });
    expect(detail.openings).toEqual([box(103, 13, 24, 30)]);
    expect(detail.sizes.midRails).toHaveLength(1);
    expect(detail.sizes.layoutWarnings).toEqual([{ code: 'mid-layout-overfull', path: 'root' }]);
  });
});
