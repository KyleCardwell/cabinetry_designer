import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { isDoorStyle, teamDoorStyle } from '../../model/doorStyles.js';
import { newDoorStyle, doorStyleUses, reassignDoorStyle } from '../../model/doorStyleEdits.js';
import { roomFor, roomIndexFor, syncRoomAt } from './helpers.js';

export const doorStyleReducers = {
  addDoorStyle: {
    reducer(state, action) {
      const { roomId, baseId, id } = action.payload;
      const room = roomFor(state, roomId);
      if (!room) return;
      const styles = room.doorStyles ?? [];
      const base = baseId == null
        ? teamDoorStyle(state.settings)
        : current(room).doorStyles?.find((style) => style.id === baseId);
      if (!base) return;
      room.doorStyles = [...styles, newDoorStyle(styles, base, id)];
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },
  updateDoorStyle(state, action) {
    const { roomId, styleId, style } = action.payload;
    const room = roomFor(state, roomId);
    if (!room) return;
    const styles = room.doorStyles ?? [];
    const styleIndex = styles.findIndex((entry) => entry.id === styleId);
    const next = { ...style, id: styleId };
    if (styleIndex === -1 || !isDoorStyle(next)
      || styles.some((entry, index) => index !== styleIndex && entry.label === next.label)) return;
    styles[styleIndex] = next;
    syncRoomAt(state, roomIndexFor(state, roomId));
  },
  deleteDoorStyle(state, action) {
    const { roomId, styleId, reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (index === -1) return;
    const room = state.rooms[index];
    const styles = room.doorStyles ?? [];
    if (!styles.some((style) => style.id === styleId)) return;
    const uses = doorStyleUses(current(room), styleId);
    if (uses.length) {
      if (reassignTo !== null
        && (reassignTo === styleId || !styles.some((style) => style.id === reassignTo))) return;
      state.rooms[index] = reassignDoorStyle(current(room), styleId, reassignTo);
    }
    const nextRoom = state.rooms[index];
    nextRoom.doorStyles = nextRoom.doorStyles.filter((style) => style.id !== styleId);
    if (nextRoom.doorStyles.length === 0) delete nextRoom.doorStyles;
    syncRoomAt(state, index);
  },
};
