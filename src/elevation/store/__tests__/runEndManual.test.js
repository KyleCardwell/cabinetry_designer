import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { joinedRooms } from '../../model/__tests__/helpers/joinedRooms.js';
import elevationReducer, { setRunEnd } from '../elevationSlice.js';

function state() {
  return {
    schemaVersion: 4,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [joinedRooms('wall-1')],
    activeRoomId: 'room',
    activeWallId: 'wall-1',
    activeWallSide: 'front',
    view: 'elevation',
    selection: { runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1' },
    tool: 'select',
    message: null,
  };
}

describe('SPEC-38.3 a chosen end sticks on a joined run', () => {
  it('keeps a filler chosen for a joined end through the sync', () => {
    const next = elevationReducer(state(), setRunEnd({
      wallId: 'wall-1', runId: 'R', side: 'left', end: { type: 'filler', width: null },
    }));
    expect(next.rooms[0].walls[0].runs.find(({ id }) => id === 'R').ends.left)
      .toEqual({ type: 'filler', width: null });
  });
});
