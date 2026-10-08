import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import elevationReducer, {
  addDoorDesign, addDoorStyle, deleteDoorDesign, setTeamDoorStyle, updateDoorDesign, updateDoorStyle,
} from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const designs = (state) => state.settings.doorDesigns.map(({ id, code }) => [id, code]);
const SEEDED = [['five-piece-square', '5PC'], ['slab', 'Slab'], ['slab-applied', 'Slab AM']];
const ARCHED = {
  id: 'ignored',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: [],
};

/** A base run with one cabinet; `doorStyleId` is the room's pick (it may name a style added later). */
function base(doorStyleId) {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  if (doorStyleId) state.rooms[0].doorStyleId = doorStyleId;
  return state;
}

describe('SPEC-46.3 editing the team library', () => {
  it('adds a copy of a design, or of the first, with the next free code', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }), addDoorDesign({ id: 'd-2', baseId: 'slab' }));
    expect(designs(state)).toEqual([...SEEDED, ['d-1', '5PC copy'], ['d-2', 'Slab copy']]);
    expect(apply(state, addDoorDesign({ id: 'd-3', baseId: 'gone' }))).toBe(state);
    expect(addDoorDesign().payload.id).toEqual(expect.any(String));
    expect(DOOR_DESIGNS).toHaveLength(3);
  });

  it('saves an edited design with its construction\'s slots; a seeded design keeps its construction and rails', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }));
    const saved = apply(state, updateDoorDesign({ designId: 'd-1', design: ARCHED }));
    expect(saved.settings.doorDesigns[3]).toEqual({ ...ARCHED, id: 'd-1', slots: ['outside', 'inside', 'panel', 'applied'] });
    const applied = apply(saved, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, construction: 'slab_applied' } }));
    expect(applied.settings.doorDesigns[3].slots).toEqual(['outside', 'applied']);
    const renamed = apply(state, updateDoorDesign({ designId: 'slab', design: { ...DOOR_DESIGNS[1], code: 'SL', vendor: 'Shop' } }));
    expect(renamed.settings.doorDesigns[1]).toEqual({ ...DOOR_DESIGNS[1], code: 'SL', vendor: 'Shop' });
    expect([
      apply(state, updateDoorDesign({ designId: 'slab', design: { ...DOOR_DESIGNS[1], construction: 'five_piece' } })),
      apply(state, updateDoorDesign({ designId: 'five-piece-square', design: { ...DOOR_DESIGNS[0], topRail: { shape: 'arch' } } })),
      apply(state, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, code: 'slab' } })),
      apply(state, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, code: '' } })),
      apply(state, updateDoorDesign({ designId: 'gone', design: ARCHED })),
    ].every((next) => next === state)).toBe(true);
  });

  it('saves the team default style as "default" / Std and re-syncs every room', () => {
    const picked = apply(base('ds-1'), addDoorStyle({ id: 'ds-1' }));
    const thick = apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, id: 'x', label: 'Z', thickness: 1 } }));
    expect(thick.settings.teamDoorStyle).toEqual({ ...DEFAULT_DOOR_STYLE, thickness: 1 });
    expect(currentRun(thick)._doorThickness).toBe(0.8125);
    expect(apply(thick, addDoorStyle({ id: 'ds-2' })).rooms[0].doorStyles[1].thickness).toBe(1);
    expect([
      apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, thickness: 0 } })),
      apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, designId: 'gone' } })),
    ].every((next) => next === picked)).toBe(true);
    expect(DEFAULT_DOOR_STYLE.thickness).toBe(0.8125);
  });

  it('deletes an unused design; a used one moves its styles to another design first', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }), addDoorStyle({ id: 'ds-1' }));
    const used = apply(
      state,
      updateDoorStyle({ styleId: 'ds-1', style: { ...state.rooms[0].doorStyles[0], designId: 'd-1' } }),
      setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, designId: 'd-1' } }),
    );
    expect([used.settings.teamDoorStyle.designId, used.rooms[0].doorStyles[0].designId]).toEqual(['d-1', 'd-1']);
    expect([
      apply(used, deleteDoorDesign({ designId: 'd-1' })),
      apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'd-1' })),
      apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'gone' })),
    ].every((next) => next === used)).toBe(true);
    const moved = apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'slab' }));
    expect([designs(moved), moved.settings.teamDoorStyle.designId, moved.rooms[0].doorStyles[0].designId])
      .toEqual([SEEDED, 'slab', 'slab']);
    expect(designs(apply(state, deleteDoorDesign({ designId: 'd-1' })))).toEqual(SEEDED);
    expect(apply(state, deleteDoorDesign({ designId: 'slab', reassignTo: 'five-piece-square' }))).toBe(state);
  });
});
