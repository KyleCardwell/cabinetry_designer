import { describe, expect, it } from 'vitest';
import { attach, line, opening, room, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { openingGeometry } from '../../model/openings.js';
import elevationReducer, {
  attachOpeningToNewLine,
  createInitialElevationState,
  moveOpening,
  resizeOpening,
  setAttachment,
  setOpeningMeasureMode,
  setSelection,
  updateOpening,
} from '../elevationSlice.js';

const at = { roomId: 'room-1', wallId: 'H' };

function initial({ lines = [line('L1', 100)], window = {} } = {}) {
  const w = opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 36, height: 40, ...window });
  return {
    ...createInitialElevationState(null), activeRoomId: 'room-1', activeWallId: 'H',
    rooms: [room({ walls: [wall({ id: 'H', x2: 240, lines, openings: [w], runs: [] })] })],
  };
}

const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const wallOf = (state) => state.rooms[0].walls[0];
const windowOf = (state) => wallOf(state).openings[0];
const jambX = (state) => openingGeometry(windowOf(state), 240, DEFAULT_SETTINGS).jamb.x;
const attached = (attachment = attach('L1')) => reduce(initial(),
  setAttachment({ ...at, target: { kind: 'opening', openingId: 'W' }, attach: attachment }));

describe('LL3 opening edits with layout lines', () => {
  it('moves an opening onto the line it is attached to', () => {
    expect(jambX(attached())).toBe(82);
  });

  it('8. grows a centre-attached window about the line', () => {
    const state = reduce(attached(), resizeOpening({ ...at, openingId: 'W', width: 40, grow: 'right' }));
    expect(jambX(state)).toBe(80);
  });

  it('9. keeps an edge-attached window in place when switching measure mode', () => {
    const state = reduce(attached(attach('L1', 'left')), setOpeningMeasureMode({ ...at, openingId: 'W', mode: 'casing' }));
    expect(windowOf(state).attach.offset).toBe(-3);
    expect(jambX(state)).toBe(100);
    expect(windowOf(state).offset).toBe(97);
    expect(windowOf(state).width).toBe(42);
  });

  it('14. refuses to drag an attached window', () => {
    const start = attached();
    const state = reduce(start, moveOpening({ ...at, openingId: 'W', x: 30 }));
    expect(windowOf(state)).toEqual(windowOf(start));
    expect(state.message).toBe('W1 is attached to line L1: move the line, or detach.');
  });

  it('15. ignores a typed offset but applies the rest', () => {
    const state = reduce(attached(), updateOpening({ ...at, openingId: 'W', changes: { offset: 5, height: 50 } }));
    expect(windowOf(state).height).toBe(50);
    expect(jambX(state)).toBe(82);
  });

  it('16. makes a new line through the window without moving it', () => {
    const state = reduce(initial({ lines: [] }), attachOpeningToNewLine({ ...at, openingId: 'W', id: 'N' }));
    expect(wallOf(state).lines).toEqual([{ id: 'N', label: 'L1', from: 'left', value: 42 }]);
    expect(windowOf(state).attach).toEqual({ lineId: 'N', at: 'center', offset: 0 });
    expect(windowOf(state).offset).toBe(24);
    const fromRight = reduce(
      initial({ lines: [], window: { offsetFrom: 'right', offset: 180 } }),
      attachOpeningToNewLine({ ...at, openingId: 'W', id: 'N' }),
    );
    expect(wallOf(fromRight).lines[0]).toMatchObject({ from: 'right', value: 198 });
    expect(windowOf(fromRight).offset).toBe(180);
  });

  it('17. changing the point keeps the offset and moves the window', () => {
    const state = reduce(attached(), setAttachment({
      ...at, target: { kind: 'opening', openingId: 'W' }, attach: attach('L1', 'left', 0),
    }));
    expect(jambX(state)).toBe(100);
  });

  it('18. selects a line exclusively', () => {
    const selected = reduce(initial(), setSelection({ lineId: 'L1' }));
    expect(selected.selection).toMatchObject({ lineId: 'L1', runId: null, openingId: null, soffitId: null, recessId: null });
    expect(reduce(selected, setSelection({ runId: 'run-1' })).selection).not.toHaveProperty('lineId');
  });
});
