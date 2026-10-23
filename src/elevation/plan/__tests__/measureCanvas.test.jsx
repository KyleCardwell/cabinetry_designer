import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Rect, Stage } from 'react-konva';
import elevationReducer, { createInitialElevationState, setSelection } from '../../store/elevationSlice.js';
import { auto, room, run, wall } from '../../../test/builders.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import MeasureOverlay from '../../components/MeasureOverlay.jsx';
import MeasureReadout from '../../components/MeasureReadout.jsx';
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
  useId: () => 'measure-test',
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
const click = (extra = {}) => {
  node(Stage).props.onClick({ target: { getStage: () => stage }, evt: { button: 0, ...extra } });
  render();
};
const move = (world, shiftKey = false) => {
  point(world);
  node(Stage).props.onMouseMove({ evt: { shiftKey } });
  render();
};
const overlay = () => node(MeasureOverlay).props;
const emit = (name, event) => [...(listeners.get(name) ?? [])].forEach((fn) => fn(event));

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
    remount() { hooks.unmount(); slots.length = 0; },
  };
  state = createInitialElevationState({
    rooms: [room({ walls: [wall({ x2: 120, runs: [run({
      x: 12, width: 30, autoCount: false, items: [auto('cabinet')],
      ends: { left: { type: 'none' }, right: { type: 'none' } },
    })] })] })],
    activeRoomId: 'room-1', activeWallId: 'wall-1', view: 'plan',
  });
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

it('anchor 1: scale 2 and pan (10, 20) map (5, 5) to (20, 30) and round-trip through the pointer', () => {
  state = structuredClone(state);
  // The existing fit logic gives scale 1004 / 502 = 2 and pan (10, 20).
  Object.assign(state.rooms[0].walls[0], { x1: 19, x2: 521, y1: 190, y2: 190 });
  state.activeRoomId = state.rooms[0].id = 'transform-room';
  key('d');
  expect(node(Layer).props).toMatchObject({ scaleX: 2, scaleY: 2, offsetX: -5, offsetY: -10 });
  expect(overlay().toScreen({ x: 5, y: 5 })).toEqual({ x: 20, y: 30 });
  pointer = { x: 20, y: 30 };
  click();
  expect(overlay().first).toMatchObject({ kind: 'free', point: { x: 5, y: 5 } });
  move({ x: 15, y: 190 }); // Eight screen pixels from the wall corner.
  expect(overlay().hover.kind).toBe('corner');
  move({ x: 13, y: 190 }); // Twelve screen pixels is outside the ten-pixel tolerance.
  expect(overlay().hover.kind).toBe('free');
  const layers = node(Stage).props.children.flat().filter(Boolean);
  expect(layers.at(-1).props).toMatchObject({ listening: false });
  expect(layers.at(-1).props.scaleX).toBeUndefined();
  expect(layers.at(-1).props.offsetX).toBeUndefined();
  expect(layers.at(-1).props.children.type).toBe(MeasureOverlay);
  expect(layers.at(-2).props.children.type).toBe(Rect);
  expect(layers.at(-2).props.children.props).toMatchObject({ width: 1100, height: 800, fill: 'transparent' });
  expect(node(MeasureReadout).props.axisLabels).toEqual({ x: 'X', y: 'Y' });
});

it('anchor 2: run clicks measure without changing selection; previews, Shift, leave, context menu and Esc share the measure lifecycle', () => {
  key('d');
  const selection = state.selection;
  const rooms = state.rooms;
  dispatch.mockClear();
  // The footprint is not selectable in Measure; its events reach the stage hit surface.
  expect(node(PlanScene).props.tool).toBe('measure');
  point({ x: 12, y: 0 });
  node(PlanScene).props.handleRunSelect({});
  click();
  expect(overlay().first).toMatchObject({ kind: 'corner', point: { x: 12 } });
  expect(overlay().first.point.y).toBeCloseTo(0);
  move({ x: 42, y: 24 });
  expect(overlay().hover.kind).toBe('corner');
  expect(overlay().preview).toMatchObject({ kind: 'points', dx: 30, dy: 24 });
  expect(node(MeasureReadout).props.result).toBe(overlay().preview);
  node(Stage).props.onMouseLeave();
  render();
  expect(overlay().hover).toBeNull();
  click();
  expect(overlay().measures).toHaveLength(1);
  expect(node(MeasureReadout).props.result).toBe(overlay().measures[0].result);
  move({ x: 100, y: 0 }, true);
  expect(overlay().hover.kind).toBe('on-edge');
  click({ shiftKey: true });
  expect(overlay().first.kind).toBe('on-edge');
  const preventDefault = vi.fn();
  node(Stage).props.onContextMenu({ evt: { preventDefault } });
  render();
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(overlay().first).toBeNull();
  expect(overlay().measures).toHaveLength(1);
  expect(tree.some(({ props }) => props.role === 'menu')).toBe(false);
  click();
  key('Escape');
  expect(overlay().first).toBeNull();
  expect(overlay().measures).toHaveLength(1);
  key('Escape');
  expect(overlay().measures).toEqual([]);
  expect(state.tool).toBe('measure');
  expect(state.selection).toBe(selection);
  expect(state.rooms).toBe(rooms);
  expect(dispatch).not.toHaveBeenCalled();
});

it('anchor 3: empty Esc returns to Select; pan/zoom suppress clicks and Measure resets on tool, room and canvas changes', () => {
  key('d');
  key('Escape');
  expect(state.tool).toBe('select');
  expect(node(MeasureReadout)).toBeUndefined();
  key('d');
  point({ x: 12, y: 0 });
  click();
  const original = overlay().toScreen({ x: 0, y: 0 });
  const scale = node(Layer).props.scaleX;
  node(Stage).props.onWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
  render();
  expect(node(Layer).props.scaleX).toBeGreaterThan(scale);
  const beforePan = overlay().toScreen({ x: 0, y: 0 });
  expect(beforePan).not.toEqual(original);
  for (const [button, space] of [[1, false], [0, true]]) {
    if (space) key(' ', { code: 'Space' });
    const first = overlay().first;
    if (space) {
      node(Stage).props.onMouseMove({ evt: {} });
      click();
      expect(overlay().hover).toBeNull();
      expect(overlay().first).toBe(first);
    }
    node(Stage).props.onPointerDown({ target: { getStage: () => stage }, evt: {
      button, pointerId: 1, clientX: 100, clientY: 100, preventDefault: vi.fn(),
    } });
    node(Stage).props.onMouseMove({ evt: {} });
    render();
    expect(overlay().hover).toBeNull();
    emit('pointermove', { pointerId: 1, clientX: 120, clientY: 110 });
    render();
    click();
    expect(overlay().first).toBe(first);
    emit('pointerup', { pointerId: 1 });
    click();
    expect(overlay().first).toBe(first);
    expect(overlay().measures).toEqual([]);
    vi.runOnlyPendingTimers();
    if (space) emit('keyup', { code: 'Space' });
    render();
  }
  expect(overlay().toScreen({ x: 0, y: 0 })).toEqual({ x: beforePan.x + 40, y: beforePan.y + 20 });
  click({ button: 1 });
  click({ button: 2 });
  expect(overlay().measures).toEqual([]);
  key('d');
  expect(node(MeasureOverlay)).toBeUndefined();
  key('d');
  expect(overlay().first).toBeNull();
  click();
  expect(overlay().first).not.toBeNull();
  state = structuredClone(state);
  state.activeRoomId = state.rooms[0].id = 'next-room';
  render();
  expect(overlay().first).toBeNull();
  expect(overlay().measures).toEqual([]);
  click();
  // A fresh plan canvas on returning from elevation owns fresh transient measurements.
  hooks.remount();
  render();
  expect(overlay().first).toBeNull();
  expect(overlay().measures).toEqual([]);
});

