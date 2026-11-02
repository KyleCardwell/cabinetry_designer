import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Group, Line, Rect, Text } from 'react-konva';
import { K, K2 } from '../../../test/fixtures/landingRoomK.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import elevationReducer, {
  createInitialElevationState,
  landWallEndpoint,
} from '../../store/elevationSlice.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanNearMisses from '../PlanNearMisses.jsx';
import PlanOverlays from '../PlanOverlays.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback) => callback,
  useMemo: (callback) => callback(),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useImperativeHandle: () => {},
  useRef: (current) => ({ current }),
  useId: () => 'near-miss-test',
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value?.width === 0 && value?.height === 0
      ? { width: 1100, height: 800 } : value, vi.fn()];
  },
  useReducer: (reducer, initial, init) => [init ? init(initial) : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Circle: 'circle', Group: 'group', Label: 'label', Layer: 'layer', Line: 'line',
  Rect: 'rect', Shape: 'shape', Stage: 'stage', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, type, predicate = () => true) => nodes(tree)
  .find((item) => item.type === type && predicate(item.props));
const all = (tree, type) => nodes(tree).filter((item) => item.type === type);
const landing = {
  wallId: 'wall-2', endpoint: 'end', hostId: 'wall-3', side: 'back', x: 85,
};
const cursor = { request: vi.fn(), release: vi.fn() };
const props = (room, overrides = {}) => ({
  room, settings: DEFAULT_SETTINGS, scale: 2, text: { label: 1.25, dimension: 1 },
  tool: 'select', entry: null, cursor, onLand: vi.fn(), ...overrides,
});
const marks = (room, overrides) => {
  const overlay = PlanOverlays(props(room, overrides));
  return PlanNearMisses(find(overlay, PlanNearMisses).props);
};
const chip = (tree) => find(tree, Group, ({ onClick, listening }) => (
  onClick !== undefined || listening === false
));

beforeEach(() => {
  vi.clearAllMocks();
});

it('anchor 1: K2 draws one scaled amber gap, label, and Land chip', () => {
  const tree = marks(K2);
  const line = find(tree, Line);
  expect(all(tree, Line)).toHaveLength(1);
  expect(line.props).toMatchObject({
    listening: false,
    points: [-38.5, 15.5, -38.5, 13.5],
    stroke: '#f59e0b', strokeWidth: 0.5, dash: [2, 2],
  });
  const label = find(tree, Text, ({ text }) => text.startsWith('Stops'));
  expect(label.props).toMatchObject({
    listening: false, text: 'Stops 2" short of Wall 3', fontSize: 6.25,
    x: -32.25, y: 4.875,
  });
  expect(find(tree, Text, ({ text }) => text === 'Land').props.listening).toBe(false);
  expect(find(tree, Rect).props.cornerRadius).toBe(2.5);
  expect(chip(tree).props.listening).toBe(true);
});

it('anchor 2: the chip lands the end once; the wired canvas restores K and clears the mark', () => {
  const onLand = vi.fn();
  const tree = marks(K2, { onLand });
  chip(tree).props.onMouseEnter();
  expect(cursor.request).toHaveBeenCalledWith('near-miss-test:wall-2:end', 'pointer');
  chip(tree).props.onMouseLeave();
  expect(cursor.release).toHaveBeenCalledWith('near-miss-test:wall-2:end');
  const event = { cancelBubble: false };
  chip(tree).props.onClick(event);
  expect(event.cancelBubble).toBe(true);
  expect(onLand).toHaveBeenCalledOnce();
  expect(onLand.mock.calls[0][0]).toMatchObject(landing);

  let state = {
    ...createInitialElevationState(null),
    rooms: [syncRoom(K2, DEFAULT_SETTINGS)],
    activeRoomId: K2.id,
    activeWallId: 'wall-2',
    tool: 'select',
    view: 'plan',
  };
  const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  const canvasMarks = () => {
    const overlay = find(PlanCanvas({}), PlanOverlays);
    return PlanNearMisses(find(PlanOverlays(overlay.props), PlanNearMisses).props);
  };
  expect(find(canvasMarks(), Text, ({ text }) => text.startsWith('Stops'))).toBeTruthy();
  const canvasEvent = { cancelBubble: false };
  chip(canvasMarks()).props.onClick(canvasEvent);
  expect(canvasEvent.cancelBubble).toBe(true);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch).toHaveBeenCalledWith(landWallEndpoint(landing));
  expect(state.rooms[0].walls).toEqual(syncRoom(K, DEFAULT_SETTINGS).walls);
  expect(all(canvasMarks(), Line)).toHaveLength(0);
  expect(find(canvasMarks(), Text, ({ text }) => text === 'Land')).toBeUndefined();
});

it('anchor 3: a touching free end has text but no dashed line', () => {
  const touching = {
    ...K2,
    walls: K2.walls.map((wall) => wall.id === 'wall-2' ? { ...wall, y2: 13.5 } : wall),
  };
  const tree = marks(touching);
  expect(all(tree, Line)).toHaveLength(0);
  expect(find(tree, Text, ({ text }) => text === 'Touches Wall 3, not landed')).toBeTruthy();
  expect(chip(tree).props.listening).toBe(true);
});

it('anchor 4: K has no marks; Wall tool or live entry shows a non-listening chip', () => {
  expect(all(marks(K), Text)).toHaveLength(0);
  for (const overrides of [{ tool: 'wall' }, { entry: { kind: 'wall-length' } }]) {
    const tree = marks(K2, overrides);
    expect(find(tree, Text, ({ text }) => text === 'Stops 2" short of Wall 3')).toBeTruthy();
    expect(chip(tree).props).toMatchObject({ listening: false, onClick: undefined });
  }
});
