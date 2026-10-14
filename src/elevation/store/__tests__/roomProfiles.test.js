import { afterEach, describe, expect, it, vi } from 'vitest';
import elevationReducer, {
  addRoom,
  addWall,
  addWallSegment,
  createInitialElevationState,
  updateRoomProfile,
  updateSettings,
} from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY,
  isElevationDocument,
  loadElevationDocument,
  toElevationDocument,
} from '../persistence.js';
import { settingsFor } from '../slices/helpers.js';

afterEach(() => vi.unstubAllGlobals());

function storeDocument(document) {
  vi.stubGlobal('window', { localStorage: {
    getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(document) : null,
  } });
}

describe('DB1 e room profile overrides', () => {
  it('starts initial and added rooms empty and resolves the team wall height 96 (anchor 1)', () => {
    const state = elevationReducer(createInitialElevationState(null), addRoom({ name: 'Room 2' }));
    expect(state.settings.defaultProfile.wallHeight).toBe(96);
    for (const room of state.rooms) {
      expect(room.profile).toEqual({});
      expect(settingsFor(state, room).defaultProfile.wallHeight).toBe(96);
    }
  });

  it('follows team height 108 while a room pinned at 100 keeps its override (anchor 2)', () => {
    let state = elevationReducer(createInitialElevationState(null), addRoom());
    const roomId = state.rooms[1].id;
    state = elevationReducer(state, updateRoomProfile({ roomId, key: 'wallHeight', value: 100 }));
    state = elevationReducer(state, updateSettings({ defaultProfile: { wallHeight: 108 } }));
    expect(state.rooms.map((room) => settingsFor(state, room).defaultProfile.wallHeight)).toEqual([108, 100]);
    // A deliberate edit equal to the inherited value still pins during editing.
    state = elevationReducer(state, updateRoomProfile({ roomId, key: 'wallHeight', value: 108 }));
    state = elevationReducer(state, updateSettings({ defaultProfile: { wallHeight: 110 } }));
    expect(settingsFor(state, state.rooms[1]).defaultProfile.wallHeight).toBe(108);
  });

  it('stores height 100 then deletes it on null, and clears every key on null or undefined (anchor 3)', () => {
    let state = createInitialElevationState(null);
    const roomId = state.rooms[0].id;
    state = elevationReducer(state, updateRoomProfile({ roomId, key: 'wallHeight', value: 100 }));
    expect(state.rooms[0].profile).toEqual({ wallHeight: 100 });
    state = elevationReducer(state, updateRoomProfile({ roomId, key: 'wallHeight', value: null }));
    expect(state.rooms[0].profile).toEqual({});
    for (const value of [null, undefined]) {
      state = elevationReducer(state, updateRoomProfile({
        roomId, changes: { ...state.settings.defaultProfile },
      }));
      state = elevationReducer(state, updateRoomProfile({
        roomId, changes: Object.fromEntries(Object.keys(state.settings.defaultProfile).map((key) => [key, value])),
      }));
      expect(state.rooms[0].profile).toEqual({});
      expect(settingsFor(state, state.rooms[0]).defaultProfile.wallHeight).toBe(96);
    }
  });

  it('loads a full copy as only upperClearance 20 against the team 18 (anchor 4)', () => {
    let state = createInitialElevationState(null);
    state = elevationReducer(state, updateSettings({ defaultProfile: { wallHeight: 108, upperClearance: 18 } }));
    state = elevationReducer(state, addWall());
    const document = toElevationDocument(state);
    document.rooms[0].profile = { ...document.settings.defaultProfile, upperClearance: 20 };
    document.rooms[0].walls[0].profile = { wallHeight: 108 };
    storeDocument(document);
    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].profile).toEqual({ upperClearance: 20 });
    expect(loaded.rooms[0].walls[0].profile).toEqual({ wallHeight: 108 });
    expect(document.rooms[0].profile).toEqual({ ...document.settings.defaultProfile, upperClearance: 20 });
    const restored = createInitialElevationState(loaded);
    expect(toElevationDocument(restored).rooms[0].profile).toEqual({ upperClearance: 20 });
    expect(settingsFor(restored, restored.rooms[0]).defaultProfile).toMatchObject({ wallHeight: 108, upperClearance: 20 });
  });

  it('adds walls and segments at override height 100 or the resolved team height (anchor 5)', () => {
    for (const add of [addWall, addWallSegment]) {
      for (const [profile, expected] of [[{}, 108], [{ wallHeight: 100 }, 100]]) {
        let state = createInitialElevationState(null);
        state = elevationReducer(state, updateSettings({ defaultProfile: { wallHeight: 108 } }));
        state = elevationReducer(state, updateRoomProfile({ roomId: state.rooms[0].id, changes: profile }));
        state = elevationReducer(state, add({ x1: 0, y1: 0, x2: 144, y2: 0 }));
        expect(state.rooms[0].walls[0].height).toBe(expected);
        state = elevationReducer(state, add({ height: 90, x1: 0, y1: 60, x2: 144, y2: 60 }));
        expect(state.rooms[0].walls[1].height).toBe(90);
      }
    }
  });

  it('accepts empty and partial profiles and rejects invalid containers, keys and values', () => {
    const document = toElevationDocument(createInitialElevationState(null));
    storeDocument(document);
    for (const profile of [{}, { wallHeight: 100 }, { crownProfileId: 'crown', furnitureBaseProud: 0 }]) {
      document.rooms[0].profile = profile;
      expect(isElevationDocument(document)).toBe(true);
      expect(loadElevationDocument().rooms[0].profile).toEqual(profile);
    }
    for (const profile of [null, [], 1, 'invalid', { bogus: 96 }, { wallHeight: '100' }, { baseKind: 'bad' }]) {
      document.rooms[0].profile = profile;
      expect(isElevationDocument(document)).toBe(false);
      expect(loadElevationDocument()).toBeNull();
    }
  });
});
