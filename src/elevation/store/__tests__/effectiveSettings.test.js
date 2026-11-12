import { createNextState } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { selectSettings } from '../selectors.js';
import { settingsFor } from '../slices/helpers.js';

describe('room settings entry points (DB1)', () => {
  it('lays prefs over settings for any room, including inside reducers', () => {
    const state = {
      settings: { ...DEFAULT_SETTINGS },
      prefs: { ...DEFAULT_PREFS, orthoWalls: false },
      rooms: [{ id: 'kitchen' }, { id: 'bath' }],
    };
    for (const room of [...state.rooms, null, undefined]) {
      expect(effectiveSettings(state, room)).toEqual({ ...state.settings, ...state.prefs });
      expect(settingsFor(state, room)).toEqual({ ...state.settings, ...state.prefs });
    }
    createNextState(state, (draft) => {
      expect(settingsFor(draft, draft.rooms[1]).orthoWalls).toBe(false);
    });
    expect(state.settings).not.toHaveProperty('orthoWalls');
  });

  it('memoizes active room settings across repeated and unrelated state changes', () => {
    const elevation = {
      settings: { ...DEFAULT_SETTINGS },
      prefs: { ...DEFAULT_PREFS },
      rooms: [{ id: 'kitchen' }, { id: 'bath' }],
      activeRoomId: 'kitchen',
    };
    const state = { elevation };
    const first = selectSettings(state);
    const recomputations = selectSettings.recomputations();
    expect(selectSettings(state)).toBe(first);
    expect(selectSettings({ elevation: { ...elevation, message: 'Saved' } })).toBe(first);
    expect(selectSettings.recomputations()).toBe(recomputations);
    const settings = { ...elevation.settings, roundTo: 0.25 };
    expect(selectSettings({ elevation: { ...elevation, settings } })).toEqual({ ...settings, ...elevation.prefs });
    expect(selectSettings({ elevation: { ...elevation, prefs: { ...elevation.prefs, plotScale: 32 } } }).plotScale).toBe(32);
    expect(selectSettings({ elevation: { ...elevation, activeRoomId: 'bath' } })).toEqual(first);
    expect(selectSettings({ elevation: { ...elevation, rooms: [], activeRoomId: null } })).toEqual(first);
  });

});
