import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { runItems } from '../../model/grid.js';
import { splitOptionsForRun } from '../../model/placement.js';
import { stretchRun } from '../../model/runMoves.js';
import { syncRoom } from '../../model/roomSync.js';
import { splitRun } from '../../model/splitRun.js';
import elevationReducer, {
  createInitialElevationState,
  lockItem,
  replaceRun,
  resizeRun,
  setItemWidth,
  setRunWidthFrom,
  updateRun,
} from '../elevationSlice.js';

// LL6 b: typed cabinet widths turn width from cabinets on; a typed run width turns it off.

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const at = { roomId: 'room-1', wallId: 'H', runId: 'S' };

function initial(overrides = {}, items = [fixed('A', 30), auto('B')]) {
  const s = run({
    id: 'S', x: 0, width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'filler', width: null }, right: { type: 'none', width: null } },
    items, ...overrides,
  });
  const state = createInitialElevationState(null);
  return {
    ...state, settings: { ...state.settings, runFlex: 0 }, activeRoomId: 'room-1', activeWallId: 'H',
    rooms: [syncRoom(room({ walls: [wall({ id: 'H', x2: 120, runs: [s] })] }), settings)],
  };
}

const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const runOf = (state) => state.rooms[0].walls[0].runs[0];
function pieces(state) {
  const r = state.rooms[0];
  const w = r.walls[0];
  const layout = splitRun(w.runs[0], settings, splitOptionsForRun(r, w, w.runs[0], settings));
  return Object.fromEntries(layout.pieces.map((piece) => [piece.role === 'item' ? piece.id : piece.role, piece]));
}
const typedB = () => reduce(initial(), setItemWidth({ ...at, itemId: 'B', width: 24 }));

describe('width from cabinets on and off (LL6)', () => {
  it('typing the last auto width turns it on and shrinks the run', () => {
    const state = typedB();
    expect(runOf(state)).toMatchObject({ widthFrom: 'cells', width: 55.5 });
    expect(pieces(state)['end-left'].width).toBe(1.5);
  });

  it('no free end leaves it off', () => {
    const state = reduce(initial({ anchors: { left: true, right: true } }), setItemWidth({ ...at, itemId: 'B', width: 24 }));
    expect(runOf(state).widthFrom).toBeUndefined();
    expect(runOf(state).width).toBe(120);
  });

  it('another auto left leaves it off', () => {
    const state = reduce(initial({}, [fixed('A', 30), auto('B'), auto('C')]), setItemWidth({ ...at, itemId: 'B', width: 24 }));
    expect(runOf(state).widthFrom).toBeUndefined();
    expect(runOf(state).width).toBe(80);
  });

  it('clearing a width keeps the flag and the width', () => {
    const state = reduce(typedB(), setItemWidth({ ...at, itemId: 'B', width: null }));
    expect(runOf(state)).toMatchObject({ widthFrom: 'cells', width: 55.5 });
    expect(pieces(state).B.width).toBe(24);
  });

  it('a typed run width turns it off; the filler takes the rest', () => {
    const state = reduce(typedB(), updateRun({ ...at, changes: { width: 70 } }));
    expect(runOf(state).widthFrom).toBeUndefined();
    expect(runOf(state).width).toBe(70);
    expect(pieces(state)['end-left'].width).toBe(16);
  });

  it('stretching or resizing the run turns it off', () => {
    const base = typedB();
    const stretched = stretchRun(base.rooms[0], 'H', 'S', 'right', 60, settings, { exact: true });
    expect(stretched.ok).toBe(true);
    const after = reduce(base, replaceRun({ ...at, run: stretched.room.walls[0].runs[0] }));
    expect(runOf(after).widthFrom).toBeUndefined();
    expect(runOf(after).width).toBe(60);
    const resized = reduce(base, resizeRun({ ...at, width: 60, grow: 'right' }));
    expect(runOf(resized).widthFrom).toBeUndefined();
    expect(runOf(resized).width).toBe(60);
  });

  it('the toggle turns it off, and is ignored while blocked', () => {
    const off = reduce(typedB(), setRunWidthFrom({ ...at, value: null }));
    expect(runOf(off).widthFrom).toBeUndefined();
    expect(runOf(off).width).toBe(55.5);
    const blocked = initial();
    expect(reduce(blocked, setRunWidthFrom({ ...at, value: 'cells' }))).toEqual(blocked);
    const on = reduce(initial({}, [fixed('A', 30), fixed('B', 24)]), setRunWidthFrom({ ...at, value: 'cells' }));
    expect(runOf(on)).toMatchObject({ widthFrom: 'cells', width: 55.5 });
  });

  it('lock leaves the flag alone', () => {
    const state = reduce(typedB(), lockItem({ ...at, itemId: 'A', width: 30 }));
    expect(runOf(state).widthFrom).toBe('cells');
    expect(runItems(runOf(state)).map(({ width }) => width)).toEqual([30, 24]);
  });
});
