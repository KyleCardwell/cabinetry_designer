import { describe, expect, it } from 'vitest';
import { isAccessoryList } from '../../model/accessories.js';
import { isUuid } from '../../model/cloudRows.js';
import elevationReducer, { addAccessory, updateAccessory, deleteAccessory, createInitialElevationState } from '../elevationSlice.js';
import { stateWithRun } from './helpers/sliceFixtures.js';

describe('IN12b step b accessory reducers', () => {
  it('adds blank accessories with fresh UUIDs and unique names, then deep copies all fields', () => {
    const initial = stateWithRun();
    expect(createInitialElevationState().teamServices).toEqual([]);
    const first = addAccessory();
    const second = addAccessory();
    expect(isUuid(first.payload.id)).toBe(true);
    expect(isUuid(second.payload.id)).toBe(true);
    expect(first.payload.id).not.toBe(second.payload.id);
    let state = elevationReducer(elevationReducer(initial, first), second);
    expect(state.settings.accessories.map(({ name }) => name)).toEqual(['New accessory', 'New accessory 2']);
    expect(state.settings.accessories[0]).toEqual({
      id: first.payload.id, name: 'New accessory', brand: '', model: '', description: '', reportText: '',
      attachesTo: 'section', wholeSection: false, minOpening: { width: null, depth: null, height: null },
      size: { width: null, height: null, depth: null }, lengthDeduction: null,
      shapeId: null, depthAnchor: { at: 'front', offset: 0 },
      ownSlides: false, effects: [], pricing: 'unit', price: null, actualCost: null, labor: {},
    });
    state = elevationReducer(state, updateAccessory({ accessoryId: first.payload.id, accessory: {
      ...state.settings.accessories[0], minOpening: { width: 27, depth: 22, height: null },
      pricing: 'area', price: 4.5, actualCost: 2.1, labor: { '7': 12 },
    } }));
    const copy = addAccessory({ baseId: first.payload.id });
    const copied = elevationReducer(state, copy);
    expect(copied.settings.accessories[2]).toEqual({ ...state.settings.accessories[0], id: copy.payload.id, name: 'New accessory copy' });
    for (const key of ['minOpening', 'size', 'effects', 'labor', 'depthAnchor']) {
      expect(copied.settings.accessories[2][key]).not.toBe(state.settings.accessories[0][key]);
    }
    expect(elevationReducer(copied, addAccessory({ baseId: first.payload.id })).settings.accessories[3].name).toBe('New accessory copy 2');
    expect(elevationReducer(state, addAccessory({ baseId: 'missing' }))).toBe(state);
    expect(copied.rooms).toBe(initial.rooms);
    expect(isAccessoryList(copied.settings.accessories)).toBe(true);
  });

  it('keeps ids, rejects invalid updates and unknown ids, and leaves rooms unchanged', () => {
    const initial = stateWithRun();
    const state = elevationReducer(elevationReducer(initial, addAccessory()), addAccessory());
    const accessory = state.settings.accessories[0];
    const updated = elevationReducer(state, updateAccessory({ accessoryId: accessory.id, accessory: { ...accessory, id: 'ignored', name: 'Lazy susan' } }));
    expect(updated.settings.accessories[0]).toEqual({ ...accessory, name: 'Lazy susan' });
    expect(updated.rooms).toBe(initial.rooms);
    for (const patch of [
      { name: 'NEW ACCESSORY 2' }, { name: '' }, { price: -1 }, { actualCost: Infinity },
      { labor: { '0': 1 } }, { minOpening: { width: 0, depth: null, height: null } },
      { attachesTo: 'drawer_box', wholeSection: true }, { effects: ['clear-behind'] }, { extra: true },
    ]) {
      expect(elevationReducer(state, updateAccessory({ accessoryId: accessory.id, accessory: { ...accessory, ...patch } }))).toBe(state);
    }
    expect(elevationReducer(state, updateAccessory({ accessoryId: 'missing', accessory }))).toBe(state);
  });

  it('removes accessories in local and cloud data, ignores unknown ids, and locks issued libraries', () => {
    const initial = stateWithRun();
    const state = elevationReducer(initial, addAccessory());
    const accessory = state.settings.accessories[0];
    expect(elevationReducer(state, deleteAccessory({ accessoryId: 'missing' }))).toBe(state);
    for (const source of ['local', 'cloud']) {
      const removed = elevationReducer({ ...state, source }, deleteAccessory({ accessoryId: accessory.id }));
      expect(removed.settings.accessories).toEqual([]);
      expect(removed.rooms).toBe(initial.rooms);
    }
    const version = { ...state, source: 'version' };
    for (const action of [addAccessory(), updateAccessory({ accessoryId: accessory.id, accessory: { ...accessory, price: 3 } }), deleteAccessory({ accessoryId: accessory.id })]) {
      expect(elevationReducer(version, action)).toBe(version);
    }
  });
});
