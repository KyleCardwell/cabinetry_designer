import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Line, Stage } from 'react-konva';
import elevationReducer, { createInitialElevationState, setWallLanding } from '../../store/elevationSlice.js';
import { K } from '../../../test/fixtures/landingRoomK.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanWallShape from '../PlanWallShape.jsx';
import LiveEntryInput from '../../components/LiveEntryInput.jsx';

// Keep hook state and effect lifecycles across renders without mounting Konva in a DOM.
let hooks;
vi.mock('react', async (original) => ({
  ...await original(),
  useState: (value) => hooks.state(value),
  useReducer: (reducer, value, init) => hooks.reducer(reducer, value, init),
  useRef: (value) => hooks.memo(() => ({ current: value }), []),
  useMemo: (callback, deps) => hooks.memo(callback, deps),
  useCallback: (callback, deps) => hooks.memo(() => callback, deps),
  useEffect: (callback, deps) => hooks.effect(callback, deps),
  useLayoutEffect: (callback, deps) => hooks.effect(callback, deps),
  useImperativeHandle: vi.fn(),
  useId: () => 'landing-span-test',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Circle: 'circle', Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
  Stage: 'stage', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
let state;
let dispatch;
let tree;
let pointer;
let listeners;
let stage;
let render;
const node = (type) => tree.find((item) => item.type === type);

beforeEach(() => {
  vi.useFakeTimers();
  const slots = [];
  let index = 0;
  let dirty = true;
  let effects = [];
  hooks = {
    state(initial) {
      const i = index++;
      if (!slots[i]) {
        let value = typeof initial === 'function' ? initial() : initial;
        if (value?.width === 0 && value?.height === 0) value = { width: 1100, height: 800 };
        const slot = { value, set(next) {
          const value = typeof next === 'function' ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
        } };
        slots[i] = slot;
      }
      return [slots[i].value, slots[i].set];
    },
    reducer(reducer, initial, init) {
      const [value, set] = hooks.state(init ? () => init(initial) : initial);
      return [value, hooks.memo(() => (action) => set((current) => reducer(current, action)), [])];
    },
    memo(callback, deps) {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback(), deps };
      return slots[i].value;
    },
    effect(callback, deps) {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: callback() };
        });
      }
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
  state = { ...createInitialElevationState(null), rooms: [syncRoom(K, DEFAULT_SETTINGS)],
    activeRoomId: 'room-1', activeWallId: 'wall-1', activeWallSide: 'front', view: 'plan', tool: 'select',
    selection: { wallId: 'wall-1' } };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); dirty = true; });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  listeners = new Map();
  vi.stubGlobal('window', {
    addEventListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  });
  vi.stubGlobal('document', { querySelector: () => null });
  stage = { getPointerPosition: () => pointer };
  render = () => {
    dirty = true;
    for (let count = 0; dirty; count += 1) {
      if (count > 20) throw new Error('Canvas did not settle');
      dirty = false;
      index = 0;
      effects = [];
      tree = nodes(PlanCanvas({}));
      node(Stage).ref.current = stage;
      effects.forEach((effect) => effect());
    }
  };
  render();
  pointer = { x: 300, y: 200 };
  dispatch.mockClear();
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function childNodes(component, props) {
  const canvasHooks = hooks;
  hooks = { ...hooks, state: (value) => [value, () => {}], memo: (callback) => callback(), effect: () => {} };
  try { return nodes(component(props)); }
  finally { hooks = canvasHooks; }
}

const hostProps = () => nodes(PlanScene(node(PlanScene).props))
  .find(({ type, props }) => type === PlanWallShape && props.wall.id === 'wall-3').props;
const wallTree = () => childNodes(PlanWallShape, hostProps());
const hits = () => wallTree().filter(({ type, props }) => type === Line && props.stroke === 'transparent');
const input = () => node(LiveEntryInput);
const entry = () => input()?.props.entry;
const actions = () => dispatch.mock.calls.map(([action]) => action)
  .filter(({ type }) => type.endsWith('/setWallLanding'));
const typeValue = (text) => { input().props.onTyped(text); render(); };
const inputKey = (key) => {
  childNodes(LiveEntryInput, input().props).find(({ type }) => type === 'input').props.onKeyDown({
    key, preventDefault: vi.fn(), stopPropagation: vi.fn(),
  });
  render();
};
function clickSpan(index = 1) {
  const shapes = wallTree();
  const event = { evt: { button: 0 } };
  hits()[index].props.onClick(event);
  // Model Konva bubbling: reaching the wall or Stage here would select a wall or commit early.
  if (!event.cancelBubble) shapes[0].props.onClick(event);
  if (!event.cancelBubble) node(Stage).props.onClick(event);
  expect(event.cancelBubble).toBe(true);
  render();
}

it('anchor 3: typing 26 and Enter dispatches the landed payload once', () => {
  clickSpan(); typeValue('26'); inputKey('Enter');
  expect(actions()).toEqual([setWallLanding({
    wallId: 'wall-2', endpoint: 'end', ref: 'right', to: 'near', offset: 26, move: 'landed',
  })]);
  expect(entry()).toBeUndefined();
});

it('anchor 4: Tab chooses Move Wall 3 and Enter dispatches the host payload', () => {
  clickSpan(); inputKey('Tab');
  expect(entry()).toMatchObject({ label: 'Move Wall 3', modeKey: 'host', value: 39, min: 0 });
  typeValue('26'); inputKey('Enter');
  expect(actions()).toEqual([setWallLanding({
    wallId: 'wall-2', endpoint: 'end', ref: 'right', to: 'near', offset: 26, move: 'host',
  })]);
});

it('anchor 5: clicking 0–80.5 starts at 80.5 and commits ref left and to near', () => {
  // A stored center measurement must become near when entered through the plan span.
  state = { ...state, rooms: [{ ...state.rooms[0], walls: state.rooms[0].walls.map((wall) => wall.id === 'wall-2'
    ? { ...wall, landings: { ...wall.landings, end: { ...wall.landings.end, to: 'center' } } } : wall) }] };
  render(); clickSpan(0);
  expect(entry().value).toBe(80.5);
  typeValue('70'); inputKey('Enter');
  expect(actions()).toEqual([setWallLanding({
    wallId: 'wall-2', endpoint: 'end', ref: 'left', to: 'near', offset: 70, move: 'landed',
  })]);
});
