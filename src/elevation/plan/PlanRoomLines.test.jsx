import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { attach, room, roomLine, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { syncRoom } from '../model/roomSync.js';
import elevationReducer, {
  addRoomLine, createInitialElevationState, setSelection, setTool,
} from '../store/elevationSlice.js';
import usePlanSelectHandlers from './usePlanSelectHandlers.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback) => callback, useMemo: (callback) => callback(),
  useEffect: vi.fn(), useLayoutEffect: vi.fn(), useImperativeHandle: vi.fn(),
  useRef: (current) => ({ current }), useId: () => 'plan-room-line-test',
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value?.width === 0 && value?.height === 0 ? { width: 1100, height: 800 } : value, vi.fn()];
  },
  useReducer: (reducer, initial, init) => [init ? init(initial) : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Circle: 'circle', Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect',
  Shape: 'shape', Stage: 'stage', Tag: 'tag', Text: 'text',
}));
vi.mock('uuid', () => ({ v4: () => 'new-room-line' }));

let fixture, state, dispatch, pointer, pickAt, closePicker;

beforeEach(() => {
  vi.clearAllMocks();
  fixture = syncRoom(room({ walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36, ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ], roomLines: [roomLine('R1', { from: 'right', value: 99 })] }), DEFAULT_SETTINGS);
  state = { ...createInitialElevationState(null), rooms: [fixture], activeRoomId: fixture.id,
    activeWallId: 'wall-2', activeWallSide: 'front', tool: 'roomLine', view: 'plan',
    selection: { wallId: 'wall-2', runId: 'sink' } };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  pointer = { x: 100, y: 96 };
  pickAt = vi.fn();
  closePicker = vi.fn();
});

const handlers = (overrides = {}) => usePlanSelectHandlers({
  room: fixture, walls: fixture.walls, settings: { ...DEFAULT_SETTINGS, openingSnap: 1 },
  tool: state.tool, entry: null, dispatch,
  stageRef: { current: { getPointerPosition: () => pointer } }, toWorld: (point) => point,
  pickAt, closePicker, showMessage: vi.fn(), messageTimeoutRef: { current: null }, ...overrides,
});

it('anchor 3: adds W2 front at world (100, 96), 40 from the right, then selects and resets the tool', () => {
  const event = {};
  handlers().handleWallSelect('wall-2', event);
  expect(event.cancelBubble).toBe(true);
  expect(dispatch.mock.calls).toEqual([
    [addRoomLine({ wallId: 'wall-2', id: 'new-room-line', from: 'right', value: 40 })],
    [setSelection({ roomLineId: 'new-room-line' })], [setTool('select')],
  ]);
  expect(state.rooms[0].roomLines.at(-1)).toMatchObject({ label: 'R2', from: 'right', value: 40 });
  expect(closePicker).toHaveBeenCalledOnce();
  expect(pickAt).not.toHaveBeenCalled();
});

it('anchor 4: chooses W2 back at world (100, 99.5), 40 from the left', () => {
  pointer = { x: 100, y: 99.5 };
  handlers().handleWallSelect('wall-2', {});
  expect(dispatch.mock.calls[0][0].payload).toEqual({
    wallId: 'wall-2', id: 'new-room-line', wallSide: 'back', from: 'left', value: 40,
  });
});

it('snaps face x, clamps a rounded endpoint, and ignores clicks outside the face before snapping', () => {
  for (const [worldX, snap, from, value] of [[100.2, 7, 'right', 43], [60, 11, 'right', 0], [180, 7, 'left', 0]]) {
    pointer = { x: worldX, y: 96 };
    const record = vi.fn();
    handlers({ dispatch: record, settings: { ...DEFAULT_SETTINGS, openingSnap: snap } })
      .handleWallSelect('wall-2', {});
    expect(record.mock.calls[0][0].payload).toMatchObject({ from, value });
  }
  for (const worldX of [59.9, 180.1]) {
    pointer = { x: worldX, y: 96 };
    handlers().handleWallSelect('wall-2', {});
  }
  expect(dispatch).not.toHaveBeenCalled();
  handlers({ entry: { kind: 'wall-length' } }).handleWallSelect('wall-2', {});
  expect(dispatch).not.toHaveBeenCalled();
});
