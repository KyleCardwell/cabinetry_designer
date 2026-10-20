import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { gridLeaves } from '../../model/grid.js';
import { MAX_ACCESSORY_QTY } from '../../model/constants.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { roomIndexFor, syncRoomAt } from './helpers.js';
import { copyAccessory, findAccessory, isAccessoryList, newAccessory } from '../../model/accessories.js';

export const accessoryReducers = {
  moveMissingAccessory(state, action) {
    const { roomId, accessoryId, reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (index === -1 || typeof accessoryId !== 'string' || !accessoryId) return;
    const accessories = effectiveSettings(state, state.rooms[index]).accessories ?? [];
    if (findAccessory(accessoryId, accessories)
      || (reassignTo !== null && findAccessory(reassignTo, accessories)?.attachesTo !== 'section')) return;
    let changed = false;
    function move(node) {
      if (!node) return;
      if (node.children) {
        node.children.forEach(move);
        return;
      }
      if (!node.accessories?.some((item) => item.accessoryId === accessoryId)) return;
      changed = true;
      const merged = [];
      for (const item of node.accessories) {
        if (item.accessoryId === accessoryId && reassignTo === null) continue;
        const id = item.accessoryId === accessoryId ? reassignTo : item.accessoryId;
        const previous = merged.find((entry) => entry.accessoryId === id);
        if (previous) previous.qty = Math.min(MAX_ACCESSORY_QTY, (previous.qty ?? 1) + (item.qty ?? 1));
        else merged.push({ ...item, accessoryId: id });
      }
      if (merged.length) node.accessories = merged;
      else delete node.accessories;
    }
    for (const wall of state.rooms[index].walls ?? []) {
      for (const run of wall.runs ?? []) {
        for (const item of run.grid ? gridLeaves(run.grid) : []) {
          if (item.kind === 'cabinet') move(item.interior);
        }
      }
    }
    if (changed) syncRoomAt(state, index);
  },
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
