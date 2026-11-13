import { createSlice } from '@reduxjs/toolkit';

/**
 * Who has rooms open in the current project (SPEC-DB6a.1). Kept outside the elevation slice,
 * which is rebuilt whenever a workspace or room loads. `entries` includes this tab (`selfKey`).
 */
const initialState = { estProjectId: null, selfKey: null, status: 'idle', entries: [] };

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    presenceJoining(state, action) {
      const { estProjectId, selfKey } = action.payload;
      return { ...initialState, estProjectId, selfKey, status: 'joining' };
    },
    /** 'joined' or 'unavailable' (couldn't join: offline, policy, Realtime off). */
    presenceStatus(state, action) {
      state.status = action.payload;
    },
    presenceEntries(state, action) {
      state.entries = action.payload;
    },
    presenceLeft() {
      return initialState;
    },
  },
});

export const { presenceJoining, presenceStatus, presenceEntries, presenceLeft } = presenceSlice.actions;
export default presenceSlice.reducer;

const others = (presence) => (presence?.entries ?? []).filter((entry) => entry.key !== presence.selfKey);

/** Other tabs with this room open for editing (not read-only), earliest first. */
export function selectRoomEditors(state, roomId) {
  return others(state.presence)
    .filter((entry) => entry.roomId === roomId && !entry.readOnly)
    .sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)));
}

/** Other tabs viewing this room read-only. */
export function selectRoomViewers(state, roomId) {
  return others(state.presence).filter((entry) => entry.roomId === roomId && entry.readOnly);
}

/** roomId → other tabs that have it open (for the project page's "Open · Jane"). */
export function selectOpenRooms(state) {
  const map = {};
  for (const entry of others(state.presence)) {
    if (entry.roomId) (map[entry.roomId] ??= []).push(entry);
  }
  return map;
}
