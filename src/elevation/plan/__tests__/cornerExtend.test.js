import { beforeEach, describe, expect, it, vi } from 'vitest';
import { K, KC } from '../../../test/fixtures/landingRoomK.js';
import { createLiveEntryController } from '../../canvas/useLiveEntry.js';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../../model/constants.js';
import elevationReducer, {
  createInitialElevationState,
  extendPastCorner,
  setWallLength,
} from '../../store/elevationSlice.js';
import planStageGestures from '../usePlanStageGestures.js';
import planWallEdits from '../usePlanWallEdits.js';

// Hooks called as plain functions: useCallback is identity, effects never run.
vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useEffect: () => {},
}));

// The plan reads its grid from the view prefs merged into settings.
const settings = { ...DEFAULT_SETTINGS, ...DEFAULT_PREFS };
let state, controller, dispatch, pointer, liveGestureRef;
const geometry = (room) => room.walls.map(({ id, x1, y1, x2, y2, flipped, connections, landings }) => ({
  id, x1, y1, x2, y2, flipped, connections, landings,
}));
const stageRef = { current: { getPointerPosition: () => pointer } };
const toWorld = (point) => point;

function begin(wallId, growEnd) {
  const room = state.rooms[0];
  planWallEdits({
    room, walls: room.walls, dispatch, stageRef, liveGestureRef, toWorld,
    setEntryPointer: vi.fn(), beginEntry: controller.begin, settings,
  }).beginWallLength(wallId, growEnd, {});
}
function drag(to) {
  pointer = to;
  planStageGestures({
    settings, tool: 'select', entry: controller.entry, dispatch, stageRef,
    panRef: { current: false }, spacePressedRef: { current: false }, liveGestureRef, toWorld,
    measure: {}, updateEntry: controller.update, setEntryPointer: vi.fn(),
  }).handleMouseMove({ evt: {} });
}
const load = (room) => {
  state = { ...createInitialElevationState(null), rooms: [structuredClone(room)], activeRoomId: room.id };
};

beforeEach(() => {
  load(KC);
  controller = createLiveEntryController();
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  pointer = { x: -38.5, y: 9 };
  liveGestureRef = { current: null };
});

describe('corner arrow Move corner / Extend past (WL3)', () => {
  it('wall-3\'s arrow at the wall-2 corner opens Move corner at its length', () => {
    begin('wall-3', 'left');
    expect(controller.entry).toMatchObject({
      kind: 'wall-length', label: 'Move corner', value: 85, modeKey: 'length',
    });
    expect(controller.entry.modes.map(({ key, label }) => [key, label])).toEqual([
      ['length', 'Move corner'], ['extend', 'Extend past Wall 2'],
    ]);
  });

  it('Tab, 39, Enter extends past wall-2 and gives back Room K', () => {
    begin('wall-3', 'left');
    controller.cycle();
    expect(controller.entry).toMatchObject({ label: 'Extend past Wall 2', value: 0, min: 0, modeKey: 'extend' });
    controller.setTyped('39');
    controller.commit();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(extendPastCorner({ wallId: 'wall-3', endpoint: 'start', amount: 39 }));
    expect(geometry(state.rooms[0])).toEqual(geometry(K));
    expect(liveGestureRef.current).toBeNull();
  });

  it('Move corner commits a length change as before', () => {
    begin('wall-3', 'left');
    controller.setTyped('90');
    controller.commit();
    expect(dispatch).toHaveBeenCalledWith(setWallLength({ wallId: 'wall-3', length: 90, growEnd: 'left' }));
  });

  it('wall-2\'s arrow at the same corner extends wall-2', () => {
    begin('wall-2', 'right');
    controller.cycle();
    expect(controller.entry.label).toBe('Extend past Wall 3');
    controller.setTyped('10');
    controller.commit();
    expect(dispatch).toHaveBeenCalledWith(extendPastCorner({ wallId: 'wall-2', endpoint: 'end', amount: 10 }));
  });

  it('in Extend mode the drag is the extension, never below 0', () => {
    begin('wall-3', 'left');
    controller.cycle();
    drag({ x: -26.5, y: 9 });
    expect(controller.entry.value).toBe(12);
    drag({ x: -50, y: 9 });
    expect(controller.entry.value).toBe(0);
    controller.cycle();
    drag({ x: -26.5, y: 9 });
    expect(controller.entry).toMatchObject({ modeKey: 'length', value: 97 });
  });

  it('Escape dispatches nothing', () => {
    begin('wall-3', 'left');
    controller.cycle();
    controller.setTyped('39');
    controller.cancel();
    expect(dispatch).not.toHaveBeenCalled();
    expect(liveGestureRef.current).toBeNull();
  });

  it('a corner that can\'t be extended past keeps the plain length entry', () => {
    load({
      ...K,
      walls: [
        ...K.walls.map((entry) => entry.id === 'wall-3'
          ? { ...entry, connections: { ...entry.connections, start: { wallId: 'wall-5', endpoint: 'start' } } }
          : entry),
        { ...K.walls[2], id: 'wall-5', x1: 0.5, y1: 9, x2: 20.5, y2: 9,
          connections: { start: { wallId: 'wall-3', endpoint: 'start' }, end: null } },
      ],
    });
    begin('wall-3', 'left');
    expect(controller.entry).toMatchObject({ label: 'Wall length', value: 124 });
    expect(controller.entry.modes).toBeUndefined();
    controller.commit();
    expect(dispatch).toHaveBeenCalledWith(setWallLength({ wallId: 'wall-3', length: 124, growEnd: 'left' }));
  });
});
