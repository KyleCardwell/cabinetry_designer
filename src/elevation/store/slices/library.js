import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { isUuid } from '../../model/cloudRows.js';
import { isLibraryBuiltIn, mergeLibrary, remapLibraryIds } from '../../model/libraryFile.js';
import { syncRoomAt } from './helpers.js';

export const libraryReducers = {
  importLibrary: {
    reducer(state, action) {
      const { file, freshIds } = action.payload;
      if (state.source === 'cloud' && !state.cloud?.permissions?.manage) return;
      const picked = state.source === 'cloud' ? remapLibraryIds(file, freshIds) : file;
      const settings = current(state.settings);
      const { lists, added, replaced, dependenciesAdded } = mergeLibrary(settings, picked);
      if (added + replaced + dependenciesAdded === 0) return;
      for (const [key, list] of Object.entries(lists)) {
        if (list !== settings[key]) state.settings[key] = list;
      }
      for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);
    },
    prepare({ file }) {
      const ids = [...Object.values(file.items), ...Object.values(file.dependencies)].flat()
        .map((entry) => entry?.id).filter((id) => typeof id === 'string' && !isUuid(id) && !isLibraryBuiltIn(id));
      return { payload: { file, freshIds: Object.fromEntries([...new Set(ids)].map((id) => [id, uuid()])) } };
    },
  },
};
