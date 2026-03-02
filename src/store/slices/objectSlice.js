import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

const objectSlice = createSlice({
  name: 'objects',
  initialState: {
    byId: {},      // { [object_id]: PlacedObject }
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
    addObject(state, action) {
      const { roomId, objectType, catalogId, x, y, width, height, depth, params } = action.payload;
      const object_id = uuidv4();
      const obj = {
        object_id,
        room_id: roomId,
        wall_id: null,
        object_type: objectType,
        catalog_id: catalogId ?? null,
        x, y,
        z: 0,
        rotation: 0,
        width: width ?? null,
        height: height ?? null,
        depth: depth ?? null,
        params: params ?? {},
        sort_order: state.allIds.length,
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
    snapObjectToWall(state, action) {
      const { object_id, wall_id, x, y, rotation } = action.payload;
      if (state.byId[object_id]) {
        state.byId[object_id].wall_id = wall_id;
        state.byId[object_id].x = x;
        state.byId[object_id].y = y;
        state.byId[object_id].rotation = rotation;
      }
    },
    removeObject(state, action) {
      const object_id = action.payload;
      delete state.byId[object_id];
      state.allIds = state.allIds.filter((id) => id !== object_id);
    },
    clearObjects(state) {
      state.byId = {};
      state.allIds = [];
    },
  },
});

export const {
  loadObjects, addObject, updateObject, updateObjectParams,
  snapObjectToWall, removeObject, clearObjects,
} = objectSlice.actions;
export default objectSlice.reducer;
