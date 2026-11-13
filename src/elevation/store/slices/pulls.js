import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { BUILT_IN_PULL_IDS, PULL_KEYS, findPull, isPullList, newPull, roomPullUses } from '../../model/pulls.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { gridLeaves } from '../../model/grid.js';
import { roomFor, roomIndexFor, wallLocation, runLocation, syncRoomAt } from './helpers.js';

export const pullReducers = {
  setCabinetPullHeight(state, action) {
    const { roomId, itemIds = [], value } = action.payload;
    if (value !== null && !(Number.isFinite(value) && value > 0)) return;
    const run = runLocation(state, action.payload)?.run;
    if (!run?.grid) return;
    const targets = gridLeaves(run.grid)
      .filter((item) => item.kind === 'cabinet' && itemIds.includes(item.id));
    if (!targets.length) return;
    for (const target of targets) {
      if (value === null) delete target.pullHeight;
      else target.pullHeight = value;
    }
    syncRoomAt(state, roomIndexFor(state, roomId));
  },
  moveMissingPull(state, action) {
    const { roomId, pullId, reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (index === -1 || typeof pullId !== 'string' || !pullId || pullId === 'none') return;
    const pulls = effectiveSettings(state, state.rooms[index]).pulls;
    if (findPull(pullId, pulls) || (reassignTo !== 'none' && !findPull(reassignTo, pulls))) return;
    const uses = [...roomPullUses(state.rooms[index])].filter(({ node, key }) => node[key] === pullId);
    if (!uses.length) return;
    for (const { node, key } of uses) node[key] = reassignTo;
    syncRoomAt(state, index);
  },
  setPullPick(state, action) {
    const { roomId, level, itemIds = [], key, pullId } = action.payload;
    const room = roomFor(state, roomId);
    if (!room || !Object.values(PULL_KEYS).includes(key)
      || (pullId !== null && pullId !== 'none'
        && !effectiveSettings(state, room).pulls.some((pull) => pull.id === pullId))) return;
    let targets;
    if (level === 'wall') targets = [wallLocation(state, action.payload)?.wall];
    else if (level === 'run' || level === 'cabinet') {
      const run = runLocation(state, action.payload)?.run;
      if (!run) return;
      targets = level === 'run' ? [run] : (run.grid ? gridLeaves(run.grid) : [])
        .filter((item) => item.kind === 'cabinet' && itemIds.includes(item.id));
    } else return;
    if (!targets.length || !targets[0]) return;
    for (const target of targets) {
      if (pullId === null) delete target[key];
      else target[key] = pullId;
    }
    syncRoomAt(state, roomIndexFor(state, roomId));
  },
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
