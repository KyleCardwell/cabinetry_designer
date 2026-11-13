import { createSelector } from '@reduxjs/toolkit';
import { effectiveSettings } from '../model/effectiveSettings.js';

export const selectSettings = createSelector(
  [
    (state) => state.elevation.settings,
    (state) => state.elevation.prefs,
    (state) => state.elevation.layers,
    (state) => state.elevation.rooms.find((room) => room.id === state.elevation.activeRoomId) ?? null,
  ],
  (settings, prefs, layers, room) => effectiveSettings({ settings, prefs, layers }, room),
);

export const selectClipboard = (state) => state.elevation.clipboard ?? null;

const LAYER_RANK = { team: 0, project: 1, phase: 2, room: 3 };

/**
 * The layers a value set at `level` inherits from, shop standard first:
 * `[{ level: 'team', values }, { level: 'project', id, values }?, { level: 'phase', id, values }?]`.
 */
export function inheritedChain(elevation, level = 'room') {
  const rank = LAYER_RANK[level] ?? LAYER_RANK.room;
  const chain = [{ level: 'team', values: elevation.settings }];
  for (const name of ['project', 'phase']) {
    const layer = elevation.layers?.[name];
    if (layer && LAYER_RANK[name] < rank) chain.push({ level: name, id: layer.id, values: layer.values });
  }
  return chain;
}

export const selectRoomInheritedChain = createSelector(
  [(state) => state.elevation.settings, (state) => state.elevation.layers],
  (settings, layers) => inheritedChain({ settings, layers }, 'room'),
);
