import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Line, Text } from 'react-konva';
import { attach, room, roomLine, run, wall } from '../../test/builders.js';
import { createLiveEntryController } from '../canvas/useLiveEntry.js';
import { wallToScreen } from '../canvas/transform.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { resolveWall, syncRoom } from '../model/room.js';
import elevationReducer, {
  addRoomLine, createInitialElevationState, setSelection, setTool, updateLayoutLine,
} from '../store/elevationSlice.js';
import ElevationCanvas from './ElevationCanvas.jsx';
import ElevationToolbar from './ElevationToolbar.jsx';
import AddToolMenu from './AddToolMenu.jsx';
import LayoutLines, { ROOM_LINE_COLOR } from './LayoutLines.jsx';
import WallContentLayer from './WallContentLayer.jsx';
import useLineDrag from './canvas/useLineDrag.js';
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

it('anchor 1: draws R1 at W2 front x 39 in cyan; W3 front has no line', () => {
  const face = resolveWall(fixture, fixture.walls[1]);
  const tree = nodes(LayoutLines({ wall: face, transform }));
  const dashed = tree.find(({ type, props }) => type === Line && props.dash);
  expect(ROOM_LINE_COLOR).toBe('#22d3ee');
  expect(dashed.props).toMatchObject({ stroke: ROOM_LINE_COLOR, dash: [6, 4] });
  expect(dashed.props.points[0]).toBe(wallToScreen({ x: 39, z: 0 }, transform).x);
  expect(tree.find(({ type }) => type === Text).props).toMatchObject({ text: 'R1', fill: ROOM_LINE_COLOR });
  expect(LayoutLines({ wall: resolveWall(fixture, fixture.walls[2]), transform })).toBeNull();
});

it('anchor 2: keeps the attached front projection at -30 and hides the unattached back projection at 150', () => {
  fixture = syncRoom({ ...fixture, roomLines: [roomLine('R1', { from: 'right', value: 30 })] }, DEFAULT_SETTINGS);
  const tree = nodes(LayoutLines({ wall: resolveWall(fixture, fixture.walls[1]), transform }));
  expect(tree.find(({ type, props }) => type === Line && props.dash).props.points[0])
    .toBe(wallToScreen({ x: -30, z: 0 }, transform).x);
  expect(LayoutLines({ wall: resolveWall(fixture, fixture.walls[1], 'back'), transform })).toBeNull();
});

it('anchor 3: canvas click selects the room line, and the existing drag hook commits W2 face value 45', () => {
  const face = resolveWall(fixture, fixture.walls[1]);
  const canvas = nodes(ElevationCanvas.render({ room: fixture, wall: face, settings: DEFAULT_SETTINGS }, null));
  const content = canvas.find(({ type }) => type === WallContentLayer);
  const layout = nodes(WallContentLayer(content.props)).find(({ type }) => type === LayoutLines);
  expect(layout.props.selectedRoomLineId).toBe('R1');
  const lineTree = nodes(LayoutLines(layout.props));
  const draggable = lineTree.find(({ props }) => props.dragBoundFunc);
  expect(draggable.props.draggable).toBe(true);
  expect(lineTree.find(({ type, props }) => type === Line && props.dash).props.strokeWidth).toBe(2);
  draggable.props.onClick({ cancelBubble: false });
  expect(dispatch).toHaveBeenLastCalledWith(setSelection({ roomLineId: 'R1' }));

  const entry = createLiveEntryController(vi.fn());
  const entryRef = { current: null };
  const hook = useLineDrag({ room: fixture, wall: face, settings: DEFAULT_SETTINGS, dispatch,
    cursor: { hold: vi.fn(), releaseHold: vi.fn() }, entryRef, liveGestureRef: { current: null },
    beginEntry: entry.begin, updateEntry: entry.update, cancelEntry: entry.cancel, commitEntry: entry.commit,
    setEntryPointer: vi.fn(), setStretchPreview: vi.fn(), stageRef: { current: null },
  });
  const dragTree = nodes(LayoutLines({ ...layout.props,
    onDragStart: hook.startLineDrag, onDragMove: hook.updateLineDrag, onDragEnd: hook.finishLineDrag,
  }));
  const drag = dragTree.find(({ props }) => props.dragBoundFunc);
  drag.props.onDragStart({});
  entryRef.current = entry.entry;
  const target = { x: () => (45 - 39) * layout.props.transform.scale, position: vi.fn() };
  drag.props.onDragMove({ target });
  drag.props.onDragEnd({ target });
  expect(dispatch).toHaveBeenLastCalledWith(updateLayoutLine({ wallId: 'wall-2', lineId: 'R1', value: 45 }));
  expect(state.rooms[0].roomLines[0].value).toBe(105);
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

it("accepts setTool('roomLine') in the store whitelist", () => {
  expect(elevationReducer(state, setTool('roomLine')).tool).toBe('roomLine');
});
