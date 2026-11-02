import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Rect, Stage } from 'react-konva';
import elevationReducer, {
  createInitialElevationState, moveWallGroup, setSelection, setTool, setView, setActiveWall, setActiveWallSide,
} from '../../store/elevationSlice.js';
import { attach, room, roomLine, run, wall } from '../../../test/builders.js';
import { elevationToPlan, wallFrame } from '../../model/geometry.js';
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

it('anchor 1: adds a violet diamond 18 screen pixels along the wall from the unchanged wall handle', () => {
  const [wallHandle, group] = handles();
  const scale = node(Layer).props.scaleX;
  expect(handles()).toHaveLength(2);
  expect(wallFrame(state.rooms[0], island())).toMatchObject({ r: { x: -1, y: 0 }, n: { x: 0, y: -1 } });
  expect(group.props).toMatchObject({
    x: wallHandle.props.x - 18 / scale, y: wallHandle.props.y,
    width: 10 / scale, height: 10 / scale, rotation: 45, fill: '#a78bfa',
  });
  group.props.onMouseEnter(); render();
  expect(tree[0].props.style.cursor).toBe('move');
  groupHandle().props.onMouseLeave(); render();
  expect(tree[0].props.style.cursor).not.toBe('move');
  wallHandle.props.onClick({}); render();
  expect(entry().kind).toBe('wall-perpendicular');
});

it('anchor 2: a whole-room group has only the wall handle and M does nothing', () => {
  state = { ...state, rooms: [syncRoom(room({ walls: [fixture().walls[1]] }), DEFAULT_SETTINGS)] };
  render();
  expect(handles()).toHaveLength(1);
  expect(groupHandle()).toBeUndefined();
  key('m');
  expect(active()).toBe(false);
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

it('anchor 6: a held island offers only Across Wall 2 and the input has no Tab hint', () => {
  const subject = fixture();
  subject.walls[1].attach = attach('R1');
  state = { ...state, rooms: [syncRoom(subject, DEFAULT_SETTINGS)] }; render();
  begin();
  expect(entry().modes.map(({ key, label }) => ({ key, label })))
    .toEqual([{ key: 'across', label: 'Across Wall 2' }]);
  const input = inputNodes();
  expect(input.find(({ type }) => type === 'p').props.children.flat().join('')).not.toContain('Tab');
  move({ x: 100, y: 90 }); key('Enter');
  expect(groupActions()).toEqual([moveWallGroup({ wallId: 'wall-2', across: 6 })]);
});

it('anchor 7: Escape clears the preview without dispatching a move', () => {
  const before = state.rooms[0];
  begin(); move({ x: 110, y: 96 }); key('Escape');
  expect(groupActions()).toEqual([]);
  expect(active()).toBe(false);
  expect(scene().room).toBe(before);
  expect(node(PlanOverlays).props.wallMovePreview).toBeNull();
  expect(tree[0].props.style.cursor).not.toBe('move');
});

it('anchor 8: M starts group move with a wall selected and the existing run move with the sink selected', () => {
  key('M');
  expect(entry().kind).toBe('wall-group-move');
  key('Escape');
  dispatch(setSelection({ runId: 'sink' })); render();
  key('M');
  // The existing run move refuses a line-held sink; a free sink starts the original gesture.
  expect(active()).toBe(false);
  expect(state.message).toContain('attached to line R1');
  const subject = fixture(); delete subject.walls[1].runs[0].attach;
  state = { ...state, rooms: [syncRoom(subject, DEFAULT_SETTINGS)] }; render();
  key('M');
  expect(entry().kind).toBe('run-move');
});

it('anchor 9: a refused preview keeps the last good room and a refused commit dispatches no move', () => {
  const subject = fixture();
  subject.walls = subject.walls.slice(1);
  subject.walls[0].runs = [];
  subject.roomLines = [roomLine('R2', { wallId: 'wall-2', value: 5 })];
  state = { ...state, rooms: [syncRoom(subject, DEFAULT_SETTINGS)] }; render();
  begin(); move({ x: 118, y: 96 });
  const good = scene().room;
  expect(island().x1).toBe(178);
  move({ x: 110, y: 96 });
  expect(scene().room).toBe(good);
  expect(state.message).toBe('R2 would end up past the end of every wall it can be measured from: move R2 first.');
  expect(active()).toBe(true);
  click();
  expect(groupActions()).toEqual([]);
  expect(scene().room).toBe(state.rooms[0]);
});

it('cancels on right-click, room/wall/selection/tool/view change and unmount, with no late commit', () => {
  const initial = state;
  for (const exit of [
    () => node(Stage).props.onContextMenu({ evt: { preventDefault: vi.fn() } }),
    () => { state = { ...state, rooms: [{ ...state.rooms[0], id: 'other' }], activeRoomId: 'other' }; },
    () => dispatch(setActiveWall('wall-3')),
    () => dispatch(setActiveWallSide('back')),
    () => dispatch(setSelection({ runId: 'sink' })),
    () => dispatch(setTool('wall')),
    () => dispatch(setView('elevation')),
    () => hooks.unmount(),
  ]) {
    state = initial; render(); point({ x: 120, y: 96 });
    begin(); move({ x: 110, y: 96 });
    exit(); render();
    expect(active()).toBe(false);
    expect(scene().room).toBe(state.rooms[0]);
    expect(tree[0].props.style.cursor).not.toBe('move');
    key('Enter');
    expect(groupActions()).toEqual([]);
  }
});

it('highlights and translates every connected island wall with its wall-relative contents', () => {
  const subject = fixture();
  subject.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
  subject.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
  state = { ...state, rooms: [syncRoom(subject, DEFAULT_SETTINGS)] }; render();
  begin(); move({ x: 110, y: 96 });
  const frame = wallFrame(state.rooms[0], state.rooms[0].walls[1]);
  // Joining W5 flips W2's front frame: negative along still gives plan delta (−10, 0).
  expect(frame.r).toEqual({ x: 1, y: 0 });
  expect(entry().value).toBe(-10);
  expect(node(PlanOverlays).props.wallMovePreview.affectedWallIds).toEqual(['wall-2', 'wall-5']);
  expect(scene().walls.find(({ id }) => id === 'wall-5')).toMatchObject({ x1: 50, y1: 96, x2: 50, y2: 150 });
});

