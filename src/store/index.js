import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import elevationReducer from '../elevation/store/elevationSlice';
import { setupElevationPersistence } from '../elevation/store/persistence';
import { getDesignApi } from '../api/designApi';
import { cloudSync, setupCloudSync } from '../elevation/store/cloudSync';
import { getDraftStore } from '../elevation/store/roomDrafts';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    elevation: elevationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    thunk: { extraArgument: { getDesignApi, drafts: getDraftStore() } },
  }),
});

setupElevationPersistence(store);
cloudSync.register(setupCloudSync(store, { getDesignApi, drafts: getDraftStore() }));
