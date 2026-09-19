import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import projectReducer from './slices/projectSlice';
import roomReducer from './slices/roomSlice';
import wallReducer from './slices/wallSlice';
import objectReducer from './slices/objectSlice';
import canvasReducer from './slices/canvasSlice';
import elevationReducer from '../elevation/store/elevationSlice';
import { setupElevationPersistence } from '../elevation/store/persistence';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectReducer,
    room: roomReducer,
    walls: wallReducer,
    objects: objectReducer,
    canvas: canvasReducer,
    elevation: elevationReducer,
  },
});

setupElevationPersistence(store);
