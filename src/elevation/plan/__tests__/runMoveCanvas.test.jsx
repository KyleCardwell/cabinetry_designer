import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Stage } from 'react-konva';
import elevationReducer, { setSelection } from '../../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { wallSideFrame } from '../../model/wallSides.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import LiveEntryInput from '../../components/LiveEntryInput.jsx';
import CanvasContextMenu from '../../components/CanvasContextMenu.jsx';

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
  useId: () => 'move-test',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape',
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
const storedX = () => state.rooms[0].walls[0].runs[0].x;
const previewX = () => node(PlanScene).props.orderedFootprints.find(({ run }) => run.id === 'run-1')?.run.x;
const active = () => Boolean(node(LiveEntryInput));
const key = (value, extra = {}) => {
  const event = { key: value, target: { tagName: 'DIV' }, preventDefault: vi.fn(), ...extra };
  [...(listeners.get('keydown') ?? [])].forEach((listener) => listener(event));
  render();
  return event;
};
const point = (world) => {
  const layer = node(Layer).props;
  pointer = { x: (world.x - layer.offsetX) * layer.scaleX, y: (world.y - layer.offsetY) * layer.scaleY };
};
const move = (world) => {
  point(world);
  node(Stage).props.onMouseMove();
  render();
};
const click = () => {
  // A click on the move overlay must commit even though the target is not the stage.
  node(Stage).props.onClick({ target: { getStage: () => stage }, evt: { button: 0 } });
  render();
};
const type = (text) => {
  node(LiveEntryInput).props.onTyped(text);
  render();
};

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
  state = stateWithRun(run({
    x: 12, width: 30, autoCount: false, items: [auto('cabinet')],
    ends: { left: { type: 'none' }, right: { type: 'none' } },
  }));
  state.rooms[0].walls[0].x2 = 120;
  state.view = 'plan';
  state.activeWallSide = 'front';
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
      tree.push(...nodes(CanvasContextMenu(node(CanvasContextMenu).props)));
      effects.forEach((effect) => effect());
    }
  };
  render();
  dispatch(setSelection({ runId: 'run-1', pieceId: 'cabinet' }));
  render();
  point({ x: 55, y: 10 });
  dispatch.mockClear();
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('a right-to-left wall projects −10 world x to run x +10, previews then commits on click', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].flipped = true;
  render();
  expect(wallSideFrame(state.rooms[0], state.rooms[0].walls[0]).r).toEqual({ x: -1, y: 0 });
  point({ x: 55, y: -10 });
  key('m');
  expect(active()).toBe(true);
  expect(tree[0].props.style.cursor).toBe('move');
  expect(node(LiveEntryInput).props.entry.label).toBe('Move');
  move({ x: 45, y: -10 });
  expect(previewX()).toBe(22);
  expect(storedX()).toBe(12);
  expect(dispatch).not.toHaveBeenCalled();
  click();
  expect(storedX()).toBe(22);
  expect(active()).toBe(false);
  expect(tree[0].props.style.cursor).not.toBe('move');
});

it('a 90° wall projects +6.2 world y to run x +6; typed fractions stay exact through Enter', () => {
  state = structuredClone(state);
  Object.assign(state.rooms[0].walls[0], { x2: 0, y2: 120 });
  render();
  expect(wallSideFrame(state.rooms[0], state.rooms[0].walls[0]).r).toEqual({ x: 0, y: 1 });
  point({ x: -10, y: 55 });
  key('M');
  move({ x: -10, y: 61.2 });
  expect(previewX()).toBe(18);
  expect(storedX()).toBe(12);
  key('Enter');
  expect(storedX()).toBe(18);
  key('m');
  type('0.0625');
  expect(previewX()).toBe(18.0625);
  move({ x: -30, y: 80 });
  expect(previewX()).toBe(18.0625);
  node(LiveEntryInput).props.onCommit();
  render();
  expect(storedX()).toBe(18.0625);
  expect(active()).toBe(false);
});
