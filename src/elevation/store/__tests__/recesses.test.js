import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import elevationReducer, {
  clearSelection,
  createInitialElevationState,
  setSelection,
} from '../elevationSlice.js';

function stateWith(runs = [], wallExtra = {}) {
  return {
    schemaVersion: 4,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      walls: [{
        id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
        ...wallExtra,
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    activeWallSide: 'front',
    view: 'elevation',
    selection: {
      runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

describe('SPEC-38 recesses in the store', () => {
  it('selects a recess and nothing else', () => {
    expect(createInitialElevationState(null).selection.recessId).toBeNull();
    let state = elevationReducer(stateWith(), setSelection({ runId: 'run-1', recessId: 'R' }));
    expect(state.selection).toMatchObject({ recessId: 'R', runId: null, openingId: null, soffitId: null });
    state = elevationReducer(state, setSelection({ openingId: 'D', recessId: 'R' }));
    expect(state.selection).toMatchObject({ openingId: 'D', recessId: null });
    state = elevationReducer(state, setSelection({ recessId: 'R' }));
    state = elevationReducer(state, clearSelection());
    expect(state.selection.recessId).toBeNull();
  });
});
