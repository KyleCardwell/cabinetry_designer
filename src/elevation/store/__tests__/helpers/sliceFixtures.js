import {
  DEFAULT_SETTINGS,
  DEFAULT_PREFS,
} from '../../../model/constants.js';

// The shared builders live in src/test/builders.js; re-exported so existing imports keep working.
export { auto, fixed, opening, pin, run } from '../../../../test/builders.js';

export function stateWithRun(existingRun = null) {
  return {
    schemaVersion: 3,
    prefs: { ...DEFAULT_PREFS },
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
        id: 'wall-1',
        name: 'Wall 1',
        x1: 0,
        y1: 0,
        x2: 144,
        y2: 0,
        height: 96,
        thickness: 4.5,
        flipped: false,
        connections: { start: null, end: null },
        profile: {},
        runs: existingRun ? [existingRun] : [],
        openings: [],
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    view: 'elevation',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

export function currentOpening(state) {
  return state.rooms[0].walls[0].openings[0];
}

export function currentRun(state) {
  return state.rooms[0].walls[0].runs[0];
}

