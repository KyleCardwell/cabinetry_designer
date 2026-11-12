import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { attach, room, roomLine, run, wall } from '../../test/builders.js';
import { wallToScreen } from '../canvas/transform.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { resolveWall, syncRoom } from '../model/room.js';
import elevationReducer, { addRoomLine, createInitialElevationState, setSelection } from '../store/elevationSlice.js';
import ElevationToolbar from './ElevationToolbar.jsx';
import AddToolMenu from './AddToolMenu.jsx';
import useStageClick from './canvas/useStageClick.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback) => callback, useMemo: (callback) => callback(),
  useEffect: vi.fn(), useLayoutEffect: vi.fn(), useImperativeHandle: vi.fn(),
  useRef: (current) => ({ current }), useId: () => 'room-line-test',
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value?.width === 0 && value?.height === 0 ? { width: 1100, height: 800 } : value, vi.fn()];
  },
  useReducer: (reducer, initial, init) => [init ? init(initial) : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));
vi.mock('uuid', () => ({ v4: () => 'new-room-line' }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 2, offsetX: 10, offsetY: 20, wallHeight: 96 };
let fixture, state, dispatch;

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
    activeWallId: 'wall-2', activeWallSide: 'front', tool: 'select', view: 'elevation', selection: { wallId: 'wall-2', roomLineId: 'R1' } };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

it('anchor 5: the elevation tool adds at W2 x 80 from the right end, with snapping and face selection', () => {
  const menu = nodes(ElevationToolbar({})).find(({ type }) => type === AddToolMenu);
  expect(menu.props).toBeDefined();
  expect(menu.props.tools).toContainEqual(['roomLine', 'Room line']);
  menu.props.onPick('roomLine');
  expect(state.tool).toBe('roomLine');
  dispatch.mockClear();
  const face = resolveWall(fixture, fixture.walls[1]);
  let pointer = wallToScreen({ x: 80.2, z: 10 }, transform);
  const stage = { getPointerPosition: () => pointer };
  const props = { room: fixture, wall: face, settings: DEFAULT_SETTINGS, tool: state.tool, transform, dispatch,
    stageRef: { current: stage }, panRef: { current: null }, spacePressedRef: { current: false },
    suppressClickRef: { current: false }, liveGestureRef: { current: null }, measure: {},
  };
  useStageClick(props).handleStageClick({ target: { getStage() { return this; } }, evt: { button: 0 } });
  expect(dispatch.mock.calls).toEqual([
    [addRoomLine({ wallId: 'wall-2', id: 'new-room-line', from: 'right', value: 40 })],
    [setSelection({ roomLineId: 'new-room-line' })],
  ]);
  dispatch.mockClear();
  pointer = wallToScreen({ x: -1, z: 10 }, transform);
  useStageClick(props).handleStageClick({ target: { getStage() { return this; } }, evt: { button: 0 } });
  expect(dispatch).not.toHaveBeenCalled();
  pointer = wallToScreen({ x: 80, z: 10 }, transform);
  useStageClick({ ...props, wall: resolveWall(fixture, fixture.walls[1], 'back') })
    .handleStageClick({ target: { getStage() { return this; } }, evt: { button: 0 } });
  expect(dispatch.mock.calls[0][0].payload).toMatchObject({ wallSide: 'back', from: 'right', value: 40 });
});
