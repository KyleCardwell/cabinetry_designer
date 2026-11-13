import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { roomCabinetLeaves } from '../../model/grid.js';
import { treeLeaves } from '../../model/treeWalk.js';
import { mergeAccessoryItems } from '../../model/accessoryItems.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { roomIndexFor, syncRoomAt } from './helpers.js';
import { copyAccessory, findAccessory, isAccessoryList, newAccessory } from '../../model/accessories.js';

export const accessoryReducers = {
  moveMissingAccessory(state, action) {
    const { roomId, accessoryId, place = 'section', reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (!['section', 'drawer_box'].includes(place) || index === -1 || typeof accessoryId !== 'string' || !accessoryId) return;
    const accessories = effectiveSettings(state, state.rooms[index]).accessories ?? [];
    if (findAccessory(accessoryId, accessories)
      || (reassignTo !== null && findAccessory(reassignTo, accessories)?.attachesTo !== place)) return;
    let changed = false;
    function reassign(node) {
      if (!node.accessories?.some((item) => item.accessoryId === accessoryId)) return;
      changed = true;
      let merged;
      for (const item of node.accessories) {
        if (item.accessoryId === accessoryId && reassignTo === null) continue;
        const id = item.accessoryId === accessoryId ? reassignTo : item.accessoryId;
        merged = mergeAccessoryItems(merged, [{ ...item, accessoryId: id }]);
      }
      if (merged?.length) node.accessories = merged;
      else delete node.accessories;
    }
    for (const { item } of roomCabinetLeaves(state.rooms[index])) {
      if (place === 'section') {
        for (const { node } of treeLeaves(item.interior)) reassign(node);
      } else {
        for (const { node: face } of treeLeaves(item.face)) {
          if (face.type === 'drawer_front' && face.drawerBox) {
            reassign(face.drawerBox);
            if (!Object.keys(face.drawerBox).length) delete face.drawerBox;
          }
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
