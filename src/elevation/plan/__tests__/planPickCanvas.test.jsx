import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Line, Stage } from 'react-konva';
import elevationReducer, { setSelection, setTool, setActiveWall } from '../../store/elevationSlice.js';
import { opening, room, run, wall } from '../../../test/builders.js';
import { syncRoom } from '../../model/roomSync.js';
import { wallSideFrame } from '../../model/wallSides.js';
import { runFootprint } from '../../model/footprints.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import PlanCanvas from '../PlanCanvas.jsx';
import PlanScene from '../PlanScene.jsx';
import PlanOverlays from '../PlanOverlays.jsx';
import SelectionPicker, { PlanPickOutline } from '../../components/SelectionPicker.jsx';
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
  useId: () => 'pick-test',
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
const picker = () => node(SelectionPicker).props.picker;
const keys = () => picker()?.candidates.map(({ key }) => key);
const key = (value) => {
  let stopped = false;
  const event = {
    key: value, target: { tagName: 'DIV' }, preventDefault: vi.fn(),
    stopImmediatePropagation: () => { stopped = true; },
  };
  [...(listeners.get('keydown') ?? [])].sort((a, b) => Number(b.capture) - Number(a.capture))
    .forEach(({ fn }) => { if (!stopped) fn(event); });
  render();
};
const point = (world) => {
  const layer = node(Layer).props;
  pointer = { x: (world.x - layer.offsetX) * layer.scaleX, y: (world.y - layer.offsetY) * layer.scaleY };
};
const click = (world, target = 'run') => {
  point(world);
  [...(listeners.get('pointerdown') ?? [])].forEach(({ fn }) => fn({ target: {} }));
  const event = { target: stage, evt: { button: 0 }, type: 'click' };
  const scene = node(PlanScene).props;
  if (target === 'run') scene.handleRunSelect(event);
  else if (target === 'wall') scene.handleWallSelect('W1', event);
  else if (target === 'opening') scene.handleOpeningSelect(event, 'door-1');
  else node(Stage).props.onClick(event);
  render();
  expect(event.cancelBubble).toBe(true);
};
const choose = (key) => { node(SelectionPicker).props.onChoose(key); render(); };
const hover = (key) => { node(SelectionPicker).props.onHover(key); render(); };
const contextClick = () => {
  node(Stage).props.onContextMenu({ evt: { preventDefault: vi.fn() } });
  render();
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
        if (value?.width === 0 && value?.height === 0) value = { width: 576, height: 800 };
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
  state = {
    ...elevationReducer(undefined, { type: '@@init' }),
    rooms: [syncRoom(room({ walls: [wall({
      id: 'W1', x2: 120, thickness: 0, thicknessOverride: 0,
      runs: [run({ id: 'B', x: 10, width: 60, depth: 24 })],
    })] }), { ...DEFAULT_SETTINGS })],
    activeRoomId: 'room-1', activeWallId: 'W1', activeWallSide: 'front',
    view: 'plan', tool: 'select', selection: {},
  };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); dirty = true; });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  listeners = new Map();
  vi.stubGlobal('window', {
    addEventListener: (name, fn, capture = false) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add({ fn, capture });
    },
    removeEventListener: (name, fn) => {
      const entries = listeners.get(name);
      entries?.forEach((entry) => { if (entry.fn === fn) entries.delete(entry); });
    },
  });
  vi.stubGlobal('document', { querySelector: () => null });
  stage = { getPointerPosition: () => pointer, getStage: () => stage };
  render = () => {
    dirty = true;
    for (let count = 0; dirty; count += 1) {
      if (count > 20) throw new Error('Canvas did not settle');
      dirty = false;
      index = 0;
      effects = [];
      tree = nodes(PlanCanvas({}));
      node(Stage).ref.current = stage;
      tree.push(...nodes(SelectionPicker(node(SelectionPicker).props)));
      tree.push(...nodes(PlanPickOutline(node(PlanPickOutline).props)));
      tree.push(...nodes(CanvasContextMenu(node(CanvasContextMenu).props)));
      effects.forEach((effect) => effect());
    }
  };
  render();
  point({ x: 55, y: 10 });
  dispatch.mockClear();
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('anchor 1: clicking B at P(40, 12) selects it and opens the two-row list', () => {
  click({ x: 40, y: 12 });
  expect(state.activeWallId).toBe('W1');
  expect(state.selection).toMatchObject({ runId: 'B', pieceId: null });
  expect(keys()).toEqual(['run:B', 'wall:W1']);
  expect(picker()).toMatchObject({ ...pointer, activeKey: 'run:B', hoverKey: null });
  expect(tree.filter(({ type }) => type === 'button')).toHaveLength(2);
});

it('anchor 2: choosing the host wall clears the run and closes the list', () => {
  click({ x: 40, y: 12 });
  dispatch.mockClear();
  choose('wall:W1');
  expect(state.activeWallId).toBe('W1');
  expect(state.selection).toMatchObject({ wallId: 'W1', runId: null });
  expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([setActiveWall.type]);
  expect(picker()).toBeNull();
});

it('anchor 3: clicking P(40, 6) selects the upper first and lists U, B, W1', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].runs.push(run({
    id: 'U', x: 10, width: 60, depth: 12, cabinetTypeId: CABINET_TYPE_IDS.UPPER,
  }));
  render();
  click({ x: 40, y: 6 });
  expect(state.selection.runId).toBe('U');
  expect(keys()).toEqual(['run:U', 'run:B', 'wall:W1']);
});

it('anchor 4: a stage click at P(90, 0.5) picks the bare zero-thickness wall at scale 4', () => {
  expect(node(Layer).props.scaleX).toBe(4);
  click({ x: 90, y: 0.5 }, 'stage');
  expect(state.selection).toMatchObject({ wallId: 'W1', runId: null });
  expect(picker()).toBeNull();
});

it('anchor 5: an empty stage click clears the selection and list', () => {
  click({ x: 40, y: 12 });
  click({ x: 400, y: 400 }, 'stage');
  expect(state.selection).toMatchObject({ wallId: null, runId: null, openingId: null });
  expect(picker()).toBeNull();
});

it('anchor 6: repeated clicks on B select B every time instead of cycling to another run', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].runs.unshift(run({ id: 'under', x: 10, width: 60 }));
  render();
  for (let i = 0; i < 2; i += 1) {
    click({ x: 40, y: 12 });
    expect(state.selection.runId).toBe('B');
    expect(picker().activeKey).toBe('run:B');
    expect(keys()).toEqual(['run:B', 'run:under', 'wall:W1']);
  }
});

it('anchor 7: hovering B draws its footprint last in the world layer with screen-sized dashes', () => {
  click({ x: 40, y: 12 });
  hover('run:B');
  const host = state.rooms[0].walls[0];
  const points = runFootprint(wallSideFrame(state.rooms[0], host), host.runs[0], state.settings)
    .flatMap(({ x, y }) => [x, y]);
  expect(nodes(node(Layer)).at(-1).type).toBe(PlanPickOutline);
  expect(node(Line).props).toMatchObject({
    points, closed: true, stroke: '#f472b6', strokeWidth: 0.5,
    dash: [1.5, 1], listening: false,
  });
  hover(null);
  expect(node(Line)).toBeUndefined();
});

it('anchor 8: the door tool still places an opening on W1 without a list', () => {
  dispatch(setTool('door'));
  render();
  click({ x: 90, y: 0 }, 'wall');
  expect(state.rooms[0].walls[0].openings).toHaveLength(1);
  expect(state.tool).toBe('select');
  expect(state.selection.openingId).toBe(state.rooms[0].walls[0].openings[0].id);
  expect(picker()).toBeNull();
});

it('anchor 9: drag-start selects the opening directly and closes an existing list', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].openings.push(opening({ offset: 24 }));
  render();
  click({ x: 40, y: 12 });
  dispatch(setSelection({ openingId: 'door-1' }));
  render();
  point({ x: 40, y: 0 });
  const event = { type: 'dragstart' };
  node(PlanScene).props.handleOpeningSelect(event, 'door-1');
  render();
  expect(state.selection.openingId).toBe('door-1');
  expect(event.cancelBubble).toBe(true);
  expect(picker()).toBeNull();
});

it('wall and opening clicks use the same stack and choosing an opening sets its host first', () => {
  state = structuredClone(state);
  state.rooms[0].walls[0].openings.push(opening({ offset: 24 }));
  render();
  for (const target of ['wall', 'opening', 'stage']) {
    click({ x: 40, y: 0.5 }, target);
    expect(state.selection.runId).toBe('B');
    expect(keys()).toEqual(['run:B', 'opening:door-1', 'wall:W1']);
  }
  dispatch.mockClear();
  choose('opening:door-1');
  expect(dispatch.mock.calls.map(([action]) => [action.type, action.payload])).toEqual([
    [setActiveWall.type, 'W1'], [setSelection.type, { openingId: 'door-1' }],
  ]);
  expect(state.selection.openingId).toBe('door-1');
  expect(picker()).toBeNull();
});

it('arrow keys hover, Enter chooses, and Escape closes through SelectionPicker', () => {
  click({ x: 40, y: 12 });
  key('ArrowDown');
  expect(picker().hoverKey).toBe('wall:W1');
  key('ArrowUp');
  expect(picker().hoverKey).toBe('run:B');
  key('ArrowDown');
  key('Enter');
  expect(state.selection).toMatchObject({ wallId: 'W1', runId: null });
  expect(picker()).toBeNull();
  click({ x: 40, y: 12 });
  key('Escape');
  expect(picker()).toBeNull();
});

it.each(['pointerdown', 'wheel'])('closes on %s outside the list', (name) => {
  click({ x: 40, y: 12 });
  [...listeners.get(name)].forEach(({ fn }) => fn({ target: {} }));
  render();
  expect(picker()).toBeNull();
});

it('closes when a right-click menu or run move starts', () => {
  click({ x: 40, y: 12 });
  contextClick();
  expect(menu()).toBeDefined();
  expect(picker()).toBeNull();
  click({ x: 40, y: 12 });
  expect(menu()).toBeUndefined();
  key('m');
  expect(node(LiveEntryInput).props.entry.kind).toBe('run-move');
  expect(picker()).toBeNull();
});

it.each(['measure', 'wall', 'room'])('closes on %s context change and stays closed when returning', (change) => {
  click({ x: 40, y: 12 });
  if (change === 'room') {
    state = { ...state, activeRoomId: 'another-room' };
  } else dispatch(setTool(change));
  render();
  expect(picker()).toBeNull();
  state = { ...state, activeRoomId: 'room-1', tool: 'select' };
  render();
  expect(picker()).toBeNull();
});

it('keeps the wall pick margin at four screen pixels as zoom changes', () => {
  for (let i = 0; i < 2; i += 1) {
    const scale = node(Layer).props.scaleX;
    click({ x: 90, y: 3.99 / scale }, 'stage');
    expect(state.selection.wallId).toBe('W1');
    click({ x: 90, y: 4.01 / scale }, 'stage');
    expect(state.selection.wallId).toBeNull();
    node(Stage).props.onWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
    render();
  }
});

it('starting a wall-length entry closes the picker and blocks shape picks until the entry ends', () => {
  click({ x: 40, y: 12 });
  node(PlanOverlays).props.beginWallLength('W1', 'right', {});
  render();
  expect(node(LiveEntryInput).props.entry.kind).toBe('wall-length');
  expect(picker()).toBeNull();
  dispatch.mockClear();
  for (const target of ['run', 'wall', 'opening']) click({ x: 90, y: 0.5 }, target);
  expect(dispatch).not.toHaveBeenCalled();
  node(LiveEntryInput).props.onCancel();
  render();
  expect(picker()).toBeNull();
});
