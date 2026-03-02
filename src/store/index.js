import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import projectReducer from './slices/projectSlice';
import roomReducer from './slices/roomSlice';
import wallReducer from './slices/wallSlice';
import objectReducer from './slices/objectSlice';
import canvasReducer from './slices/canvasSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectReducer,
    room: roomReducer,
    walls: wallReducer,
    objects: objectReducer,
    canvas: canvasReducer,
  },
});
