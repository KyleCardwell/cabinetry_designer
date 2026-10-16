import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { BUILT_IN_PULL_IDS, findPull, isPullList, newPull } from '../../model/pulls.js';

export const pullReducers = {
  addPull: {
    reducer(state, action) {
      const { baseId, id } = action.payload;
      const pulls = current(state.settings).pulls;
      const base = findPull(baseId, pulls) ?? pulls[0];
      if (!base) return;
      const next = [...pulls, newPull(pulls, base, id)];
      if (!isPullList(next)) return;
      state.settings.pulls = next;
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: uuid() } };
    },
  },
  updatePull(state, action) {
    const { pullId, pull } = action.payload;
    const pulls = current(state.settings).pulls;
    if (!findPull(pullId, pulls)) return;
    const next = pulls.map((entry) => entry.id === pullId ? { ...pull, id: pullId } : entry);
    if (!isPullList(next)) return;
    state.settings.pulls = next;
  },
  deletePull(state, action) {
    const { pullId } = action.payload;
    const pulls = current(state.settings).pulls;
    if (BUILT_IN_PULL_IDS.includes(pullId) || !findPull(pullId, pulls)) return;
    state.settings.pulls = pulls.filter((pull) => pull.id !== pullId);
  },
};
