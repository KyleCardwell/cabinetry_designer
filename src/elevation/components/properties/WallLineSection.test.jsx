import { beforeEach, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { attach, line, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import elevationReducer, { createInitialElevationState, setWallAttachment } from '../../store/elevationSlice.js';
import WallList from '../WallList.jsx';
import WallHeightProperties from './WallHeightProperties.jsx';
import WallLineSection from './WallLineSection.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useEffect: vi.fn(), useRef: (current) => ({ current }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text(props.children) === label);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => text(props.children));
let fixture, state, dispatch;

beforeEach(() => {
  vi.clearAllMocks();
  fixture = syncRoom(room({ walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, lines: [line('L1', 20)], runs: [run({
      id: 'sink', x: 0, width: 36, ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ], roomLines: [roomLine('R1', { from: 'right', value: 110 })] }), DEFAULT_SETTINGS);
  state = { ...createInitialElevationState(null), rooms: [fixture], activeRoomId: fixture.id,
    activeWallId: 'wall-2', activeWallSide: 'back', view: 'plan' };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

it('anchor 1: mounts after wall height and offers only eligible room lines, with no new-line option', () => {
  const sections = nodes(WallList()).filter(({ type }) => [WallHeightProperties, WallLineSection].includes(type));
  expect(sections.map(({ type }) => type)).toEqual([WallHeightProperties, WallLineSection]);
  expect(sections[1].props.wall).toBe(fixture.walls[1]);
  expect(options(WallLineSection(sections[1].props))).toEqual(['None', 'R1']);
  expect(options(WallLineSection({ room: fixture, wall: fixture.walls[2] }))).toEqual(['None']);
  expect(options(WallLineSection({ room: fixture, wall: fixture.walls[0] }))).toEqual(['None']);
});

it('anchor 2: picking R1 attaches at centre and zero, placing the island and sink through the store', () => {
  const tree = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  expect(field(tree, 'Wall line offset')).toBeUndefined();
  field(tree, 'Wall layout line').props.onChange({ target: { value: 'R1' } });
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: attach('R1') }));
  expect(state.rooms[0].walls[1]).toMatchObject({ x1: 190, x2: 70, runs: [{ x: 42 }] });
  fixture = state.rooms[0];
  const held = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  expect(button(held, 'Centre').props['aria-pressed']).toBe(true);
  field(held, 'Wall layout line').props.onChange({ target: { value: '' } });
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: null }));
  expect(state.rooms[0].walls[1]).toMatchObject({ x1: 190, x2: 70 });
  expect(state.rooms[0].walls[1]).not.toHaveProperty('attach');
});

it('anchor 3: edits front-frame ends and signed offsets while preserving the other attachment fields', () => {
  dispatch(setWallAttachment({ wallId: 'wall-2', attach: attach('R1') }));
  fixture = state.rooms[0];
  let tree = WallLineSection({ room: fixture, wall: resolveWall(fixture, fixture.walls[1], 'back') });
  button(tree, 'Left end').props.onClick();
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: attach('R1', 'left') }));
  fixture = state.rooms[0];
  tree = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  expect(field(tree, 'Wall line offset').props.onCommit(3)).toBe(true);
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: attach('R1', 'left', 3) }));
  expect(state.rooms[0].walls[1]).toMatchObject({ x1: 127, x2: 7 });
  fixture = state.rooms[0];
  tree = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  button(tree, 'Right end').props.onClick();
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: attach('R1', 'right', 3) }));
  fixture = state.rooms[0];
  tree = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  expect(field(tree, 'Wall line offset').props.onCommit(-3)).toBe(true);
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: attach('R1', 'right', -3) }));
  dispatch.mockClear();
  expect(field(tree, 'Wall line offset').props.onCommit(Infinity)).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
});

it('anchor 4: another held leg shows only the note using the topology wall label (Wall 3 for W2)', () => {
  fixture.walls[1].attach = attach('R1');
  fixture.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
  fixture.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
  fixture = syncRoom(fixture, DEFAULT_SETTINGS);
  const tree = WallLineSection({ room: fixture, wall: fixture.walls[3] });
  expect(text(tree)).toBe('Moves with Wall 3, which is on R1.');
  expect(nodes(tree).filter(({ type }) => ['select', 'button'].includes(type))).toEqual([]);
});

it('anchor 6: a turned reference retains the attached option and gives the wall-specific warning', () => {
  fixture.walls[1].attach = attach('R1');
  fixture.walls[0].y2 = 10;
  fixture = syncRoom(fixture, DEFAULT_SETTINGS);
  const tree = WallLineSection({ room: fixture, wall: fixture.walls[1] });
  expect(text(tree)).toContain("R1 isn't square to Wall 2; Wall 2 stays where it is.");
  expect(options(tree)).toEqual(['None', 'R1']);
  expect(field(tree, 'Wall layout line').props.value).toBe('R1');
  field(tree, 'Wall layout line').props.onChange({ target: { value: '' } });
  expect(dispatch).toHaveBeenLastCalledWith(setWallAttachment({ wallId: 'wall-2', attach: null }));
});

it('hides the section when the wall group is the whole room', () => {
  fixture = room({ walls: [fixture.walls[0]], roomLines: fixture.roomLines });
  expect(WallLineSection({ room: fixture, wall: fixture.walls[0] })).toBeNull();
});
