import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import elevationReducer from '../elevation/store/elevationSlice';
import presenceReducer from '../elevation/store/presenceSlice';
import { getPresenceService } from '../api/presence';
import { setupElevationPersistence } from '../elevation/store/persistence';
import { getDesignApi } from '../api/designApi';
import { cloudSync, setupCloudSync } from '../elevation/store/cloudSync';
import { getDraftStore } from '../elevation/store/roomDrafts';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    elevation: elevationReducer,
    presence: presenceReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    thunk: { extraArgument: { getDesignApi, drafts: getDraftStore(), getPresence: getPresenceService } },
  }),
});

setupElevationPersistence(store);
cloudSync.register(setupCloudSync(store, { getDesignApi, drafts: getDraftStore() }));
