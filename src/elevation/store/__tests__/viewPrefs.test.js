import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../model/constants.js';
import { toDrawingPayload } from '../../model/drawingPayload.js';
import elevationReducer, {
  centerRoomOnOrigin,
  createInitialElevationState,
  setPref,
  updateSettings,
} from '../elevationSlice.js';
import { createWall, settingsFor } from '../slices/helpers.js';

describe('DB1 c view preferences', () => {
  it('starts with the seven defaults and sends scale and paper through settingsFor (anchors 1 and 4)', () => {
    const state = createInitialElevationState(null);
    expect(state.prefs).toEqual({
      orthoWalls: true, showPartNumbers: false, plotScale: 24, paperSize: 'archD',
      planGrid: 0.5, openingSnap: 0.5, cornerSnapDistance: 3,
    });
    for (const key of Object.keys(DEFAULT_PREFS)) expect(state.settings).not.toHaveProperty(key);
    const room = state.rooms[0];
    expect(toDrawingPayload(room, settingsFor(state, room))).toMatchObject({ plotScale: 24, paperSize: 'archD' });
  });

  it('accepts only known prefs with the right types and listed choices (anchor 3)', () => {
    let state = createInitialElevationState(null);
    const original = state;
    state = elevationReducer(state, setPref({ key: 'plotScale', value: 20 }));
    expect(state).toBe(original);
    state = elevationReducer(state, setPref({ key: 'plotScale', value: 32 }));
    expect(state.prefs.plotScale).toBe(32);
    for (const [key, values] of [
      ['plotScale', ['32', 0, NaN]], ['paperSize', ['a4', null, 24]],
      ['orthoWalls', [0, null, 'false']], ['showPartNumbers', [1, undefined, 'true']],
      ...['planGrid', 'openingSnap', 'cornerSnapDistance'].map((key) => [key, [0, -1, Infinity, NaN, '2', null]]),
      ['roundTo', [1]], ['unknown', [true]], ['toString', [true]],
    ]) {
      for (const value of values) expect(elevationReducer(state, setPref({ key, value }))).toBe(state);
    }
    for (const [key, value] of Object.entries({
      orthoWalls: false, showPartNumbers: true, paperSize: 'ledger',
      planGrid: 1, openingSnap: 0.25, cornerSnapDistance: 6,
    })) state = elevationReducer(state, setPref({ key, value }));
    expect(state.prefs).toEqual({
      orthoWalls: false, showPartNumbers: true, plotScale: 32, paperSize: 'ledger',
      planGrid: 1, openingSnap: 0.25, cornerSnapDistance: 6,
    });
    expect(settingsFor(state, state.rooms[0])).toMatchObject(state.prefs);
  });

  it('ignores prefs in updateSettings while still applying saved settings', () => {
    const initial = createInitialElevationState(null);
    const state = elevationReducer(initial, updateSettings({
      ...DEFAULT_PREFS, orthoWalls: false, paperSize: 'letter', roundTo: 0.25,
    }));
    expect(state.prefs).toEqual(DEFAULT_PREFS);
    expect(state.settings.roundTo).toBe(0.25);
    for (const key of Object.keys(DEFAULT_PREFS)) expect(state.settings).not.toHaveProperty(key);
  });

  it('centers rooms using the current plan grid preference', () => {
    let state = createInitialElevationState(null);
    state.rooms[0].walls = [createWall('', 0, 9, { x1: 2, y1: 2, x2: 11, y2: 2 })];
    state = elevationReducer(state, setPref({ key: 'planGrid', value: 2 }));
    state = elevationReducer(state, centerRoomOnOrigin({ roomId: state.activeRoomId }));
    expect(state.rooms[0].walls[0]).toMatchObject({ x1: -4, y1: 0, x2: 5, y2: 0 });
  });
});
