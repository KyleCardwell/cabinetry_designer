import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { doorDesignUses, newDoorDesign } from '../doorDesigns.js';
import { pickOptions } from '../doorStyleEdits.js';
import { resolveDoorStyle } from '../doorStyleResolve.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';

const S = DEFAULT_SETTINGS;
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
const WITH_114 = { ...S, doorDesigns: [...DOOR_DESIGNS, ARCHED] };
const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', designId: 'd-114' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', designId: 'slab' };
const C = { ...A, id: 'ds-c', label: 'C' };

describe('SPEC-46.3 door designs from the team library', () => {
  it('copies a design with a fresh id and the next free code', () => {
    expect(newDoorDesign(DOOR_DESIGNS, DOOR_DESIGNS[0], 'd-1')).toEqual({ ...DOOR_DESIGNS[0], id: 'd-1', code: '5PC copy' });
    const copied = [
      ...DOOR_DESIGNS,
      { ...DOOR_DESIGNS[0], id: 'd-1', code: '5PC copy' },
      { ...DOOR_DESIGNS[0], id: 'd-2', code: '5pc COPY 2' },
    ];
    expect(newDoorDesign(copied, DOOR_DESIGNS[0], 'd-3').code).toBe('5PC copy 3');
    const copy = newDoorDesign(DOOR_DESIGNS, ARCHED, 'd-4');
    expect([copy.code, copy.topRail, copy.topRail === ARCHED.topRail]).toEqual(['114 copy', { shape: 'arch' }, false]);
  });

  it('lists where a design is used: the team default first, then each room\'s styles', () => {
    const rooms = [{ id: 'r1', doorStyles: [A, B] }, { id: 'r2' }, { id: 'r3', doorStyles: [C] }];
    expect(doorDesignUses(WITH_114, rooms, 'd-114')).toEqual([
      { level: 'room', roomId: 'r1', styleId: 'ds-a', label: 'A' },
      { level: 'room', roomId: 'r3', styleId: 'ds-c', label: 'C' },
    ]);
    const slabTeam = { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'slab' } };
    expect(doorDesignUses(slabTeam, rooms, 'slab')).toEqual([
      { level: 'team' },
      { level: 'room', roomId: 'r1', styleId: 'ds-b', label: 'B' },
    ]);
    expect(doorDesignUses(S, rooms, 'five-piece-square')).toEqual([{ level: 'team' }]);
    expect(doorDesignUses(S, rooms, 'slab-applied')).toEqual([]);
  });

  it('resolves a style\'s design from the team\'s designs', () => {
    const levels = [{ level: 'room', node: { doorStyleId: 'ds-a' } }];
    expect(resolveDoorStyle({ doorStyles: [A] }, WITH_114, 'door', levels).design).toBe(ARCHED);
    const missing = resolveDoorStyle({ doorStyles: [A] }, S, 'door', levels);
    expect([missing.design.id, missing.warnings]).toEqual(['five-piece-square', [{ code: 'door-design-missing', id: 'd-114' }]]);
    const team = resolveDoorStyle({}, { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'd-114' } }, 'door', []);
    expect([team.style.id, team.design.code, team.source]).toEqual(['default', '114', { level: 'team', key: null }]);
  });

  it('names the team default\'s own design in the style pickers', () => {
    const settings = { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'd-114', thickness: 1 } };
    expect(pickOptions({ doorStyles: [A, B] }, settings, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 114 · 1")' },
      options: [
        { id: 'default', text: 'Team default (Std · 114 · 1")' },
        { id: 'ds-a', text: 'A · 114 · 13/16"' },
        { id: 'ds-b', text: 'B · Slab · 13/16"' },
      ],
    });
  });
});
