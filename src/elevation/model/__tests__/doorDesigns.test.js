import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesign, isDoorDesignList } from '../doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, teamDoorStyle } from '../doorStyles.js';

const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
};
const withDesign = (id, patch) => DOOR_DESIGNS.map((design) => (design.id === id ? { ...design, ...patch } : design));

describe('SPEC-46.3 the team\'s door designs and default door style live in settings', () => {
  it('starts the settings with the seeded designs and the standard style, and no doorThickness', () => {
    expect(DEFAULT_SETTINGS.doorDesigns).toBe(DOOR_DESIGNS);
    expect(DEFAULT_SETTINGS.teamDoorStyle).toBe(DEFAULT_DOOR_STYLE);
    expect('doorThickness' in DEFAULT_SETTINGS).toBe(false);
    expect(SEEDED_DESIGN_IDS).toEqual(['five-piece-square', 'slab', 'slab-applied']);
    expect(DESIGN_SLOTS).toEqual({
      five_piece: ['outside', 'inside', 'panel', 'applied'],
      slab: ['outside'],
      slab_applied: ['outside', 'applied'],
    });
    expect([DOOR_DESIGNS.every((design) => isDoorDesign(design)), isDoorDesignList(DOOR_DESIGNS)]).toEqual([true, true]);
  });

  it('reads the team default style from settings', () => {
    const thick = { ...DEFAULT_DOOR_STYLE, thickness: 1 };
    expect([teamDoorStyle({ teamDoorStyle: thick }), teamDoorStyle({}), teamDoorStyle(undefined)])
      .toEqual([thick, DEFAULT_DOOR_STYLE, DEFAULT_DOOR_STYLE]);
    expect(teamDoorStyle({ teamDoorStyle: thick })).toBe(thick);
  });

  it('accepts a design with a code, an optional vendor, its construction\'s slots and known rail shapes', () => {
    expect([
      isDoorDesign(ARCHED),
      isDoorDesign({ ...ARCHED, vendor: null, description: '' }),
      isDoorDesign({ ...ARCHED, construction: 'slab_applied', slots: ['outside', 'applied'] }),
      isDoorDesign({ ...ARCHED, code: '' }),
      isDoorDesign({ ...ARCHED, code: ' 114' }),
      isDoorDesign({ ...ARCHED, vendor: '' }),
      isDoorDesign({ ...ARCHED, vendor: 'Stillwater ' }),
      isDoorDesign({ ...ARCHED, description: null }),
      isDoorDesign({ ...ARCHED, construction: 'glass' }),
      isDoorDesign({ ...ARCHED, topRail: { shape: 'round' } }),
      isDoorDesign({ ...ARCHED, bottomRail: {} }),
      isDoorDesign({ ...ARCHED, slots: ['outside'] }),
      isDoorDesign({ ...ARCHED, color: 'red' }),
      isDoorDesign({ ...ARCHED, id: '' }),
      isDoorDesign(null),
    ]).toEqual([true, true, true, false, false, false, false, false, false, false, false, false, false, false, false]);
  });

  it('accepts a list with unique ids and codes that keeps the seeded designs\' construction and rails', () => {
    expect([
      isDoorDesignList([...DOOR_DESIGNS, ARCHED]),
      isDoorDesignList(withDesign('slab', { code: 'SL', vendor: 'Shop', description: 'Flat slab' })),
      isDoorDesignList(DOOR_DESIGNS.slice(1)),
      isDoorDesignList([...DOOR_DESIGNS, { ...ARCHED, id: 'slab' }]),
      isDoorDesignList([...DOOR_DESIGNS, { ...ARCHED, code: 'slab' }]),
      isDoorDesignList(withDesign('slab', { construction: 'five_piece', slots: DESIGN_SLOTS.five_piece })),
      isDoorDesignList(withDesign('five-piece-square', { topRail: { shape: 'arch' } })),
      isDoorDesignList(undefined),
      isDoorDesignList({}),
    ]).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});
