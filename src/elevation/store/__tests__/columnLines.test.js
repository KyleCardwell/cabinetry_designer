import { describe, expect, it } from 'vitest';
import { attach, auto, line, opening, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { runItems } from '../../model/grid.js';
import { splitOptionsForRun } from '../../model/placement.js';
import { syncRoom } from '../../model/roomSync.js';
import { splitRun } from '../../model/splitRun.js';
import elevationReducer, {
  attachColumnToNewLine,
  attachColumnToOpening,
  createInitialElevationState,
  setAttachment,
  setItemPin,
} from '../elevationSlice.js';

// LL4 a: attaching root columns to layout lines from the store.

const at = { roomId: 'room-1', wallId: 'H' };
const NONE = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };

function initial({ lines = [], openings = [], runOverrides = {}, count = 3 } = {}) {
  const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, count).map(auto);
  const r = run({ id: 'R', x: 0, width: count * 30, ends: NONE, items, ...runOverrides });
  return {
    ...createInitialElevationState(null), activeRoomId: 'room-1', activeWallId: 'H',
    // Stored rooms are always synced (an attached window sits on its line).
    rooms: [syncRoom(room({ walls: [wall({ id: 'H', x2: 240, lines, openings, runs: [r] })] }), DEFAULT_SETTINGS)],
  };
}

const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const wallOf = (state) => state.rooms[0].walls[0];
const runOf = (state) => wallOf(state).runs[0];
const itemOf = (state, id) => runItems(runOf(state)).find((item) => item.id === id);

function pieces(state) {
  const r = state.rooms[0];
  const w = r.walls[0];
  const layout = splitRun(w.runs[0], DEFAULT_SETTINGS, splitOptionsForRun(r, w, w.runs[0], DEFAULT_SETTINGS));
  return Object.fromEntries(layout.pieces.map((piece) => [piece.id, piece]));
}
const centre = (piece) => piece.x + piece.width / 2;
const windowAt = (overrides = {}) => opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 36, height: 40, ...overrides });

describe('LL4 a column attach actions', () => {
  it('4. a new line through a column changes nothing else', () => {
    const start = reduce(initial());
    const before = pieces(start);
    const state = reduce(start, attachColumnToNewLine({ ...at, runId: 'R', itemId: 'B', id: 'N' }));
    expect(wallOf(state).lines).toEqual([{ id: 'N', label: 'L1', from: 'left', value: 45 }]);
    expect(itemOf(state, 'B').attach).toEqual(attach('N'));
    expect(runOf(state).autoCount).toBe(false);
    const after = pieces(state);
    for (const id of ['A', 'B', 'C']) expect(after[id]).toMatchObject({ x: before[id].x, width: before[id].width });
  });

  it('uses the nearer end and the back face for a back-face run', () => {
    const state = reduce(
      initial({ runOverrides: { x: 150, wallSide: 'back' } }),
      attachColumnToNewLine({ ...at, runId: 'R', itemId: 'C', at: 'right', id: 'N' }),
    );
    expect(wallOf(state).lines).toEqual([{ id: 'N', label: 'L1', wallSide: 'back', from: 'right', value: 0 }]);
  });

  it('5. Centre on W1 makes a line through the window and centres the column on it', () => {
    const state = reduce(
      initial({ openings: [windowAt()], count: 4 }),
      attachColumnToOpening({ ...at, runId: 'R', itemId: 'B', openingId: 'W', id: 'N' }),
    );
    expect(wallOf(state).lines).toEqual([{ id: 'N', label: 'L1', from: 'left', value: 42 }]);
    expect(wallOf(state).openings[0].attach).toEqual(attach('N'));
    expect(wallOf(state).openings[0].offset).toBe(24);
    expect(itemOf(state, 'B').attach).toEqual(attach('N'));
    expect(centre(pieces(state).B)).toBeCloseTo(42, 9);
  });

  it('6. Centre on W1 reuses the window line with the centre as offset', () => {
    const state = reduce(
      initial({ openings: [windowAt({ attach: attach('L1', 'left') })], lines: [line('L1', 100)], count: 8 }),
      attachColumnToOpening({ ...at, runId: 'R', itemId: 'B', openingId: 'W', id: 'N' }),
    );
    expect(wallOf(state).lines).toHaveLength(1);
    expect(itemOf(state, 'B').attach).toEqual(attach('L1', 'center', 18));
    expect(centre(pieces(state).B)).toBeCloseTo(118, 9);
  });

  it('7. a second attached column locks both widths to the current split', () => {
    const lines = [line('L1', 45), line('L2', 75)];
    const first = reduce(
      initial({ lines, count: 4, runOverrides: { width: 120 } }),
      setAttachment({ ...at, target: { kind: 'column', runId: 'R', itemId: 'B' }, attach: attach('L1') }),
    );
    expect(itemOf(first, 'B').width).toBeNull();
    expect(runOf(first).autoCount).toBe(false);
    const current = pieces(first);
    const state = reduce(first, setAttachment({
      ...at, target: { kind: 'column', runId: 'R', itemId: 'C' }, attach: attach('L2'),
    }));
    expect(itemOf(state, 'B').width).toBe(current.B.width);
    expect(itemOf(state, 'C').width).toBe(current.C.width);
  });

  it('8. refuses a window on a back-face line for a front run', () => {
    const start = initial({
      openings: [windowAt({ attach: attach('B1') })],
      lines: [line('B1', 100, { wallSide: 'back' })],
    });
    const state = reduce(start, attachColumnToOpening({ ...at, runId: 'R', itemId: 'B', openingId: 'W', id: 'N' }));
    expect(itemOf(state, 'B').attach).toBeUndefined();
    expect(state.message).toBe('W1 is on a back-face line. Attach the cabinet to a line on this face.');
  });

  it('a pin is refused on an attached column', () => {
    const start = reduce(initial({ lines: [line('L1', 45)] }), setAttachment({
      ...at, target: { kind: 'column', runId: 'R', itemId: 'B' }, attach: attach('L1'),
    }));
    const state = reduce(start, setItemPin({
      ...at, runId: 'R', itemId: 'B', pin: { anchor: 'center', from: 'left', openingId: null, openingAnchor: 'center', value: 10 },
    }));
    expect(itemOf(state, 'B').pin).toBeUndefined();
  });
});
