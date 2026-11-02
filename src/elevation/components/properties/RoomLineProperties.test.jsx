import { beforeEach, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { attach, line, opening, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import elevationReducer, {
  clearSelection, createInitialElevationState, deleteRoomLine, promoteLayoutLine,
  setActiveWall, setActiveWallSide, setSelection, updateRoomLine,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import TextInput from '../TextInput.jsx';
import PropertiesPanel from '../PropertiesPanel.jsx';
import PropertiesHeader from '../PropertiesHeader.jsx';
import LineAttachSection from './LineAttachSection.jsx';
import LineProperties from './LineProperties.jsx';
import RoomLineProperties from './RoomLineProperties.jsx';
import RunGeometrySection from './RunGeometrySection.jsx';
import { setWallAttachment } from '../../store/elevationSlice.js';

vi.mock('react', async (original) => ({
  ...await original(), useEffect: vi.fn(), useMemo: (callback) => callback(),
  useCallback: (callback) => callback, useRef: (current) => ({ current }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text(props.children) === label);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
let fixture, state, dispatch;

beforeEach(() => {
  vi.clearAllMocks();
  fixture = syncRoom(room({ walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36, ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ], roomLines: [roomLine('R1', { from: 'right', value: 99 })] }), DEFAULT_SETTINGS);
  state = { ...createInitialElevationState(null), rooms: [fixture], activeRoomId: fixture.id,
    activeWallId: 'wall-2', activeWallSide: 'front', selection: { wallId: 'wall-2', roomLineId: 'R1' } };
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

it('anchor 4: shows the reference, distance, four parallel face choices and attachments across the room', () => {
  const tree = RoomLineProperties({ room: fixture, wall: resolveWall(fixture, fixture.walls[1]), line: fixture.roomLines[0] });
  const select = field(tree, 'Room line measured from');
  expect(nodes(select).filter(({ type }) => type === 'option').map(({ props }) => props.children))
    .toEqual(['Wall 1', 'Wall 1 (back)', 'Wall 2', 'Wall 2 (back)']);
  expect(select.props.value).toBe(JSON.stringify(['wall-1', 'front']));
  expect(button(tree, 'Right end').props['aria-pressed']).toBe(true);
  expect(field(tree, 'Room line distance')).toMatchObject({ type: InchInput, props: { value: 99 } });
  expect(text(tree)).toContain('On this wall: 39 from the left end');
  const sink = button(tree, 'Wall 2 · Run 1');
  expect(sink).toBeDefined();
  sink.props.onClick();
  expect(dispatch.mock.calls).toEqual([
    [setActiveWall('wall-2')], [setActiveWallSide('front')], [setSelection({ runId: 'sink' })],
  ]);
});

it('anchor 2: warns exactly when the attached line lands 30 past the left end', () => {
  fixture = syncRoom({ ...fixture, roomLines: [roomLine('R1', { from: 'right', value: 30 })] }, DEFAULT_SETTINGS);
  const tree = RoomLineProperties({ room: fixture, wall: resolveWall(fixture, fixture.walls[1]), line: fixture.roomLines[0] });
  expect(text(tree)).toContain('R1 is 30 past the left end of this wall.');
  const back = RoomLineProperties({ room: fixture, wall: resolveWall(fixture, fixture.walls[1], 'back'), line: fixture.roomLines[0] });
  expect(text(back)).not.toContain('past the');
});

it('anchor 6: the sink run picker lists face lines before R1 (room), and excludes out-of-square lines for new attachments', () => {
  fixture.walls[1].lines = [line('L1', 20)];
  const face = resolveWall(fixture, fixture.walls[1]);
  const runSection = RunGeometrySection({ room: fixture, wall: face, run: face.runs[0], settings: DEFAULT_SETTINGS,
    actionBase: { wallId: face.id, runId: 'sink' }, validateAndDispatch: vi.fn() });
  const section = nodes(runSection).find(({ type }) => type === LineAttachSection);
  const options = nodes(LineAttachSection(section.props)).filter(({ type }) => type === 'option');
  expect(options.map(({ props }) => text(props.children))).toEqual(['None', 'L1', 'R1 (room)', 'New line here']);

  const skew = { ...section.props.lines.at(-1), square: false };
  const attached = LineAttachSection({ ...section.props, lines: [section.props.lines[0], skew], line: skew });
  expect(nodes(attached).filter(({ type }) => type === 'option').map(({ props }) => props.value)).toContain('R1');
  const detached = LineAttachSection({ ...section.props, lines: [skew], line: null, attach: null });
  expect(nodes(detached).filter(({ type }) => type === 'option').map(({ props }) => props.value)).not.toContain('R1');
  const warning = nodes(attached).find(({ type }) => type?.name === 'AttachedRoomLineWarning');
  expect(text(warning.type(warning.props)))
    .toBe("R1 isn't square to this wall (it's measured from Wall 1); things on it here hold at the nearest point.");
});

it('anchor 7: promotes L1 then selects the room line with its original id', () => {
  const ownLine = line('L1', 99, { from: 'right' });
  fixture.walls[0].lines = [ownLine];
  const tree = LineProperties({ wall: resolveWall(fixture, fixture.walls[0]), line: ownLine, settings: DEFAULT_SETTINGS });
  button(tree, 'Make it a room line').props.onClick();
  expect(dispatch.mock.calls).toEqual([
    [promoteLayoutLine({ wallId: 'wall-1', lineId: 'L1' })], [setSelection({ roomLineId: 'L1' })],
  ]);
});

it('edits label, reference, end and distance through room-line actions, and deletes with attachment pruning', () => {
  let tree = RoomLineProperties({ room: fixture, line: fixture.roomLines[0] });
  const label = field(tree, 'Room line label');
  expect(label.type).toBe(TextInput);
  expect(label.props.onCommit('  ')).toBe(false);
  expect(label.props.onCommit('x'.repeat(25))).toBe(false);
  expect(label.props.onCommit('  Sink  ')).toBe(true);
  expect(dispatch).toHaveBeenLastCalledWith(updateRoomLine({ roomId: fixture.id, roomLineId: 'R1', label: 'Sink' }));
  field(tree, 'Room line measured from').props.onChange({ target: { value: JSON.stringify(['wall-2', 'back']) } });
  expect(state.rooms[0].roomLines[0]).toMatchObject({ wallId: 'wall-2', wallSide: 'back', from: 'right', value: 39 });
  expect(state.rooms[0].walls[1].runs[0].x).toBe(21);
  fixture = state.rooms[0];
  tree = RoomLineProperties({ room: fixture, line: fixture.roomLines[0] });
  button(tree, 'Left end').props.onClick();
  expect(state.rooms[0].roomLines[0]).toMatchObject({ from: 'left', value: 81 });
  expect(state.rooms[0].walls[1].runs[0].x).toBe(21);
  expect(field(tree, 'Room line distance').props.onCommit(-1)).toBe(false);
  expect(field(tree, 'Room line distance').props.onCommit(Infinity)).toBe(false);
  expect(field(tree, 'Room line distance').props.onCommit(75)).toBe(true);
  expect(state.rooms[0].roomLines[0].value).toBe(75);
  button(tree, 'Delete').props.onClick();
  expect(dispatch).toHaveBeenLastCalledWith(deleteRoomLine({ roomId: fixture.id, roomLineId: 'R1' }));
  expect(state.rooms[0].roomLines).toBeUndefined();
  expect(state.rooms[0].walls[1].runs[0].attach).toBeUndefined();
});

it('selects attachments on other wall faces, and shows the out-of-square warning in the line properties', () => {
  fixture.walls[0].openings = [opening({ id: 'window', kind: 'window', label: 'W1', attach: attach('R1') })];
  fixture.walls[2].runs = [run({ id: 'back-run', wallSide: 'back', attach: attach('R1') })];
  fixture = syncRoom(fixture, DEFAULT_SETTINGS);
  const tree = RoomLineProperties({ room: fixture, wall: resolveWall(fixture, fixture.walls[2], 'back'), line: fixture.roomLines[0] });
  expect(text(tree)).toContain("R1 isn't square to this wall (it's measured from Wall 1); things on it here hold at the nearest point.");
  button(tree, 'Wall 1 · W1').props.onClick();
  expect(dispatch.mock.calls.slice(-3)).toEqual([
    [setActiveWall('wall-1')], [setActiveWallSide('front')], [setSelection({ openingId: 'window' })],
  ]);
  button(tree, 'Wall 3 · Run 1').props.onClick();
  expect(dispatch.mock.calls.slice(-3)).toEqual([
    [setActiveWall('wall-3')], [setActiveWallSide('back')], [setSelection({ runId: 'back-run' })],
  ]);
});

it('routes room-line selection to the panel and header, supports no selected wall, and clears a missing line', () => {
  let tree = PropertiesPanel();
  expect(nodes(tree).find(({ type }) => type === RoomLineProperties).props.line.id).toBe('R1');
  const header = nodes(tree).find(({ type }) => type === PropertiesHeader);
  expect(text(PropertiesHeader(header.props))).toContain('Room line R1');
  state = { ...state, selection: { roomLineId: 'R1' } };
  tree = PropertiesPanel();
  const properties = nodes(tree).find(({ type }) => type === RoomLineProperties);
  expect(properties.props.wall).toBeNull();
  expect(text(PropertiesHeader({ room: fixture, roomLine: fixture.roomLines[0] }))).toContain('Room line R1');
  expect(text(RoomLineProperties(properties.props))).toContain('Measured from');
  dispatch(deleteRoomLine({ roomLineId: 'R1' }));
  dispatch.mockClear();
  useEffect.mockClear();
  PropertiesPanel();
  useEffect.mock.calls.forEach(([effect]) => effect());
  expect(dispatch).toHaveBeenCalledWith(clearSelection());
});

it('LL8 f anchor 5: lists the held island, selects its wall, and omits both held faces from Measured from', () => {
  fixture = syncRoom({ ...fixture, roomLines: [roomLine('R1', { from: 'right', value: 110 })] }, DEFAULT_SETTINGS);
  state = { ...state, rooms: [fixture] };
  dispatch(setWallAttachment({ wallId: 'wall-2', attach: attach('R1') }));
  fixture = state.rooms[0];
  dispatch.mockClear();
  const tree = RoomLineProperties({ room: fixture, wall: resolveWall(fixture, fixture.walls[1]), line: fixture.roomLines[0] });
  expect(nodes(field(tree, 'Room line measured from')).filter(({ type }) => type === 'option').map(({ props }) => props.children))
    .toEqual(['Wall 1', 'Wall 1 (back)']);
  expect(button(tree, 'Wall 2 · Run 1')).toBeDefined();
  button(tree, 'Wall 2 (island)').props.onClick();
  expect(dispatch.mock.calls).toEqual([[setActiveWall('wall-2')]]);
  expect(state.activeWallId).toBe('wall-2');
  expect(state.activeWallSide).toBe('front');
  expect(state.selection.wallId).toBe('wall-2');
  expect(state.selection.roomLineId).toBeFalsy();
});

it('LL8 f: omits every face in a held group and lists a held wall even with no attached contents', () => {
  fixture.walls[1].runs = [];
  fixture.walls[1].attach = attach('R1');
  fixture.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
  fixture.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 0, y2: 96,
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
  fixture = syncRoom(fixture, DEFAULT_SETTINGS);
  const tree = RoomLineProperties({ room: fixture, line: fixture.roomLines[0] });
  const choices = nodes(field(tree, 'Room line measured from')).filter(({ type }) => type === 'option');
  expect(choices.map(({ props }) => props.value))
    .toEqual([JSON.stringify(['wall-1', 'front']), JSON.stringify(['wall-1', 'back'])]);
  expect(nodes(tree).filter(({ type, props }) => type === 'button' && text(props.children).endsWith(' (island)'))).toHaveLength(1);
  expect(text(tree)).not.toContain('Nothing is attached.');
});
