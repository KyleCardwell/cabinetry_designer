import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { auto, room, run, wall } from '../../../test/builders.js';
import elevationReducer, {
  createInitialElevationState,
  setRoomTFiller,
  setRunTFiller,
  setWallTFiller,
} from '../../store/elevationSlice.js';
import { resolveWall } from '../../model/room.js';
import RoomStylePanel from '../RoomStylePanel.jsx';
import StyleFields from '../properties/StyleFields.jsx';
import RunCabinetsSection from '../properties/RunCabinetsSection.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';
import PanelSection from '../panel/PanelSection.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const currentRun = () => currentWall().runs[0];
const actionBase = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const select = (tree, level) => nodes(tree).find(({ type, props }) => (
  type === 'select' && props['aria-label'] === `${level} T-fillers`
));
const options = (field) => nodes(field).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, props.children]);
const runTree = () => RunCabinetsSection({ run: currentRun(), actionBase });
const wallTree = (plan = false, side = 'front') => WallHeightProperties({
  room: currentRoom(), wall: resolveWall(currentRoom(), currentWall(), side), plan,
});
const change = (field, value) => field.props.onChange({ target: { value } });
const expectBorder = (field, overridden) => {
  expect(field.props.className).toContain(overridden ? 'border-teal-500' : 'border-gray-600');
  expect(field.props.className).not.toContain(overridden ? 'border-gray-600' : 'border-teal-500');
};

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState({
    rooms: [room({ walls: [wall({ runs: [run({ items: [auto('cabinet-1')] })] })] })],
    activeRoomId: 'room-1',
  });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('FX8 step b T-filler selects', () => {
  it('sets room Every edge below the style fields and shows Follow room without dispatching on render', () => {
    const tree = RoomStylePanel();
    const styleIndex = nodes(tree).findIndex(({ type }) => type === StyleFields);
    expect(nodes(tree).indexOf(select(tree, 'Room'))).toBeGreaterThan(styleIndex);
    change(select(tree, 'Room'), 'all');
    expect(dispatch).toHaveBeenLastCalledWith(setRoomTFiller({ roomId: 'room-1', value: 'all' }));
    dispatch.mockClear();
    const field = select(runTree(), 'Run');
    expect(field.props.value).toBe('');
    expect(options(field)[0]).toEqual(['', 'Follow room (Every edge)']);
    expectBorder(field, false);
    expect(currentRun()._tFiller).toBe('all');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([true, false])('places the wall select in Wall for plan=%s and shows Follow wall after setting Between cabinets', (plan) => {
    change(select(RoomStylePanel(), 'Room'), 'all');
    const section = nodes(wallTree(plan)).find(({ type, props }) => type === PanelSection && props.id === 'wall.main');
    const field = select(section, 'Wall');
    expect(options(field)[0]).toEqual(['', 'Follow room (Every edge)']);
    change(field, 'seams');
    expect(dispatch).toHaveBeenLastCalledWith(setWallTFiller({
      roomId: 'room-1', wallId: 'wall-1', value: 'seams',
    }));
    dispatch.mockClear();
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow wall (Between cabinets)']);
    expect(currentRun()._tFiller).toBe('seams');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('stores run None explicitly and clears only the run override with Follow', () => {
    change(select(RoomStylePanel(), 'Room'), 'all');
    change(select(runTree(), 'Run'), 'none');
    expect(dispatch).toHaveBeenLastCalledWith(setRunTFiller({ ...actionBase, value: 'none' }));
    expect(currentRun().tFiller).toBe('none');
    expect(currentRun()._tFiller).toBeUndefined();
    expect(select(runTree(), 'Run').props.value).toBe('none');
    expectBorder(select(runTree(), 'Run'), true);
    change(select(runTree(), 'Run'), '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunTFiller({ ...actionBase, value: null }));
    expect(currentRun()).not.toHaveProperty('tFiller');
    expect(currentRun()._tFiller).toBe('all');
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow room (Every edge)']);
  });

  it('labels absent inheritance as None and respects an explicit wall None', () => {
    expect(options(select(wallTree(), 'Wall'))[0]).toEqual(['', 'Follow room (None)']);
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow room (None)']);
    change(select(RoomStylePanel(), 'Room'), 'all');
    change(select(wallTree(), 'Wall'), 'none');
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow wall (None)']);
    expect(currentRun()._tFiller).toBeUndefined();
    change(select(wallTree(), 'Wall'), '');
    expect(dispatch).toHaveBeenLastCalledWith(setWallTFiller({
      roomId: 'room-1', wallId: 'wall-1', value: null,
    }));
    expect(currentWall()).not.toHaveProperty('tFiller');
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow room (Every edge)']);
  });

  it.each(['Room', 'Wall', 'Run'])('offers all three values at %s and marks each own value as an override', (level) => {
    const render = { Room: RoomStylePanel, Wall: wallTree, Run: runTree }[level];
    const field = () => select(render(), level);
    expect(field().props.value).toBe('');
    expectBorder(field(), false);
    expect(options(field()).slice(1)).toEqual([
      ['none', 'None'], ['seams', 'Between cabinets'], ['all', 'Every edge'],
    ]);
    for (const value of ['none', 'seams', 'all']) {
      change(field(), value);
      expect(field().props.value).toBe(value);
      expectBorder(field(), true);
    }
    change(field(), '');
    expect(dispatch.mock.lastCall[0].payload.value).toBeNull();
    expect(field().props.value).toBe('');
    expectBorder(field(), false);
  });

  it('uses the same wall setting on the back elevation', () => {
    change(select(wallTree(false, 'back'), 'Wall'), 'all');
    expect(currentWall().tFiller).toBe('all');
    expect(select(wallTree(false, 'back'), 'Wall').props.value).toBe('all');
    expect(options(select(runTree(), 'Run'))[0]).toEqual(['', 'Follow wall (Every edge)']);
  });
});
