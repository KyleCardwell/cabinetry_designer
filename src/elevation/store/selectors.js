import { createSelector } from '@reduxjs/toolkit';
import { effectiveSettings } from '../model/effectiveSettings.js';

export const selectSettings = createSelector(
  [
    (state) => state.elevation.settings,
    (state) => state.elevation.prefs,
    (state) => state.elevation.rooms.find((room) => room.id === state.elevation.activeRoomId) ?? null,
  ],
  (settings, prefs, room) => effectiveSettings({ settings, prefs }, room),
);
