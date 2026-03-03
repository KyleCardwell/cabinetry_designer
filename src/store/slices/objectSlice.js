import { createSlice } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";

const objectSlice = createSlice({
  name: "objects",
  initialState: {
    byId: {}, // { [object_id]: PlacedObject }
    allIds: [],
  },
  reducers: {
    loadObjects(state, action) {
      state.byId = {};
      state.allIds = [];
      for (const obj of action.payload) {
        state.byId[obj.object_id] = obj;
        state.allIds.push(obj.object_id);
      }
    },
    // x = local distance along wall from (x1,y1), y = perpendicular offset
    addObject(state, action) {
      const {
        roomId,
        wallId,
        objectType,
        catalogId,
        x,
        y,
        width,
        height,
        depth,
        params,
        fillColor,
        borderColor,
      } = action.payload;
      if (!wallId) return; // Objects must be assigned to a wall
      const object_id = uuidv4();
      const obj = {
        object_id,
        room_id: roomId,
        wall_id: wallId,
        object_type: objectType,
        catalog_id: catalogId ?? null,
        x: x ?? 0, // local distance along wall
        y: y ?? 0, // perpendicular offset from wall face
        z: 0,
        rotation: 0, // local rotation within wall group
        width: width ?? null,
        height: height ?? null,
        depth: depth ?? null,
        params: params ?? {},
        sort_order: state.allIds.length,
        fillColor: fillColor ?? "#3b82f6",
        borderColor: borderColor ?? "#60a5fa",
      };
      state.byId[object_id] = obj;
      state.allIds.push(object_id);
    },
    updateObject(state, action) {
      const { object_id, ...changes } = action.payload;
      if (state.byId[object_id]) {
        Object.assign(state.byId[object_id], changes);
      }
    },
    updateObjectParams(state, action) {
      const { object_id, key, value } = action.payload;
      if (state.byId[object_id]) {
        state.byId[object_id].params[key] = value;
      }
    },
    // Reassign an object to a different wall with new local position
    reassignObjectToWall(state, action) {
      const { object_id, wall_id, x } = action.payload;
      if (state.byId[object_id]) {
        state.byId[object_id].wall_id = wall_id;
        state.byId[object_id].x = x ?? 0;
        state.byId[object_id].y = 0;
      }
    },
    removeObject(state, action) {
      const object_id = action.payload;
      delete state.byId[object_id];
      state.allIds = state.allIds.filter((id) => id !== object_id);
    },
    // Remove all objects belonging to a specific wall
    removeObjectsByWall(state, action) {
      const wall_id = action.payload;
      const toRemove = state.allIds.filter(
        (id) => state.byId[id].wall_id === wall_id,
      );
      for (const id of toRemove) {
        delete state.byId[id];
      }
      state.allIds = state.allIds.filter((id) => !toRemove.includes(id));
    },
    clearObjects(state) {
      state.byId = {};
      state.allIds = [];
    },
  },
});

export const {
  loadObjects,
  addObject,
  updateObject,
  updateObjectParams,
  reassignObjectToWall,
  removeObject,
  removeObjectsByWall,
  clearObjects,
} = objectSlice.actions;
export default objectSlice.reducer;
