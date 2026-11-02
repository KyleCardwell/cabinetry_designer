import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Line, Text } from 'react-konva';
import { attach, room, roomLine, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { syncRoom } from '../model/roomSync.js';
import elevationReducer, { createInitialElevationState, updateRoomLine } from '../store/elevationSlice.js';
import PlanRoomLines from './PlanRoomLines.jsx';

// Small hook lifecycle harness: keep state/refs across renders and run effect cleanups.
let slots, index, effects, cleanups;
vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback, deps) => {
    const key = index++;
    if (!slots[key] || deps.some((dep, i) => dep !== slots[key].deps[i])) slots[key] = { callback, deps };
    return slots[key].callback;
  },
  useRef: (initial) => {
    const key = index++;
    return slots[key] ??= { current: initial };
  },
  useState: (initial) => {
    const key = index++;
    if (!(key in slots)) slots[key] = initial;
    return [slots[key], (value) => { slots[key] = value; }];
  },
  useEffect: (effect, deps) => {
    const key = index++;
    if (!slots[key] || deps.some((dep, i) => dep !== slots[key][i])) {
      slots[key] = deps;
      effects.push(() => { cleanups[key]?.(); cleanups[key] = effect(); });
    }
  },
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Text: 'text' }));
vi.mock('../canvas/cursor.js', () => ({
  useCursorKeys: (cursor) => ({ request: cursor.request, release: cursor.release }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
let fixture, props, stage, dispatch, onSelect, pointer, cursor;
const render = () => {
  index = 0;
  effects = [];
  const tree = nodes(PlanRoomLines(props));
  effects.forEach((effect) => effect());
  return tree;
};
const guide = () => render().find(({ props }) => props.onPointerDown).props;
const linePoints = () => render().find(({ type }) => type === Line).props.points;
const emit = (type, x = 150, y = 70, extra = {}) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 7, clientX: x * 2 + 30, clientY: y * 2 - 20, ...extra });
  window.dispatchEvent(event);
  return event;
};
const start = (extra = {}) => {
  const event = { evt: { button: 0, pointerId: 7, preventDefault: vi.fn(), ...extra },
    target: { getStage: () => stage } };
  guide().onPointerDown(event);
  return event;
};

beforeEach(() => {
  slots = []; cleanups = []; index = 0; effects = [];
  vi.stubGlobal('window', new EventTarget());
  fixture = syncRoom(room({ walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', width: 36, ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ], roomLines: [roomLine('R1', { from: 'right', value: 99 })] }), DEFAULT_SETTINGS);
  pointer = { x: 312, y: 120 };
  stage = {
    setPointersPositions: (event) => { pointer = { x: event.clientX, y: event.clientY }; },
    getPointerPosition: () => pointer,
  };
  dispatch = vi.fn(); onSelect = vi.fn();
  cursor = { hold: vi.fn(), releaseHold: vi.fn(), request: vi.fn(), release: vi.fn() };
  props = { room: fixture, scale: 2, selectedRoomLineId: 'R1', tool: 'select', entry: null,
    settings: DEFAULT_SETTINGS, dispatch, onSelect, cursor,
    toWorld: ({ x, y }) => ({ x: (x - 30) / 2, y: (y + 20) / 2 }) };
  render();
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup?.());
  vi.unstubAllGlobals();
});

it('anchor 1: takes the press from plan gestures and commits value 90 once on release at x 150, any y', () => {
  const before = structuredClone(fixture);
  const event = start();
  const panOrMarquee = vi.fn();
  if (!event.cancelBubble) panOrMarquee();
  expect(panOrMarquee).not.toHaveBeenCalled();
  expect(event.evt.preventDefault).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
  emit('pointermove', 149, -400);
  emit('pointerup', 150, 900);
  emit('pointerup', 200, 0);
  guide().onClick({});
  expect(onSelect).not.toHaveBeenCalled();
  expect(dispatch.mock.calls).toEqual([[updateRoomLine({ roomLineId: 'R1', value: 90 })]]);
  expect(fixture).toEqual(before);
  const state = { ...createInitialElevationState(null), rooms: [fixture], activeRoomId: fixture.id };
  const next = elevationReducer(state, dispatch.mock.calls[0][0]);
  expect(next.rooms[0].walls[1].runs[0].x).toBe(12);
  expect(cursor.releaseHold).toHaveBeenCalledOnce();
});

it('anchor 2: previews the dashed line and its label at x 150 without dispatch or live run updates', () => {
  start();
  emit('pointermove', 150, 45);
  expect(linePoints()).toEqual([150, -24, 150, 144]);
  expect(render().find(({ type }) => type === Text).props).toMatchObject({ x: 150, y: -24 });
  expect(dispatch).not.toHaveBeenCalled();
  expect(fixture.roomLines[0].value).toBe(99);
  expect(fixture.walls[1].runs[0].x).toBe(21);
});

it('anchor 3: snaps x 150.3 to 150.5 and commits the stored right distance 89.5', () => {
  start();
  emit('pointermove', 150.3);
  expect(linePoints()[0]).toBe(150.5);
  emit('pointerup', 150.3);
  expect(dispatch.mock.calls).toEqual([[updateRoomLine({ roomLineId: 'R1', value: 89.5 })]]);
});

it('anchor 4: clamps x 260 at the reference wall end and commits value 0', () => {
  start();
  emit('pointermove', 260);
  expect(linePoints()[0]).toBe(240);
  emit('pointerup', 260);
  expect(dispatch.mock.calls).toEqual([[updateRoomLine({ roomLineId: 'R1', value: 0 })]]);
});

it('anchor 5: Escape restores x 141, consumes the key before plan keys and ignores a late release', () => {
  start(); emit('pointermove');
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { key: 'Escape' });
  const stop = vi.spyOn(event, 'stopImmediatePropagation');
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(stop).toHaveBeenCalledOnce();
  expect(linePoints()[0]).toBe(141);
  emit('pointerup');
  expect(dispatch).not.toHaveBeenCalled();
  expect(cursor.releaseHold).toHaveBeenCalledOnce();
});

it('cancels on pointer cancellation, lost capture, leaving the window, blur, tool change and unmount', () => {
  for (const type of ['pointercancel', 'lostpointercapture', 'pointerout', 'blur', 'tool', 'unmount']) {
    props.tool = 'select'; render(); start(); emit('pointermove');
    if (type === 'tool') { props.tool = 'measure'; render(); }
    else if (type === 'unmount') cleanups.forEach((cleanup) => cleanup?.());
    else emit(type, 150, 70, { relatedTarget: null });
    expect(linePoints()[0]).toBe(141);
    emit('pointerup');
    expect(dispatch).not.toHaveBeenCalled();
  }
});

it('uses back-face reference coordinates and cursors across horizontal and vertical lines', () => {
  guide().onMouseEnter();
  expect(cursor.request).toHaveBeenLastCalledWith('R1', 'ew-resize');
  guide().onMouseLeave();
  expect(cursor.release).toHaveBeenCalledWith('R1');
  for (const [reference, x, y, value, resize] of [
    [{ wallId: 'wall-1', wallSide: 'back', from: 'right', value: 141 }, 150, 400, 150, 'ew-resize'],
    [{ wallId: 'wall-3', from: 'left', value: 60 }, -40, 80, 80, 'ns-resize'],
  ]) {
    props.room = syncRoom({ ...fixture, roomLines: [roomLine('R1', reference)] }, DEFAULT_SETTINGS);
    render(); start();
    emit('pointermove', x, y);
    expect(cursor.hold).toHaveBeenLastCalledWith(resize);
    emit('pointerup', x, y);
    expect(dispatch).toHaveBeenLastCalledWith(updateRoomLine({ roomLineId: 'R1', value }));
  }
});

it('ignores non-primary presses, disabled tools, live entries and other pointers', () => {
  start({ button: 1 }); start({ button: 2 });
  props.tool = 'measure'; render(); start();
  props.tool = 'select'; props.entry = {}; render(); start();
  emit('pointerup');
  expect(dispatch).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
  props.entry = null; render(); start();
  emit('pointermove', 180, 40, { pointerId: 8 });
  emit('pointercancel', 180, 40, { pointerId: 8 });
  emit('pointerout', 180, 40, { relatedTarget: {} });
  expect(linePoints()[0]).toBe(141);
  emit('pointerup', 150);
  expect(dispatch.mock.calls).toEqual([[updateRoomLine({ roomLineId: 'R1', value: 90 })]]);
});

it('LL7.1: a press on an unselected line only selects it; a selected line drags only past the threshold', () => {
  props.selectedRoomLineId = null;
  guide().onMouseEnter();
  expect(cursor.request).toHaveBeenLastCalledWith('R1', 'pointer');
  const event = start();
  expect(onSelect.mock.calls).toEqual([['R1']]);
  expect(event.evt.preventDefault).not.toHaveBeenCalled();
  emit('pointermove', 160);
  emit('pointerup', 160);
  guide().onClick({});
  expect(onSelect).toHaveBeenCalledOnce();
  expect(linePoints()[0]).toBe(141);
  expect(dispatch).not.toHaveBeenCalled();
  expect(cursor.hold).not.toHaveBeenCalled();

  props.selectedRoomLineId = 'R1'; render();
  start();
  emit('pointermove', 141.5, 70.5);
  emit('pointerup', 141.5, 70.5);
  expect(linePoints()[0]).toBe(141);
  expect(dispatch).not.toHaveBeenCalled();
  expect(cursor.hold).not.toHaveBeenCalled();
  expect(cursor.releaseHold).not.toHaveBeenCalled();
});
