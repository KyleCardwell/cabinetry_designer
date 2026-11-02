import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Line, Text } from 'react-konva';
import { attach, room, roomLine, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { syncRoom } from '../model/roomSync.js';
import { roomLineSegment } from '../model/roomLines.js';
import elevationReducer, {
  addRoomLine, createInitialElevationState, setSelection, setTool,
} from '../store/elevationSlice.js';
import ElevationToolbar from '../components/ElevationToolbar.jsx';
import AddToolMenu from '../components/AddToolMenu.jsx';
import PropertiesPanel from '../components/PropertiesPanel.jsx';
import RoomLineProperties from '../components/properties/RoomLineProperties.jsx';
import SelectionPicker, { PlanPickOutline } from '../components/SelectionPicker.jsx';
import PlanCanvas from './PlanCanvas.jsx';
import PlanRoomLines from './PlanRoomLines.jsx';
import PlanScene from './PlanScene.jsx';
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

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
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

it('anchor 1: clips R1 to (141, -24) → (141, 144)', () => {
  expect(roomLineSegment(fixture, fixture.roomLines[0]))
    .toEqual({ a: { x: 141, y: -24 }, b: { x: 141, y: 144 } });
});

it('anchor 2: orders W3 front from its back side (324, 60) → (-24, 60)', () => {
  expect(roomLineSegment(fixture, roomLine('R2', { wallId: 'wall-3', value: 60 })))
    .toEqual({ a: { x: 324, y: 60 }, b: { x: -24, y: 60 } });
});

it('clips diagonal lines on both axes, supports a custom pad, and skips missing references', () => {
  const diagonal = room({ walls: [wall({ x1: 0, y1: 0, x2: 100, y2: 100 })] });
  const segment = roomLineSegment(diagonal, roomLine('R1', { value: Math.sqrt(5000) }), 10);
  expect(segment.a.x).toBeCloseTo(110);
  expect(segment.a.y).toBeCloseTo(-10);
  expect(segment.b.x).toBeCloseTo(-10);
  expect(segment.b.y).toBeCloseTo(110);
  expect(roomLineSegment(room(), roomLine('missing'))).toBeNull();
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

it('anchor 5: any connection or landing at either end forces the front face', () => {
  pointer = { x: 100, y: 99.5 };
  for (const key of ['connections', 'landings']) {
    for (const end of ['start', 'end']) {
      const walls = fixture.walls.map((candidate) => candidate.id === 'wall-2'
        ? { ...candidate, [key]: { [end]: { wallId: 'wall-1', end: 'start', x: 20 } } } : candidate);
      dispatch.mockClear();
      // Inspect the action only: topology validity is covered by the existing model tests.
      const record = vi.fn();
      handlers({ walls, dispatch: record }).handleWallSelect('wall-2', {});
      expect(record.mock.calls[0][0].payload).toEqual({
        wallId: 'wall-2', id: 'new-room-line', from: 'right', value: 40,
      });
    }
  }
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

it('anchor 6: mounts above walls/runs, cancels bubbling, selects R1 and shows plan properties without a wall context', () => {
  state = { ...state, tool: 'select' };
  const canvas = nodes(PlanCanvas({}));
  const layer = canvas.find(({ type }) => type === Layer);
  const children = nodes(layer);
  const guides = children.find(({ type }) => type === PlanRoomLines);
  expect(layer.props.children.at(-2).type).toBe(PlanRoomLines);
  expect(layer.props.children.at(-1).type).toBe(PlanPickOutline);
  expect(children.indexOf(guides)).toBeGreaterThan(children.findIndex(({ type }) => type === PlanScene));
  expect(canvas.find(({ type }) => type === SelectionPicker).props.picker).toBeNull();
  const rendered = nodes(PlanRoomLines(guides.props));
  const click = rendered.find(({ props }) => props.onClick).props.onClick;
  const event = { cancelBubble: false };
  click(event);
  expect(event.cancelBubble).toBe(true);
  expect(dispatch).toHaveBeenLastCalledWith(setSelection({ roomLineId: 'R1' }));
  expect(state.selection).toMatchObject({ roomLineId: 'R1', runId: null });
  const properties = nodes(PropertiesPanel()).find(({ type }) => type === RoomLineProperties);
  expect(properties.props).toMatchObject({ line: { id: 'R1' }, wall: null });
  expect(text(RoomLineProperties(properties.props))).not.toContain('On this wall:');
  const scene = nodes(PlanCanvas({})).find(({ type }) => type === PlanScene);
  expect(scene.props.selectedWall).toBeNull();
});

it('draws cyan dashed lines with screen-sized hit areas and the elevation selected style', () => {
  for (const scale of [0.5, 2]) {
    const tree = nodes(PlanRoomLines({ room: fixture, scale, selectedRoomLineId: 'R1', tool: 'select' }));
    expect(tree[0].props.listening).toBe(true);
    expect(tree.find(({ type }) => type === Line).props).toMatchObject({
      points: [141, -24, 141, 144], stroke: '#22d3ee', strokeWidth: 2 / scale,
      dash: [6 / scale, 4 / scale], hitStrokeWidth: 10 / scale,
    });
    expect(tree.find(({ type }) => type === Text).props).toMatchObject({
      text: 'R1', x: 141, y: -24, fontStyle: 'bold', fontSize: 11 / scale,
    });
  }
});

it('listens only in Select with no live entry, and draws nothing for rooms without lines', () => {
  for (const props of [{ tool: 'roomLine' }, { tool: 'measure' }, { tool: 'select', entry: {} }]) {
    expect(PlanRoomLines({ room: fixture, scale: 1, ...props }).props.listening).toBe(false);
  }
  expect(PlanRoomLines({ room: room(), scale: 1 })).toBeNull();
});

it('anchor 7: plan Add offers Door, Window, Room line and activates the new tool', () => {
  const menu = nodes(ElevationToolbar({})).find(({ type }) => type === AddToolMenu);
  expect(menu.props.tools).toEqual([['door', 'Door'], ['window', 'Window'], ['roomLine', 'Room line']]);
  menu.props.onPick('roomLine');
  expect(dispatch).toHaveBeenLastCalledWith(setTool('roomLine'));
});
