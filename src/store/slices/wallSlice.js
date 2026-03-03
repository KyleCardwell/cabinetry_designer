import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

const wallSlice = createSlice({
  name: 'walls',
  initialState: {
    byId: {},      // { [wall_id]: { wall_id, room_id, x1, y1, x2, y2, thickness, height, soffit_height, sort_order, connections, locks } }
    allIds: [],
  },
  reducers: {
    loadWalls(state, action) {
      state.byId = {};
      state.allIds = [];
      for (const wall of action.payload) {
        if (!wall.connections) wall.connections = { start: null, end: null };
        if (!wall.locks) wall.locks = { length: false, angle: false, soffitHeight: false };
        state.byId[wall.wall_id] = wall;
        state.allIds.push(wall.wall_id);
      }
    },
    addWall(state, action) {
      const { roomId, x1, y1, x2, y2, connectStart, connectEnd } = action.payload;
      const wall_id = uuidv4();
      const wall = {
        wall_id,
        room_id: roomId,
        x1, y1, x2, y2,
        thickness: 4.5,
        height: null,
        soffit_height: null,
        sort_order: state.allIds.length,
        connections: { start: null, end: null },
        locks: { length: false, angle: false, soffitHeight: false },
      };
      state.byId[wall_id] = wall;
      state.allIds.push(wall_id);

      // Auto-connect start to another wall's endpoint
      if (connectStart) {
        const { wallId: otherWallId, endpoint: otherEndpoint } = connectStart;
        wall.connections.start = { wallId: otherWallId, endpoint: otherEndpoint };
        if (state.byId[otherWallId]) {
          state.byId[otherWallId].connections[otherEndpoint] = { wallId: wall_id, endpoint: 'start' };
        }
      }
      // Auto-connect end to another wall's endpoint
      if (connectEnd) {
        const { wallId: otherWallId, endpoint: otherEndpoint } = connectEnd;
        wall.connections.end = { wallId: otherWallId, endpoint: otherEndpoint };
        if (state.byId[otherWallId]) {
          state.byId[otherWallId].connections[otherEndpoint] = { wallId: wall_id, endpoint: 'end' };
        }
      }
    },
    updateWall(state, action) {
      const { wall_id, ...changes } = action.payload;
      if (state.byId[wall_id]) {
        Object.assign(state.byId[wall_id], changes);
      }
    },
    // Move a wall endpoint and propagate to any connected wall
    moveWallEndpoint(state, action) {
      const { wall_id, endpoint, x, y } = action.payload;
      const wall = state.byId[wall_id];
      if (!wall) return;

      if (endpoint === 'start') {
        wall.x1 = x;
        wall.y1 = y;
      } else {
        wall.x2 = x;
        wall.y2 = y;
      }

      // Propagate to connected wall
      const conn = wall.connections[endpoint];
      if (conn) {
        const other = state.byId[conn.wallId];
        if (other) {
          if (conn.endpoint === 'start') {
            other.x1 = x;
            other.y1 = y;
          } else {
            other.x2 = x;
            other.y2 = y;
          }
        }
      }
    },
    connectWalls(state, action) {
      const { wallId1, endpoint1, wallId2, endpoint2 } = action.payload;
      const w1 = state.byId[wallId1];
      const w2 = state.byId[wallId2];
      if (!w1 || !w2) return;

      // Break existing connections on these endpoints first
      const old1 = w1.connections[endpoint1];
      if (old1 && state.byId[old1.wallId]) {
        state.byId[old1.wallId].connections[old1.endpoint] = null;
      }
      const old2 = w2.connections[endpoint2];
      if (old2 && state.byId[old2.wallId]) {
        state.byId[old2.wallId].connections[old2.endpoint] = null;
      }

      // Create the bidirectional link
      w1.connections[endpoint1] = { wallId: wallId2, endpoint: endpoint2 };
      w2.connections[endpoint2] = { wallId: wallId1, endpoint: endpoint1 };

      // Snap wall2's endpoint to wall1's endpoint position
      const pos = endpoint1 === 'start' ? { x: w1.x1, y: w1.y1 } : { x: w1.x2, y: w1.y2 };
      if (endpoint2 === 'start') {
        w2.x1 = pos.x;
        w2.y1 = pos.y;
      } else {
        w2.x2 = pos.x;
        w2.y2 = pos.y;
      }
    },
    disconnectWallEndpoint(state, action) {
      const { wall_id, endpoint } = action.payload;
      const wall = state.byId[wall_id];
      if (!wall) return;

      const conn = wall.connections[endpoint];
      if (conn && state.byId[conn.wallId]) {
        state.byId[conn.wallId].connections[conn.endpoint] = null;
      }
      wall.connections[endpoint] = null;
    },
    setWallLock(state, action) {
      const { wall_id, lockKey, value } = action.payload;
      const wall = state.byId[wall_id];
      if (wall && wall.locks) {
        wall.locks[lockKey] = value;
      }
    },
    removeWall(state, action) {
      const wall_id = action.payload;
      const wall = state.byId[wall_id];
      if (wall) {
        // Disconnect from any connected walls
        for (const ep of ['start', 'end']) {
          const conn = wall.connections[ep];
          if (conn && state.byId[conn.wallId]) {
            state.byId[conn.wallId].connections[conn.endpoint] = null;
          }
        }
      }
      delete state.byId[wall_id];
      state.allIds = state.allIds.filter((id) => id !== wall_id);
    },
    clearWalls(state) {
      state.byId = {};
      state.allIds = [];
    },
  },
});

export const {
  loadWalls, addWall, updateWall, moveWallEndpoint,
  connectWalls, disconnectWallEndpoint, setWallLock, removeWall, clearWalls,
} = wallSlice.actions;
export default wallSlice.reducer;
