import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Rect, Stage } from 'react-konva';
import { resolveWall, syncRoom } from '../model/room.js';
import { wallToScreen } from '../canvas/transform.js';
import elevationReducer, { setSelection, setTool } from '../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../store/__tests__/helpers/sliceFixtures.js';
import ElevationCanvas from './ElevationCanvas.jsx';
import ElevationPreviews from './ElevationPreviews.jsx';
import LiveEntryInput from './LiveEntryInput.jsx';
import RunGroup from './RunGroup.jsx';

// Keep hook state and effect lifecycles across renders without mounting Konva in a DOM.
let hooks;
vi.mock('react', async (original) => ({
  ...await original(),
  useState: (value) => hooks.state(value),
  useReducer: (reducer, value) => hooks.reducer(reducer, value),
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
let side;
let render;
const node = (type) => tree.find((item) => item.type === type);
const storedX = () => state.rooms[0].walls[0].runs[0].x;
const previewX = () => node(ElevationPreviews).props.stretchPreview?.wall.runs[0].x;
const active = () => Boolean(node(LiveEntryInput));
const key = (value, extra = {}) => {
  const event = { key: value, target: { tagName: 'DIV' }, preventDefault: vi.fn(), ...extra };
  [...(listeners.get('keydown') ?? [])].forEach((listener) => listener(event));
  render();
  return event;
};
const move = (delta) => {
  pointer = wallToScreen({ x: 55 + delta, z: 20 }, node(RunGroup).props.transform);
  node(Stage).props.onMouseMove({ target: stage });
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
    reducer(reducer, initial) {
      const [value, set] = hooks.state(initial);
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
  side = 'front';
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
  let source;
  let room;
  let wall;
  let previousSide;
  render = () => {
    dirty = true;
    for (let count = 0; dirty; count += 1) {
      if (count > 20) throw new Error('Canvas did not settle');
      dirty = false;
      index = 0;
      effects = [];
      if (source !== state.rooms[0] || previousSide !== side) {
        source = state.rooms[0];
        previousSide = side;
        room = syncRoom(source, state.settings);
        wall = resolveWall(room, room.walls[0], side);
      }
      tree = nodes(ElevationCanvas.render({ room, wall, settings: state.settings }, null));
      node(Stage).ref.current = stage;
      effects.forEach((effect) => effect());
    }
  };
  render();
  dispatch(setSelection({ runId: 'run-1', pieceId: 'cabinet' }));
  render();
  pointer = wallToScreen({ x: 55, z: 20 }, node(RunGroup).props.transform);
  dispatch.mockClear();
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('anchor 1: M moves a selected cabinet’s run by +20.3 inches, rounds the preview and commits on click', () => {
  key('m');
  expect(active()).toBe(true);
  expect(tree[0].props.style.cursor).toBe('move');
  expect(node(LiveEntryInput).props.entry.label).toBe('Move');
  expect(tree.some(({ type, props }) => type === Rect && props.fill === 'transparent')).toBe(true);
  move(20.3);
  expect(previewX()).toBe(32.5);
  expect(storedX()).toBe(12);
  expect(dispatch).not.toHaveBeenCalled();
  click();
  expect(storedX()).toBe(32.5);
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(tree[0].props.style.cursor).not.toBe('move');
});

it('anchor 2: typing 20 then Enter moves to x 32 exactly, and typed fractions bypass rounding', () => {
  key('M');
  type('20');
  expect(previewX()).toBe(32);
  key('Enter');
  expect(storedX()).toBe(32);
  expect(active()).toBe(false);
  key('m');
  type('0.0625');
  expect(previewX()).toBe(32.0625);
  move(25);
  expect(previewX()).toBe(32.0625);
  // The live input's Enter handler calls this same commit callback.
  node(LiveEntryInput).props.onCommit();
  render();
  expect(storedX()).toBe(32.0625);
});

it('anchor 3: an anchored run shows the existing message and never enters move mode', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].runs[0].anchors.left = true;
  render();
  key('m');
  expect(state.message).toBe('Anchored — set Anchor to Free to move');
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(storedX()).toBe(12);
  expect(dispatch.mock.calls.every(([action]) => action.type.endsWith('/setMessage'))).toBe(true);
});

it('anchor 4: Escape restores x 12 with no dispatch and releases the move cursor', () => {
  key('m');
  move(20.3);
  key('Escape');
  expect(storedX()).toBe(12);
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(dispatch).not.toHaveBeenCalled();
  expect(tree[0].props.style.cursor).not.toBe('move');
});

it('cancels on right-click and on an invalid move without dispatching a run change', () => {
  key('m');
  move(20.3);
  const preventDefault = vi.fn();
  node(Stage).props.onContextMenu({ evt: { preventDefault } });
  render();
  expect(preventDefault).toHaveBeenCalled();
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(dispatch).not.toHaveBeenCalled();
  key('m');
  move(200);
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(storedX()).toBe(12);
  expect(state.message).toBe('out-of-bounds');
});

it('cancels when switching tool or wall face, and on unmount', () => {
  key('m');
  move(20.3);
  dispatch(setTool('draw'));
  render();
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  dispatch(setTool('select'));
  render();
  key('m');
  side = 'back';
  render();
  expect(active()).toBe(false);
  expect(storedX()).toBe(12);
  side = 'front';
  render();
  dispatch(setSelection({ runId: 'run-1' }));
  render();
  key('m');
  expect(active()).toBe(true);
  hooks.unmount();
  render();
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(storedX()).toBe(12);
});

it('ignores M without a run, inside inputs, with modifiers, during entry, or on repeat', () => {
  key('m', { target: { tagName: 'INPUT' } });
  key('m', { ctrlKey: true });
  key('m', { metaKey: true });
  key('m', { repeat: true });
  expect(active()).toBe(false);
  dispatch(setSelection({}));
  render();
  key('m');
  expect(active()).toBe(false);
  dispatch(setSelection({ runId: 'run-1' }));
  render();
  key('m');
  move(20.3);
  key('m');
  expect(previewX()).toBe(32.5);
  key('Enter');
  expect(storedX()).toBe(32.5);
});
