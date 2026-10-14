import { readFileSync } from 'node:fs';
import { createNextState } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { toDrawingPayload } from '../../model/drawingPayload.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { syncRoom } from '../../model/room.js';
import { createInitialElevationState } from '../elevationSlice.js';
import { normalizeElevationDocument } from '../persistence.js';
import { selectSettings } from '../selectors.js';
import { settingsFor } from '../slices/helpers.js';

describe('DB1 b room settings entry points', () => {
  it('returns the original settings for any room, including inside reducers (anchor 1)', () => {
    const state = {
      settings: { ...DEFAULT_SETTINGS },
      prefs: { orthoWalls: false },
      rooms: [{ id: 'kitchen' }, { id: 'bath' }],
    };
    for (const room of [...state.rooms, null, undefined]) {
      expect(effectiveSettings(state, room)).toBe(state.settings);
      expect(settingsFor(state, room)).toBe(state.settings);
    }
    createNextState(state, (draft) => {
      expect(settingsFor(draft, draft.rooms[1])).toBe(draft.settings);
    });
    expect(state.settings.orthoWalls).toBe(DEFAULT_SETTINGS.orthoWalls);
  });

  it('memoizes active room settings across repeated and unrelated state changes (anchor 2)', () => {
    const elevation = {
      settings: { ...DEFAULT_SETTINGS },
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
    expect(selectSettings({ elevation: { ...elevation, settings } })).toBe(settings);
    expect(selectSettings({ elevation: { ...elevation, activeRoomId: 'bath' } })).toBe(first);
    expect(selectSettings({ elevation: { ...elevation, rooms: [], activeRoomId: null } })).toBe(first);
  });

  it('preserves every golden room drawing payload through initialization and selection (anchor 3)', () => {
    const document = normalizeElevationDocument(JSON.parse(readFileSync(
      new URL('../../model/__tests__/fixtures/golden.json', import.meta.url),
      'utf8',
    )));
    const elevation = createInitialElevationState(document);
    for (const room of document.rooms) {
      const expected = toDrawingPayload(syncRoom(room, document.settings), document.settings);
      const state = { elevation: { ...elevation, activeRoomId: room.id } };
      const initialized = elevation.rooms.find((candidate) => candidate.id === room.id);
      expect(toDrawingPayload(initialized, selectSettings(state))).toEqual(expected);
    }
  });
});
