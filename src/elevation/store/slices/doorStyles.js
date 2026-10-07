import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { DOOR_STYLE_KEYS, isDoorStyle, isPartSizes, teamDoorStyle } from '../../model/doorStyles.js';
import { newDoorStyle, doorStyleUses, reassignDoorStyle } from '../../model/doorStyleEdits.js';
import { findLeaf } from '../../model/cellTree.js';
import { gridLeaves } from '../../model/grid.js';
import { roomFor, roomIndexFor, wallLocation, runLocation, syncRoomAt } from './helpers.js';

const isChoice = (room, id, { sheet = false } = {}) => (id === 'sheet'
  ? sheet : id === 'default' || room.doorStyles?.some((style) => style.id === id));

export const doorStyleReducers = {
  setRoomDoorDrawing(state, action) {
    const { roomId, doorDetails, doorStyleTags } = action.payload;
    const room = roomFor(state, roomId);
    if (!room) return;
    const hasDetails = Object.hasOwn(action.payload, 'doorDetails');
    const hasTags = Object.hasOwn(action.payload, 'doorStyleTags');
    if ((hasDetails && typeof doorDetails !== 'boolean')
      || (hasTags && typeof doorStyleTags !== 'boolean')) return;
    if (hasDetails) {
      if (doorDetails) delete room.doorDetails;
      else room.doorDetails = false;
    }
    if (hasTags) {
      if (doorStyleTags) room.doorStyleTags = true;
      else delete room.doorStyleTags;
    }
  },
  setDoorStylePick(state, action) {
    const { roomId, level, itemIds = [], key, styleId } = action.payload;
    const room = roomFor(state, roomId);
    if (!room || !DOOR_STYLE_KEYS.includes(key)
      || (styleId !== null && !isChoice(room, styleId, { sheet: key === 'panelStyleId' }))) return;
    let targets;
    if (level === 'room') targets = [room];
    else if (level === 'wall') targets = [wallLocation(state, action.payload)?.wall];
    else if (level === 'run' || level === 'cabinet') {
      const run = runLocation(state, action.payload)?.run;
      if (!run) return;
      targets = level === 'run' ? [run] : (run.grid ? gridLeaves(run.grid) : [])
        .filter((item) => item.kind === 'cabinet' && itemIds.includes(item.id));
    } else return;
    if (!targets.length || !targets[0]) return;
    for (const target of targets) {
      if (styleId === null) delete target[key];
      else target[key] = styleId;
    }
    syncRoomAt(state, roomIndexFor(state, roomId));
  },
  setPartStyle(state, action) {
    const { roomId, part, side, endpoint, cellId, styleId, sizes } = action.payload;
    const room = roomFor(state, roomId);
    if (!room) return;
    const hasStyle = Object.hasOwn(action.payload, 'styleId');
    const hasSizes = Object.hasOwn(action.payload, 'sizes');
    if (hasStyle && styleId !== null && !isChoice(room, styleId, { sheet: true })) return;
    if (hasSizes && sizes !== null && !isPartSizes(sizes)) return;
    let target;
    if (part === 'wallEndPanel') {
      if (!['start', 'end'].includes(endpoint)) return;
      target = wallLocation(state, action.payload)?.wall.endPanels?.[endpoint];
    } else if (part === 'runEnd' || part === 'panelCell') {
      const run = runLocation(state, action.payload)?.run;
      if (!run) return;
      if (part === 'runEnd') {
        if (!['left', 'right'].includes(side)) return;
        target = run.ends?.[side];
      } else {
        target = run.grid ? findLeaf(run.grid, cellId) : null;
        if (target?.kind !== 'panel') return;
      }
    } else return;
    if (!target) return;
    if (hasStyle) {
      if (styleId === null) delete target.styleId;
      else target.styleId = styleId;
    }
    if (hasSizes) {
      if (sizes === null) delete target.sizes;
      else target.sizes = structuredClone(sizes);
    }
    syncRoomAt(state, roomIndexFor(state, roomId));
  },
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
        && (reassignTo === styleId || !isChoice(room, reassignTo))) return;
      state.rooms[index] = reassignDoorStyle(current(room), styleId, reassignTo);
    }
    const nextRoom = state.rooms[index];
    nextRoom.doorStyles = nextRoom.doorStyles.filter((style) => style.id !== styleId);
    if (nextRoom.doorStyles.length === 0) delete nextRoom.doorStyles;
    syncRoomAt(state, index);
  },
};
