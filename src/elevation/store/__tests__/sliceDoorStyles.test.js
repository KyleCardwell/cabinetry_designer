import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import elevationReducer, { addDoorStyle, deleteDoorStyle, updateDoorStyle } from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const { name, ...UNNAMED } = DEFAULT_DOOR_STYLE;
void name;
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const room = (state) => state.rooms[0];

/** A base run with one cabinet; `doorStyleId` is the room's pick (it may name a style added later). */
function base(doorStyleId) {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  if (doorStyleId) state.rooms[0].doorStyleId = doorStyleId;
  return state;
}

describe('SPEC-46.1 adding, editing and deleting a room\'s door styles', () => {
  it('adds a copy of the team default, or of another style, with the next free label', () => {
    const state = apply(base(), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2', baseId: 'ds-1' }));
    expect(room(state).doorStyles).toEqual([
      { ...UNNAMED, id: 'ds-1', label: 'A' },
      { ...UNNAMED, id: 'ds-2', label: 'B' },
    ]);
    expect(apply(state, addDoorStyle({ id: 'ds-3', baseId: 'gone' }))).toBe(state);
    const thick = base();
    thick.settings.teamDoorStyle = { ...thick.settings.teamDoorStyle, thickness: 1 };
    expect(room(apply(thick, addDoorStyle({ id: 'ds-1' }))).doorStyles[0].thickness).toBe(1);
  });

  it('saves an edited style under its own id and re-syncs the room (P11)', () => {
    const state = apply(base('ds-1'), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2' }));
    expect('_doorThickness' in currentRun(state)).toBe(false);
    const edited = { ...room(state).doorStyles[0], id: 'other', thickness: 1, name: 'Thick' };
    const next = apply(state, updateDoorStyle({ styleId: 'ds-1', style: edited }));
    expect(room(next).doorStyles[0]).toEqual({ ...UNNAMED, id: 'ds-1', label: 'A', thickness: 1, name: 'Thick' });
    expect(currentRun(next)._doorThickness).toBe(1);
  });

  it('refuses a repeated label, a broken style or an unknown id', () => {
    const state = apply(base(), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2' }));
    const [a] = room(state).doorStyles;
    expect([
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, label: 'B' } }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, thickness: 0 } }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, color: 'red' } }),
      updateDoorStyle({ styleId: 'gone', style: a }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);
  });

  it('deletes an unused style, and a used one only when told where its uses go', () => {
    const state = apply(
      base('ds-1'),
      addDoorStyle({ id: 'ds-1' }),
      addDoorStyle({ id: 'ds-2' }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...UNNAMED, id: 'ds-1', label: 'A', thickness: 1 } }),
    );
    expect(currentRun(state)._doorThickness).toBe(1);
    expect([
      deleteDoorStyle({ styleId: 'ds-1' }),
      deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'ds-1' }),
      deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'gone' }),
      deleteDoorStyle({ styleId: 'gone', reassignTo: null }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);

    const unused = apply(state, deleteDoorStyle({ styleId: 'ds-2' }));
    expect(room(unused).doorStyles.map(({ id }) => id)).toEqual(['ds-1']);
    const moved = apply(state, deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'ds-2' }));
    expect([room(moved).doorStyleId, room(moved).doorStyles.map(({ id }) => id), '_doorThickness' in currentRun(moved)])
      .toEqual(['ds-2', ['ds-2'], false]);
    const cleared = apply(unused, deleteDoorStyle({ styleId: 'ds-1', reassignTo: null }));
    expect(['doorStyleId' in room(cleared), 'doorStyles' in room(cleared), '_doorThickness' in currentRun(cleared)])
      .toEqual([false, false, false]);
  });
});
