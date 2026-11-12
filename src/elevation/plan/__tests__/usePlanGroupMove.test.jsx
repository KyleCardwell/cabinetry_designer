import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Rect, Stage } from 'react-konva';
import elevationReducer, { createInitialElevationState, moveWallGroup } from '../../store/elevationSlice.js';
import { attach, room, roomLine, run, wall } from '../../../test/builders.js';
import { elevationToPlan } from '../../model/geometry.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanOverlays from '../PlanOverlays.jsx';
import LiveEntryInput from '../../components/LiveEntryInput.jsx';
import CanvasContextMenu from '../../components/CanvasContextMenu.jsx';
import SelectionPicker from '../../components/SelectionPicker.jsx';

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
const overlays = () => nodes(PlanOverlays(node(PlanOverlays).props));
const handles = () => overlays().filter(({ type, props }) => type === Rect && props.onClick);
const groupHandle = () => handles().find(({ props }) => props.fill === '#a78bfa');
const begin = () => {
  const event = {};
  groupHandle().props.onClick(event);
  expect(event.cancelBubble).toBe(true);
  render();
};
const groupActions = () => dispatch.mock.calls.map(([action]) => action)
  .filter(({ type }) => type.endsWith('/moveWallGroup'));
const fixture = () => room({ walls: [
  wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
  wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
    id: 'sink', width: 36, ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
  })] }),
  wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
], roomLines: [roomLine('R1', { from: 'right', value: 120 })] });
const scene = () => node(PlanScene).props;
const island = () => scene().walls.find(({ id }) => id === 'wall-2');
const entry = () => node(LiveEntryInput).props.entry;
const inputNodes = () => {
  const canvasHooks = hooks;
  hooks = { ...hooks, state: (value) => [value, () => {}], memo: (callback) => callback(), effect: () => {} };
  try { return nodes(LiveEntryInput(node(LiveEntryInput).props)); }
  finally { hooks = canvasHooks; }
};
const inputKey = (key) => {
  inputNodes().find(({ type }) => type === 'input').props.onKeyDown({
    key, preventDefault: vi.fn(), stopPropagation: vi.fn(),
  });
  render();
};
const tab = () => inputKey('Tab');

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
  state = { ...createInitialElevationState(null), rooms: [syncRoom(fixture(), DEFAULT_SETTINGS)],
    activeRoomId: 'room-1', activeWallId: 'wall-2', activeWallSide: 'front', view: 'plan', tool: 'select',
    selection: { wallId: 'wall-2' } };
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
  point({ x: 120, y: 96 });
  dispatch.mockClear();
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('anchor 3: snaps along 10.2 to 10, syncs the sink at plan x 120 and commits once ahead of picking', () => {
  const before = state.rooms[0];
  begin();
  expect(entry().label).toBe('Along Wall 2');
  move({ x: 109.8, y: 96 });
  expect(entry().value).toBe(10);
  expect(island().x1).toBe(170);
  expect(scene().walls).toBe(scene().room.walls);
  const sink = scene().orderedFootprints.find(({ run }) => run.id === 'sink');
  expect(sink.run.x).toBe(32);
  expect(elevationToPlan(sink.frame, sink.run.x + 18, 0).x).toBe(120);
  expect(node(PlanOverlays).props.wallMovePreview.affectedWallIds).toEqual(['wall-2']);
  expect(node(SelectionPicker).props.picker).toBeNull();
  // The top transparent layer intercepts object clicks; its target isn't the stage.
  const layers = tree.filter(({ type }) => type === Layer);
  expect(nodes(layers.at(-1)).some(({ type, props }) => type === Rect && props.fill === 'transparent')).toBe(true);
  expect(state.rooms[0]).toBe(before);
  click(); click();
  expect(groupActions()).toEqual([moveWallGroup({ wallId: 'wall-2', along: 10 })]);
  expect(state.rooms[0].walls[1].x1).toBe(170);
  expect(state.selection.wallId).toBe('wall-2');
  expect(active()).toBe(false);
});

it('anchor 4: Tab resets along to zero, uses Across Wall 2 and Enter commits across 6', () => {
  begin(); move({ x: 110, y: 96 }); tab();
  expect(entry()).toMatchObject({ label: 'Across Wall 2', value: 0 });
  expect(island().x1).toBe(180);
  move({ x: 110, y: 90 });
  expect(island()).toMatchObject({ x1: 180, y1: 90, x2: 60, y2: 90 });
  key('Enter');
  expect(groupActions()).toEqual([moveWallGroup({ wallId: 'wall-2', across: 6 })]);
});

it('anchor 5: typed 12 overrides subsequent pointer motion and the input Enter commits it', () => {
  begin(); type('12'); move({ x: 50, y: 90 });
  expect(island().x1).toBe(168);
  inputKey('Enter');
  expect(groupActions()).toEqual([moveWallGroup({ wallId: 'wall-2', along: 12 })]);
});

