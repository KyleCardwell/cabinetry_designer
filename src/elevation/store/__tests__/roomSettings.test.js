import { createNextState } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { runItems } from '../../model/grid.js';
import { cloneRoom } from '../../model/roomClone.js';
import elevationReducer, {
  addItemAfter,
  createInitialElevationState,
  setRoomSetting,
  updateSettings,
} from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY,
  isElevationDocument,
  loadElevationDocument,
  toElevationDocument,
} from '../persistence.js';
import { settingsFor } from '../slices/helpers.js';
import { run, stateWithRun } from './helpers/sliceFixtures.js';

afterEach(() => vi.unstubAllGlobals());

function twoRooms() {
  const state = stateWithRun(run({ autoCount: false }));
  state.rooms[0].settingsOverrides = { defaultInteriorFillerWidth: 2 };
  state.rooms.push({ ...cloneRoom(state.rooms[0]), id: 'room-2' });
  delete state.rooms[1].settingsOverrides;
  state.settings.defaultInteriorFillerWidth = 3;
  return state;
}

function addFiller(state, room) {
  return elevationReducer(state, addItemAfter({
    roomId: room.id, wallId: 'wall-1', runId: 'run-1', kind: 'filler', itemId: null,
  }));
}

describe('DB1 d room settings overrides', () => {
  it('adds fillers at width 2 in room A and the team width 3 in room B (anchor 1)', () => {
    let state = twoRooms();
    for (const room of state.rooms) state = addFiller(state, room);
    expect(state.rooms.map((room) => runItems(room.walls[0].runs[0])[0].width)).toEqual([2, 3]);
  });

  it('keeps room A pinned at 2 while room B follows the team to 4 (anchor 4)', () => {
    let state = elevationReducer(twoRooms(), updateSettings({ defaultInteriorFillerWidth: 4 }));
    for (const room of state.rooms) state = addFiller(state, room);
    expect(state.rooms.map((room) => runItems(room.walls[0].runs[0])[0].width)).toEqual([2, 4]);
    state = elevationReducer(state, setRoomSetting({
      roomId: 'room-2', key: 'defaultInteriorFillerWidth', value: 4,
    }));
    state = elevationReducer(state, updateSettings({ defaultInteriorFillerWidth: 5 }));
    expect(settingsFor(state, state.rooms[1]).defaultInteriorFillerWidth).toBe(4);
    expect(state.rooms[1].settingsOverrides).toEqual({ defaultInteriorFillerWidth: 4 });
  });

  it('ignores team-only, managed, unknown and ill-typed edits without changing state (anchor 2)', () => {
    const state = twoRooms();
    for (const [key, value] of [
      ['doorPanelDefault', 0.75], ['doorPanelDefault', null],
      ['maxCabinetWidth', 30], ['defaultProfile.wallHeight', 100],
      ['faceReveals.1.top', 1], ['defaultStyle.beadWidth', 1],
      ['bogus', 1], ['plotScale', 32], ['teamDoorStyle', {}],
      ['insetFrame', { stile: 1 }], ['roundTo', '0.25'], ['roundTo', Infinity],
      ['roundTo', NaN], ['openingsHaveCasing', 1], ['defaultEnds.left', 'invalid'],
      ['__proto__.polluted', true], [undefined, 1],
    ]) expect(elevationReducer(state, setRoomSetting({ roomId: 'room-1', key, value }))).toBe(state);
    expect(elevationReducer(state, setRoomSetting({ roomId: 'missing', key: 'roundTo', value: 1 }))).toBe(state);
  });

  it('sets and clears nested leaves, prunes empty parents and syncs only that room (anchor 3)', () => {
    const initial = twoRooms();
    delete initial.rooms[0].settingsOverrides;
    let state = elevationReducer(initial, setRoomSetting({ roomId: 'room-1', key: 'insetFrame.stile', value: 1 }));
    expect(state.rooms[0].settingsOverrides).toEqual({ insetFrame: { stile: 1 } });
    expect(state.rooms[1]).toBe(initial.rooms[1]);
    state = elevationReducer(state, setRoomSetting({ roomId: 'room-1', key: 'insetFrame.stile', value: null }));
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
    for (const [key, value] of [['insetFrame.stile', 1], ['insetFrame.rail', 2], ['roundTo', 0.25]]) {
      state = elevationReducer(state, setRoomSetting({ roomId: 'room-1', key, value }));
    }
    for (const key of ['insetFrame.stile', 'insetFrame.rail']) {
      state = elevationReducer(state, setRoomSetting({ roomId: 'room-1', key, value: undefined }));
    }
    expect(state.rooms[0].settingsOverrides).toEqual({ roundTo: 0.25 });
    state = elevationReducer(state, setRoomSetting({ roomId: 'room-1', key: 'roundTo', value: undefined }));
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
  });

  it('cleans stored overrides, rejects non-object containers and round-trips valid leaves (anchor 5)', () => {
    const document = toElevationDocument(createInitialElevationState(null));
    document.rooms[0].settingsOverrides = { roundTo: 0.25, bogus: 1 };
    vi.stubGlobal('window', { localStorage: {
      getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(document) : null,
    } });
    expect(loadElevationDocument().rooms[0].settingsOverrides).toEqual({ roundTo: 0.25 });
    Object.assign(document.rooms[0].settingsOverrides, {
      doorPanelDefault: 0.75, maxCabinetWidth: 30, defaultProfile: { wallHeight: 100 },
      insetFrame: { stile: 1, rail: 'bad' }, plotScale: 32,
    });
    const loaded = loadElevationDocument();
    expect(loaded.rooms[0].settingsOverrides).toEqual({ roundTo: 0.25, insetFrame: { stile: 1 } });
    expect(toElevationDocument(createInitialElevationState(loaded)).rooms[0].settingsOverrides)
      .toEqual(loaded.rooms[0].settingsOverrides);
    for (const invalid of [null, [], 1, 'invalid', new Date()]) {
      document.rooms[0].settingsOverrides = invalid;
      expect(isElevationDocument(document)).toBe(false);
      expect(loadElevationDocument()).toBeNull();
    }
    document.rooms[0].settingsOverrides = { bogus: 1 };
    expect(loadElevationDocument().rooms[0]).not.toHaveProperty('settingsOverrides');
    delete document.rooms[0].settingsOverrides;
    expect(isElevationDocument(document)).toBe(true);
    expect(loadElevationDocument().rooms[0]).not.toHaveProperty('settingsOverrides');
  });

  it('clones overrides deeply so either room can be edited independently (anchor 6)', () => {
    const room = twoRooms().rooms[0];
    room.settingsOverrides.insetFrame = { stile: 1 };
    const copy = cloneRoom(room);
    expect(copy.settingsOverrides).toEqual(room.settingsOverrides);
    copy.settingsOverrides.insetFrame.stile = 2;
    expect(room.settingsOverrides.insetFrame.stile).toBe(1);
    room.settingsOverrides.defaultInteriorFillerWidth = 4;
    expect(copy.settingsOverrides.defaultInteriorFillerWidth).toBe(2);
    expect(cloneRoom(twoRooms().rooms[1])).not.toHaveProperty('settingsOverrides');
  });

  it('resolves leaves and profiles under prefs and caches by each settings input', () => {
    const state = twoRooms();
    const room = state.rooms[0];
    room.profile = { wallHeight: 104 };
    room.settingsOverrides = {
      ...room.settingsOverrides, insetFrame: { stile: 1 },
      defaultProfile: { wallHeight: 999 }, doorPanelDefault: 999, plotScale: 1,
    };
    const first = effectiveSettings(state, room);
    expect(first).toMatchObject({
      defaultInteriorFillerWidth: 2, insetFrame: { ...state.settings.insetFrame, stile: 1 },
      defaultProfile: { ...state.settings.defaultProfile, wallHeight: 104 },
      doorPanelDefault: state.settings.doorPanelDefault, plotScale: state.prefs.plotScale,
      teamDoorStyle: state.settings.teamDoorStyle,
    });
    expect(effectiveSettings({ ...state, message: 'Saved' }, { ...room, name: 'Renamed' })).toBe(first);
    effectiveSettings(state, state.rooms[1]);
    expect(effectiveSettings(state, room)).toBe(first);
    const settings = { ...state.settings, roundTo: 0.25 };
    expect(effectiveSettings({ ...state, settings }, room)).toMatchObject({ roundTo: 0.25 });
    expect(effectiveSettings({ ...state, settings }, room)).not.toBe(first);
    expect(effectiveSettings(state, { ...room, settingsOverrides: { defaultInteriorFillerWidth: 6 } }))
      .toMatchObject({ defaultInteriorFillerWidth: 6 });
    expect(effectiveSettings(state, { ...room, profile: { wallHeight: 110 } }).defaultProfile.wallHeight).toBe(110);
    expect(effectiveSettings({ ...state, prefs: { ...state.prefs, plotScale: 32 } }, room).plotScale).toBe(32);
  });

  it('observes repeated edits inside a reducer and returns plain settings usable after it finishes', () => {
    const state = twoRooms();
    let resolved;
    createNextState(state, (draft) => {
      const room = draft.rooms[0];
      expect(settingsFor(draft, room).defaultInteriorFillerWidth).toBe(2);
      room.settingsOverrides.defaultInteriorFillerWidth = 6;
      expect(settingsFor(draft, room).defaultInteriorFillerWidth).toBe(6);
      draft.settings.insetFrame = { ...draft.settings.insetFrame, rail: 3 };
      room.profile.wallHeight = 110;
      draft.prefs.plotScale = 32;
      resolved = settingsFor(draft, room);
    });
    expect(resolved).toMatchObject({
      defaultInteriorFillerWidth: 6, insetFrame: { rail: 3 },
      defaultProfile: { wallHeight: 110 }, plotScale: 32,
    });
  });
});
