import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

const wallSlice = createSlice({
  name: 'walls',
  initialState: {
    byId: {},      // { [wall_id]: { wall_id, room_id, x1, y1, x2, y2, thickness, height, sort_order } }
    allIds: [],
  },
  reducers: {
    loadWalls(state, action) {
      state.byId = {};
      state.allIds = [];
      for (const wall of action.payload) {
        state.byId[wall.wall_id] = wall;
        state.allIds.push(wall.wall_id);
      }
    },
    addWall(state, action) {
      const { roomId, x1, y1, x2, y2 } = action.payload;
      const wall_id = uuidv4();
      const wall = {
        wall_id,
        room_id: roomId,
        x1, y1, x2, y2,
        thickness: 4.5,
        height: null,
        sort_order: state.allIds.length,
      };
      state.byId[wall_id] = wall;
      state.allIds.push(wall_id);
    },
    updateWall(state, action) {
      const { wall_id, ...changes } = action.payload;
      if (state.byId[wall_id]) {
        Object.assign(state.byId[wall_id], changes);
      }
    },
    removeWall(state, action) {
      const wall_id = action.payload;
      delete state.byId[wall_id];
      state.allIds = state.allIds.filter((id) => id !== wall_id);
    },
    clearWalls(state) {
      state.byId = {};
      state.allIds = [];
    },
  },
});

export const { loadWalls, addWall, updateWall, removeWall, clearWalls } = wallSlice.actions;
export default wallSlice.reducer;
