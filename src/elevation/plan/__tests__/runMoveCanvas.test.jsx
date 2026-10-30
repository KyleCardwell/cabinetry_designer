import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Stage } from 'react-konva';
import elevationReducer, { setSelection, setTool, setView, setActiveWall, setActiveWallSide } from '../../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { wallSideFrame } from '../../model/wallSides.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanRunFootprint from '../PlanRunFootprint.jsx';
import LiveEntryInput from '../../components/LiveEntryInput.jsx';
import CanvasContextMenu from '../../components/CanvasContextMenu.jsx';
import { attach, line } from '../../../test/builders.js';
import { updateRootItem } from '../../model/grid.js';
import { runShortLabel } from '../../model/joints.js';
import { syncRoom } from '../../model/room.js';
import room8 from '../../model/__tests__/fixtures/room8.json';

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
const contextClick = (world, footprint = false) => {
  point(world);
  const preventDefault = vi.fn();
  const event = { evt: { preventDefault } };
  if (footprint) {
    const scene = nodes(PlanScene(node(PlanScene).props));
    const run = scene.find(({ type }) => type === PlanRunFootprint);
    nodes(PlanRunFootprint(run.props))[0].props.onContextMenu(event);
    expect(event.cancelBubble).toBe(true);
  } else node(Stage).props.onContextMenu(event);
  render();
  expect(preventDefault).toHaveBeenCalledOnce();
};
const menu = () => tree.find(({ props }) => props.role === 'menu');

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

it('anchor 1: a right-to-left wall projects −10 world x to run x +10, previews then commits on click', () => {
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

it('anchor 2: a 90° wall projects +6.2 world y to run x +6; typed fractions stay exact through Enter', () => {
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

it('uses the topmost footprint menu and its wall side; cancels and restores on all exit paths and rejects anchored runs', () => {
  state = structuredClone(state);
  const wall = state.rooms[0].walls[0];
  wall.runs.push(run({ ...wall.runs[0], id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 60 }));
  render();
  contextClick({ x: 25, y: 10 }, true);
  expect(state.selection.runId).toBe('upper');
  expect(menu()).toBeDefined();
  const item = tree.find(({ props }) => props.role === 'menuitem');
  expect(item.props.children).toBe('Move run');
  item.props.onClick();
  render();
  expect(active()).toBe(true);
  expect(menu()).toBeUndefined();
  key('Escape');
  expect(active()).toBe(false);
  contextClick({ x: 25, y: 10 });
  contextClick({ x: 110, y: 70 });
  expect(menu()).toBeUndefined();

  state = structuredClone(state);
  state.rooms[0].walls[0].runs = [run({ ...state.rooms[0].walls[0].runs[0], wallSide: 'back' })];
  render();
  contextClick({ x: 95, y: -10 }, true);
  expect(menu()).toBeDefined();
  expect(state.activeWallSide).toBe('back');
  tree.find(({ props }) => props.role === 'menuitem').props.onClick();
  render();
  move({ x: 85, y: -10 });
  expect(previewX()).toBe(22);
  contextClick({ x: 85, y: -10 });
  expect(active()).toBe(false);
  expect(menu()).toBeUndefined();
  expect(storedX()).toBe(12);

  const exits = [
    () => key('Escape'),
    () => { dispatch(setTool('wall')); render(); },
    () => { dispatch(setView('elevation')); render(); },
    () => { dispatch(setActiveWallSide('front')); render(); },
    () => { dispatch(setActiveWall('wall-2')); render(); },
    () => move({ x: -500, y: -10 }),
  ];
  state = structuredClone(state);
  state.rooms[0].walls.push({ ...state.rooms[0].walls[0], id: 'wall-2', y1: 200, y2: 200, runs: [] });
  const initial = structuredClone(state);
  for (const exit of exits) {
    state = structuredClone(initial);
    render();
    point({ x: 95, y: -10 });
    key('m');
    move({ x: 85, y: -10 });
    expect(previewX()).toBe(22);
    dispatch.mockClear();
    exit();
    expect(active()).toBe(false);
    expect(storedX()).toBe(12);
    expect(previewX()).toBe(12);
    expect(tree[0].props.style.cursor).not.toBe('move');
    expect(dispatch.mock.calls.some(([action]) => /replaceRun|replaceWallLayout/.test(action.type))).toBe(false);
  }
  state = structuredClone(initial);
  state.rooms[0].walls[0].runs[0].anchors.left = true;
  render();
  key('m');
  expect(active()).toBe(false);
  expect(state.message).toBe('Anchored — set Anchor to Free to move');
});

it('LL5 c anchor 4: plan M refuses the R8L1 hood with its line message and no live entry', () => {
  const subject = structuredClone(room8);
  const target = subject.walls.find(({ id }) => id === '14154ec7-5eeb-4511-8d78-5d3da7b09418');
  const hoodId = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
  target.lines = [line('L1', 99, { from: 'right' })];
  target.runs.find(({ id }) => id === hoodId).attach = attach('L1');
  const base = target.runs.find(({ id }) => id === '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3');
  base.autoCount = false;
  base.grid = updateRootItem(base.grid, 'e77c1c0c-b386-4716-bc71-0f23ec1e585c', { attach: attach('L1') });
  state = { ...structuredClone(state), rooms: [syncRoom(subject, state.settings)], activeRoomId: subject.id, activeWallId: target.id };
  render();
  dispatch(setSelection({ runId: hoodId }));
  render();
  const before = state.rooms;
  dispatch.mockClear();
  const resolved = syncRoom(subject, state.settings).walls.find(({ id }) => id === target.id);
  const hood = resolved.runs.find(({ id }) => id === hoodId);
  key('m');
  expect(state.message).toBe(`${runShortLabel(hood)} is attached to line L1: move the line, or detach.`);
  expect(active()).toBe(false);
  expect(state.rooms).toBe(before);
  expect(dispatch.mock.calls.every(([action]) => action.type.endsWith('/setMessage'))).toBe(true);
  expect(tree[0].props.style.cursor).not.toBe('move');
});
