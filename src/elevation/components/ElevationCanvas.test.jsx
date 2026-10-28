import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Rect, Stage } from 'react-konva';
import { resolveWall, syncRoom } from '../model/room.js';
import { wallToScreen } from '../canvas/transform.js';
import elevationReducer, { setDoorsOff, setSelection, setTool } from '../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../store/__tests__/helpers/sliceFixtures.js';
import ElevationCanvas from './ElevationCanvas.jsx';
import ElevationPreviews from './ElevationPreviews.jsx';
import LiveEntryInput from './LiveEntryInput.jsx';
import RunGroup from './RunGroup.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import NeighborProfiles from './NeighborProfiles.jsx';
import CanvasContextMenu from './CanvasContextMenu.jsx';
import DimensionRow from './DimensionRow.jsx';
import ElevationDimensions from './ElevationDimensions.jsx';
import MeasureOverlay from './MeasureOverlay.jsx';
import MeasureReadout from './MeasureReadout.jsx';
import { defaultPick, pickStack } from '../model/pick.js';

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
const contextClick = (x = 25, z = 20) => {
  pointer = wallToScreen({ x, z }, node(RunGroup).props.transform);
  const preventDefault = vi.fn();
  node(Stage).props.onContextMenu({ evt: { preventDefault } });
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
      tree.push(...nodes(CanvasContextMenu(node(CanvasContextMenu).props)));
      const dimensions = nodes(ElevationDimensions(node(ElevationDimensions).props));
      tree.push(...dimensions);
      dimensions.filter(({ type }) => type === DimensionRow).forEach(({ props }) => {
        tree.push(...nodes(DimensionRow(props)));
      });
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

it('DM8 passes the doors-off view to returns and profiles on the active canvas', () => {
  for (const doorsOff of [true, false]) {
    dispatch(setDoorsOff(doorsOff));
    render();
    expect(node(RunGroup).props.doorsOff).toBe(doorsOff);
    expect(node(NeighborReturns).props.doorsOff).toBe(doorsOff);
    expect(node(NeighborProfiles).props.doorsOff).toBe(doorsOff);
  }
});

it('MS2b anchor 7: cabinet clicks measure without selection changes, and clear through right-click and Esc', () => {
  dispatch(setTool('measure'));
  render();
  const selection = state.selection;
  const rooms = state.rooms;
  dispatch.mockClear();
  expect(node(MeasureReadout).props).toMatchObject({ axisLabels: { x: 'Across', y: 'Up' } });
  const layers = node(Stage).props.children.flat().filter(Boolean);
  expect(layers.at(-1).props.listening).toBe(false);
  // This hit surface sits above every cabinet and combined face that stops click bubbling.
  const hit = layers.at(-2).props.children;
  expect(hit.type).toBe(Rect);
  expect(hit.props).toMatchObject({ width: 1100, height: 800, fill: 'transparent' });
  expect(layers.at(-2).props.listening).not.toBe(false);
  const at = (x, z) => { pointer = wallToScreen({ x, z }, node(RunGroup).props.transform); };
  at(12, 4);
  click();
  expect(node(MeasureOverlay).props.first).toMatchObject({ kind: 'corner', point: { x: 12, y: 4 } });
  at(42, 34.5);
  node(Stage).props.onMouseMove({ evt: { shiftKey: false } });
  render();
  expect(node(MeasureOverlay).props.preview).toMatchObject({ kind: 'points', dx: 30, dy: 30.5 });
  expect(node(MeasureReadout).props.result).toBe(node(MeasureOverlay).props.preview);
  node(Stage).props.onMouseLeave();
  render();
  expect(node(MeasureOverlay).props.hover).toBeNull();
  click();
  expect(node(MeasureOverlay).props.measures).toHaveLength(1);
  expect(node(MeasureReadout).props.result).toBe(node(MeasureOverlay).props.measures[0].result);
  at(100, 0);
  node(Stage).props.onClick({ target: stage, evt: { button: 0, shiftKey: true } });
  render();
  expect(node(MeasureOverlay).props.first.kind).toBe('on-edge');
  contextClick();
  expect(node(MeasureOverlay).props.first).toBeNull();
  expect(node(MeasureOverlay).props.measures).toHaveLength(1);
  expect(menu()).toBeUndefined();
  click();
  key('Escape');
  expect(node(MeasureOverlay).props.first).toBeNull();
  expect(node(MeasureOverlay).props.measures).toHaveLength(1);
  key('Escape');
  expect(node(MeasureOverlay).props.measures).toEqual([]);
  expect(state.tool).toBe('measure');
  expect(state.selection).toBe(selection);
  expect(state.rooms).toBe(rooms);
  expect(dispatch).not.toHaveBeenCalled();
  key('Escape');
  expect(state.tool).toBe('select');
  expect(node(MeasureReadout)).toBeUndefined();
});

it('preserves Measure pan/zoom, suppresses pan clicks, and resets on face or tool changes', () => {
  key('d');
  click();
  const original = node(RunGroup).props.transform;
  node(Stage).props.onWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
  render();
  expect(node(RunGroup).props.transform.scale).toBeGreaterThan(original.scale);
  expect(node(MeasureOverlay).props.first).not.toBeNull();
  const pan = (button, space) => {
    if (space) key(' ', { code: 'Space' });
    const first = node(MeasureOverlay).props.first;
    node(Stage).props.onPointerDown({ target: { getStage: () => stage }, evt: {
      button, pointerId: 1, clientX: 100, clientY: 100, preventDefault: vi.fn(),
    } });
    node(Stage).props.onMouseMove({ evt: {} });
    render();
    expect(node(MeasureOverlay).props.hover).toBeNull();
    [...listeners.get('pointermove')].forEach((fn) => fn({ pointerId: 1, clientX: 120, clientY: 110 }));
    render();
    [...listeners.get('pointerup')].forEach((fn) => fn({ type: 'pointerup', pointerId: 1 }));
    click();
    expect(node(MeasureOverlay).props.first).toBe(first);
    expect(node(MeasureOverlay).props.measures).toEqual([]);
    vi.runOnlyPendingTimers();
    if (space) [...listeners.get('keyup')].forEach((fn) => fn({ code: 'Space' }));
    render();
  };
  const beforePan = node(RunGroup).props.transform;
  pan(1, false);
  pan(0, true);
  expect(node(RunGroup).props.transform.offsetX).toBeCloseTo(beforePan.offsetX + 40);
  expect(node(RunGroup).props.transform.offsetY).toBeCloseTo(beforePan.offsetY + 20);
  node(Stage).props.onClick({ target: stage, evt: { button: 1 } });
  render();
  expect(node(MeasureOverlay).props.measures).toEqual([]);
  side = 'back';
  render();
  expect(node(MeasureOverlay).props.first).toBeNull();
  click();
  expect(node(MeasureOverlay).props.first).not.toBeNull();
  key('d');
  expect(node(MeasureOverlay)).toBeUndefined();
  key('d');
  expect(node(MeasureOverlay).props.first).toBeNull();
  expect(node(MeasureOverlay).props.measures).toEqual([]);
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

it('step b anchor 1: right-click selects the run under the pointer and opens Move run (+ CV1 Center over…)', () => {
  // An overlapping run follows the same pick order as a left click, even with a different selection.
  state = structuredClone(state);
  const wall = state.rooms[0].walls[0];
  wall.runs.push({ ...structuredClone(wall.runs[0]), id: 'overlap',
    items: [auto('overlap-cabinet')] });
  render();
  dispatch(setSelection({ runId: 'overlap' }));
  render();
  const resolvedRoom = syncRoom(state.rooms[0], state.settings);
  const resolvedWall = resolveWall(resolvedRoom, resolvedRoom.walls[0], side);
  const leftClick = defaultPick(pickStack(resolvedRoom, resolvedWall, state.settings, { x: 25, z: 20 }));
  contextClick();
  expect(state.selection.runId).toBe(leftClick.selection.runId);
  expect(state.selection.pieceId).toBeNull();
  expect(active()).toBe(false);
  expect(menu().props.style).toEqual({ left: pointer.x, top: pointer.y });
  const items = tree.filter(({ props }) => props.role === 'menuitem');
  expect(items.map(({ props }) => props.children)).toEqual(['Move run', 'Center over…']);

  // Empty canvas still suppresses the browser menu and closes the run menu.
  contextClick(100, 80);
  expect(menu()).toBeUndefined();
  contextClick();
  expect(menu()).toBeDefined();
  [...listeners.get('pointerdown')].forEach((listener) => listener({ target: {} }));
  render();
  expect(menu()).toBeUndefined();
  contextClick();
  [...listeners.get('wheel')].forEach((listener) => listener({}));
  render();
  expect(menu()).toBeUndefined();
  contextClick();
  menu().props.onContextMenu({ preventDefault: vi.fn() });
  render();
  expect(menu()).toBeUndefined();
  contextClick();
  key('Escape', { stopImmediatePropagation: vi.fn() });
  expect(menu()).toBeUndefined();
  contextClick();
  dispatch(setTool('draw'));
  render();
  expect(menu()).toBeUndefined();
  dispatch(setTool('select'));
  render();
  expect(menu()).toBeUndefined();
  dispatch(setTool('draw'));
  render();
  // Right-click can also select a run while another tool is active.
  contextClick();
  expect(state.tool).toBe('select');
  expect(menu()).toBeDefined();
  side = 'back';
  render();
  expect(menu()).toBeUndefined();
  side = 'front';
  render();
  expect(menu()).toBeUndefined();
});

it('step b anchor 2: Move run enters the same pointer move mode as M', () => {
  contextClick();
  tree.find(({ props }) => props.role === 'menuitem').props.onClick();
  render();
  expect(menu()).toBeUndefined();
  expect(active()).toBe(true);
  expect(tree[0].props.style.cursor).toBe('move');
  expect(node(LiveEntryInput).props.entry.label).toBe('Move');
  pointer = wallToScreen({ x: 45.3, z: 20 }, node(RunGroup).props.transform);
  node(Stage).props.onMouseMove({ target: stage });
  render();
  expect(previewX()).toBe(32.5);
  expect(storedX()).toBe(12);
  contextClick();
  expect(active()).toBe(false);
  expect(previewX()).toBeUndefined();
  expect(menu()).toBeUndefined();
  expect(storedX()).toBe(12);

  // The menu follows the same anchored-run refusal as the keyboard shortcut.
  state = structuredClone(state);
  state.rooms[0].walls[0].runs[0].anchors.left = true;
  render();
  contextClick();
  tree.find(({ props }) => props.role === 'menuitem').props.onClick();
  render();
  expect(active()).toBe(false);
  expect(menu()).toBeUndefined();
  expect(state.message).toBe('Anchored — set Anchor to Free to move');
});

it('step b anchor 3: clicking a run dimension twice only selects, with no drag handlers or move mode', () => {
  dispatch(setSelection({}));
  render();
  const rows = tree.filter(({ type, props }) => type === DimensionRow && props.onSegmentClick);
  expect(rows).toHaveLength(2);
  rows.forEach(({ props }) => {
    expect(props).not.toHaveProperty('draggableRuns');
    expect(props).not.toHaveProperty('onSegmentDragStart');
    expect(props).not.toHaveProperty('onSegmentDragMove');
    expect(props).not.toHaveProperty('onSegmentDragEnd');
  });
  for (let i = 0; i < 2; i += 1) {
    const hit = tree.find(({ type, props }) => type === Rect && props.onClick);
    hit.props.onClick({ evt: { button: 0 } });
    render();
    expect(state.selection.runId).toBe('run-1');
    expect(state.selection.pieceId).toBeNull();
    expect(active()).toBe(false);
    expect(previewX()).toBeUndefined();
    expect(storedX()).toBe(12);
  }
  tree.filter(({ type, props }) => type === Rect && props.onClick).forEach(({ props }) => {
    expect(props.draggable).toBeUndefined();
    expect(props.onDragStart).toBeUndefined();
    expect(props.onDragMove).toBeUndefined();
    expect(props.onDragEnd).toBeUndefined();
  });
  expect(tree[0].props.style.cursor).not.toBe('move');
});
