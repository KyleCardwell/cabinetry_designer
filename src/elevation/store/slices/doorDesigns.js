import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import {
  DESIGN_SLOTS,
  SEEDED_DESIGN_IDS,
  doorDesignUses,
  isDoorDesignList,
  migrateDoorDesign,
  newDoorDesign,
} from '../../model/doorDesigns.js';
import { findDoorDesign, isDoorStyle } from '../../model/doorStyles.js';
import { isUuid } from '../../model/cloudRows.js';
import { roomIndexFor, syncRoomAt } from './helpers.js';

export const doorDesignReducers = {
  importDoorDesigns: {
    reducer(state, action) {
      const { designs, freshIds = [] } = action.payload;
      if (!Array.isArray(designs)) return;
      const incoming = designs.map(migrateDoorDesign).map((design, index) => (
        state.source === 'cloud' && design && typeof design === 'object'
          && !SEEDED_DESIGN_IDS.includes(design.id) && !isUuid(design.id) && freshIds[index]
          ? { ...design, id: freshIds[index] } : design));
      const list = [...current(state.settings).doorDesigns];
      for (const design of incoming) {
        const index = list.findIndex((entry) => entry.id === design?.id);
        if (index === -1) list.push(design);
        else list[index] = design;
      }
      if (!isDoorDesignList(list)) return;
      state.settings.doorDesigns = list;
      for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
    },
    prepare(payload = {}) {
      const count = Array.isArray(payload.designs) ? payload.designs.length : 0;
      return { payload: { ...payload, freshIds: Array.from({ length: count }, () => uuid()) } };
    },
  },
  addDoorDesign: {
    reducer(state, action) {
      const { baseId, id } = action.payload;
      const designs = current(state.settings).doorDesigns;
      const base = baseId == null ? designs[0] : findDoorDesign(baseId, designs);
      if (!base) return;
      const next = [...designs, newDoorDesign(designs, base, id)];
      if (!isDoorDesignList(next)) return;
      state.settings.doorDesigns = next;
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },
  updateDoorDesign(state, action) {
    const { designId, design } = action.payload;
    const designs = current(state.settings).doorDesigns;
    const designIndex = designs.findIndex((entry) => entry.id === designId);
    if (designIndex === -1) return;
    const next = { ...design, id: designId, slots: DESIGN_SLOTS[design?.construction] };
    const list = designs.map((entry, index) => (index === designIndex ? next : entry));
    if (!isDoorDesignList(list)) return;
    state.settings.doorDesigns = list;
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },
  deleteDoorDesign(state, action) {
    const { designId, reassignTo } = action.payload;
    const settings = current(state.settings);
    const designs = settings.doorDesigns;
    if (SEEDED_DESIGN_IDS.includes(designId) || !findDoorDesign(designId, designs)) return;
    const uses = doorDesignUses(settings, current(state.rooms), designId);
    if (uses.length && (reassignTo === designId || !findDoorDesign(reassignTo, designs))) return;
    if (uses.some((use) => use.level === 'team')) {
      state.settings.teamDoorStyle.designId = reassignTo;
    }
    for (const room of state.rooms) {
      for (const style of room.doorStyles ?? []) {
        if (style.designId === designId) style.designId = reassignTo;
      }
    }
    state.settings.doorDesigns = designs.filter((design) => design.id !== designId);
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },
  setTeamDoorStyle(state, action) {
    const { style } = action.payload;
    const next = { ...structuredClone(style), id: 'default', label: 'Std' };
    if (!isDoorStyle(next) || !findDoorDesign(next.designId, current(state.settings).doorDesigns)) return;
    state.settings.teamDoorStyle = next;
    for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
  },
  moveMissingDoorDesign(state, action) {
    const { roomId, designId, reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (index === -1) return;
    const designs = current(state.settings).doorDesigns;
    if (findDoorDesign(designId, designs)) return;
    const styles = current(state.rooms[index]).doorStyles ?? [];
    if (!styles.some((style) => style.designId === designId)) return;
    if (!findDoorDesign(reassignTo, designs)) return;
    for (const style of state.rooms[index].doorStyles) {
      if (style.designId === designId) style.designId = reassignTo;
    }
    syncRoomAt(state, index);
  },
};
