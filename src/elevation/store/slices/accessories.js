import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { copyAccessory, findAccessory, isAccessoryList, newAccessory } from '../../model/accessories.js';

export const accessoryReducers = {
  addAccessory: {
    reducer(state, action) {
      const { baseId, id } = action.payload;
      const accessories = current(state.settings).accessories ?? [];
      const base = findAccessory(baseId, accessories);
      if (baseId !== undefined && !base) return;
      const added = base ? copyAccessory(accessories, base, id) : newAccessory(accessories, id);
      const next = [...accessories, added];
      if (isAccessoryList(next)) state.settings.accessories = next;
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: uuid() } };
    },
  },
  updateAccessory(state, action) {
    const { accessoryId, accessory } = action.payload;
    const accessories = current(state.settings).accessories ?? [];
    if (!findAccessory(accessoryId, accessories)) return;
    const next = accessories.map((entry) => entry.id === accessoryId ? { ...accessory, id: accessoryId } : entry);
    if (isAccessoryList(next)) state.settings.accessories = next;
  },
  deleteAccessory(state, action) {
    const { accessoryId } = action.payload;
    const accessories = current(state.settings).accessories ?? [];
    if (!findAccessory(accessoryId, accessories)) return;
    state.settings.accessories = accessories.filter((entry) => entry.id !== accessoryId);
  },
};
