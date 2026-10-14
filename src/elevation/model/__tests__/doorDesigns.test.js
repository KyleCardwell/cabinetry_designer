import { LEGACY_DOOR_DESIGNS } from './fixtures/legacyDoorDesigns.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesign, isDoorDesignList, migrateDoorDesign, parseDoorDesignFile, doorDesignFile } from '../doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, teamDoorStyle } from '../doorStyles.js';

const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  slabCore: null,
  panelJoint: 'curved',
  defaults: {},
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
    expect(SEEDED_DESIGN_IDS).toEqual(['five-piece-square', 'slab', 'slab-mdf']);
    expect(DESIGN_SLOTS).toEqual({
      five_piece: ['outside', 'inside', 'panel', 'applied'],
      slab: ['outside', 'applied'],
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
      isDoorDesign({ ...ARCHED, construction: 'slab', slabCore: 'mdf', panelJoint: null, slots: ['outside', 'applied'] }),
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


describe('Step 527 door design migration and shape', () => {
  it('migrates both legacy slab seeds to their new cores, slots and defaults (anchors 1–2)', () => {
    const before = structuredClone(LEGACY_DOOR_DESIGNS);
    expect(migrateDoorDesign(before[2])).toEqual(DOOR_DESIGNS[2]);
    expect(migrateDoorDesign(before[1])).toEqual(DOOR_DESIGNS[1]);
    expect(migrateDoorDesign(before[0])).toEqual(DOOR_DESIGNS[0]);
    expect(DOOR_DESIGNS[2].defaults).toEqual({ thickness: 0.75 });
    expect(DOOR_DESIGNS[1].defaults).toEqual({ thickness: 0.8125 });
    expect(before).toEqual(LEGACY_DOOR_DESIGNS);
  });

  it('preserves custom identity, rails and seed text edits; migration is idempotent (anchor 3)', () => {
    const old = { ...LEGACY_DOOR_DESIGNS[0], id: 'd1', code: '114', topRail: { shape: 'arch' } };
    const migrated = migrateDoorDesign(old);
    expect(migrated).toEqual({ ...old, slabCore: null, panelJoint: 'curved', defaults: {} });
    expect(migrated.topRail).toBe(old.topRail);
    const applied = migrateDoorDesign({ ...LEGACY_DOOR_DESIGNS[2], id: 'd2', code: 'Custom' });
    expect(applied).toMatchObject({ id: 'd2', code: 'Custom', construction: 'slab', slabCore: 'mdf', panelJoint: null, defaults: {} });
    const renamed = migrateDoorDesign({ ...LEGACY_DOOR_DESIGNS[2], code: 'Shop', description: 'Custom description' });
    expect(renamed).toMatchObject({ id: 'slab-mdf', code: 'Shop', description: 'Custom description' });
    expect(migrateDoorDesign({ ...LEGACY_DOOR_DESIGNS[1], description: 'Shop slab' }).description).toBe('Shop slab');
    for (const design of [...DOOR_DESIGNS, migrated, applied, renamed, { ...ARCHED, panelJoint: 'square', defaults: { thickness: 1 } }]) {
      expect(migrateDoorDesign(design)).toBe(design);
    }
    expect(migrateDoorDesign(null)).toBeNull();
  });

  it('validates core/joint exclusivity and strict positive design defaults (anchor 6)', () => {
    for (const design of [
      { ...ARCHED, construction: 'slab_applied' },
      { ...ARCHED, slabCore: 'mdf' },
      { ...DOOR_DESIGNS[1], slabCore: null },
      { ...DOOR_DESIGNS[1], slabCore: 'plywood' },
      { ...DOOR_DESIGNS[1], panelJoint: 'curved' },
      { ...ARCHED, panelJoint: null },
      { ...ARCHED, panelJoint: 'other' },
      ...[{ foo: 1 }, { thickness: 0 }, { thickness: -1 }, { thickness: Infinity }, { thickness: NaN }, { thickness: '1' }, null, []]
        .map((defaults) => ({ ...ARCHED, defaults })),
    ]) expect(isDoorDesign(design)).toBe(false);
    expect(isDoorDesign({ ...ARCHED, panelJoint: 'square', defaults: { thickness: 1, stileWidth: 2, panelThickness: 0.5, slabBelow: 4 } })).toBe(true);
    expect(isDoorDesignList(withDesign('slab', { slabCore: 'mdf' }))).toBe(false);
  });

  it('migrates file entries before validation and rejects unsupported envelopes', () => {
    const parsed = parseDoorDesignFile(JSON.stringify(doorDesignFile(LEGACY_DOOR_DESIGNS)));
    expect(parsed).toEqual(DOOR_DESIGNS);
    expect(isDoorDesignList(parsed)).toBe(true);
    expect(parseDoorDesignFile(JSON.stringify(doorDesignFile(DOOR_DESIGNS)))).toEqual(DOOR_DESIGNS);
    for (const text of ['{', 'null', '{}', JSON.stringify({ kind: 'door-designs', version: 2, designs: [] })]) {
      expect(parseDoorDesignFile(text)).toBeNull();
    }
  });
});
