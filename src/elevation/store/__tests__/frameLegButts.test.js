import { expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { cloneRoom } from '../../model/roomClone.js';
import elevationReducer, { createInitialElevationState, setRunEnd } from '../elevationSlice.js';
import { isElevationDocument, toElevationDocument } from '../persistence.js';

it('stores frame choices only on run end panels and copies them with the room (SH7.7)', () => {
  const target = { wallId: 'wall-1', runId: 'R', side: 'left' };
  const initial = createInitialElevationState({
    rooms: [room({ walls: [wall({ runs: [run({ id: 'R', width: 36, autoCount: false,
      items: [auto('cabinet')], ends: { left: { type: 'end_panel' }, right: { type: 'none' } },
    })] })] })],
    activeRoomId: 'room-1', activeWallId: 'wall-1',
  });
  const leftEnd = (state) => state.rooms[0].walls[0].runs[0].ends.left;
  const chosen = elevationReducer(initial, setRunEnd({ ...target,
    end: { type: 'end_panel', width: null, frame: 'butt' } }));
  expect(leftEnd(chosen).frame).toBe('butt');
  const resized = elevationReducer(chosen, setRunEnd({ ...target,
    end: { type: 'end_panel', width: 1 } }));
  expect(leftEnd(resized).frame).toBe('butt');
  const copy = cloneRoom(chosen.rooms[0]).walls[0].runs[0].ends.left;
  expect(copy.frame).toBe('butt');
  expect(copy).not.toBe(leftEnd(chosen));
  const saved = structuredClone(toElevationDocument(chosen));
  expect(isElevationDocument(saved)).toBe(true);
  saved.rooms[0].walls[0].runs[0].ends.left.frame = 'unknown';
  expect(isElevationDocument(saved)).toBe(false);
  saved.rooms[0].walls[0].runs[0].ends.left = { type: 'none', width: null, frame: 'butt' };
  expect(isElevationDocument(saved)).toBe(false);
  const filler = elevationReducer(chosen, setRunEnd({ ...target,
    end: { type: 'filler', width: null } }));
  expect(leftEnd(filler)).not.toHaveProperty('frame');
  const automatic = elevationReducer(chosen, setRunEnd({ ...target,
    end: { type: 'end_panel', width: null, frame: null } }));
  expect(leftEnd(automatic)).not.toHaveProperty('frame');
});
