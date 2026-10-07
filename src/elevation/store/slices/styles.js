import { isBottomPart } from '../../model/bottoms.js';
import { gridLeaves } from '../../model/grid.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  isStyle,
} from '../../model/styles.js';
import {
  roomIndexFor,
  roomFor,
  runLocation,
  syncRoomAt,
  STYLE_FIELD_KEYS,
  cleanPartial,
  withStandardDrawers,
} from './helpers.js';

export const styleReducers = {
  setItemFace(state, action) {
    const location = runLocation(state, action.payload);
    if (!location) return;
    const { itemIds = [], face = null } = action.payload;
    for (const item of gridLeaves(location.run.grid)) {
      if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
      item.face = face === null ? null : structuredClone(face);
    }
    syncRoomAt(state, location.roomIndex);
  },
  setRoomStyle(state, action) {
    const room = roomFor(state, action.payload.roomId);
    const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
    if (!room || !isStyle(style)) return;
    withStandardDrawers(state, room, () => {
      if (style) room.style = style;
      else delete room.style;
    });
    syncRoomAt(state, roomIndexFor(state, action.payload.roomId));
  },
  setRunStyle(state, action) {
    const location = runLocation(state, action.payload);
    const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
    if (!location || !isStyle(style)) return;
    withStandardDrawers(state, location.room, () => {
      if (style) location.run.style = style;
      else delete location.run.style;
    });
    syncRoomAt(state, location.roomIndex);
  },
  setRunFaceOptions(state, action) {
    const location = runLocation(state, action.payload);
    if (!location) return;
    const allowed = { upperBottom: UPPER_BOTTOM_OPTIONS, top: RUN_TOP_OPTIONS };
    for (const [key, options] of Object.entries(allowed)) {
      const value = action.payload[key];
      if (value === null) delete location.run[key];
      else if (options.includes(value)) location.run[key] = value;
    }
    if (typeof action.payload.hanging === 'boolean') {
      if (action.payload.hanging) location.run.hanging = true;
      else delete location.run.hanging;
    }
    syncRoomAt(state, location.roomIndex);
  },
  setRunBottom(state, action) {
    const location = runLocation(state, action.payload);
    const { bottom } = action.payload;
    if (!location || !Array.isArray(bottom) || !bottom.every(isBottomPart)) return;
    if (bottom.length === 0) delete location.run.bottom;
    else location.run.bottom = bottom.map((part) => ({ ...part }));
    syncRoomAt(state, location.roomIndex);
  },
  setItemStyle(state, action) {
    const location = runLocation(state, action.payload);
    const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
    if (!location || !isStyle(style)) return;
    const { itemIds = [] } = action.payload;
    withStandardDrawers(state, location.room, () => {
      for (const item of gridLeaves(location.run.grid)) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        if (style) item.style = { ...style };
        else delete item.style;
      }
    });
  },
  setItemReveals(state, action) {
    const location = runLocation(state, action.payload);
    if (!location) return;
    const reveals = cleanPartial(action.payload.reveals, REVEAL_KEYS, Number.isFinite);
    const { itemIds = [] } = action.payload;
    for (const item of gridLeaves(location.run.grid)) {
      if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
      if (reveals) item.reveals = { ...reveals };
      else delete item.reveals;
    }
  },
};
