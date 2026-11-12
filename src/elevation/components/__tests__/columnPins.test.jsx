import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { attach, auto, opening, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { findCell, runItems } from '../../model/index.js';
import { syncRoom } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { stackedColumn } from '../../model/__tests__/fixtures/pinnedColumn.js';
import elevationReducer, { attachColumnToNewLine, createInitialElevationState, setItemWidth } from '../../store/elevationSlice.js';
import PanelTabs from '../panel/PanelTabs.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import ColumnStepFields from '../properties/ColumnStepFields.jsx';
import ColumnLineSection from '../properties/ColumnLineSection.jsx';
import LineAttachSection, { NEW_LINE } from '../properties/LineAttachSection.jsx';
import PinSection from '../properties/PinSection.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const find = (tree, type) => nodes(tree).find((node) => node.type === type);
const control = (tree, label) => nodes(tree).find(({ props }) => (props['aria-label'] ?? props.ariaLabel) === label);
let state;
const current = () => {
  const room = state.rooms[0];
  const wall = room.walls[0];
  return { room, wall, run: wall.runs[0], settings: state.settings };
};
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const properties = (id = 'B-top') => {
  const props = current();
  const scene = runScene(props.room, props.wall, props.run, props.settings);
  const item = runItems(props.run).find((item) => item.id === id) ?? findCell(props.run.grid, id).cell.node;
  const piece = scene.cells.pieces.find((piece) => piece.id === id);
  const tree = (id === 'A' ? CabinetProperties : CellProperties)({
    ...props, item, piece, layout: scene.result, cells: scene.cells,
  });
  return find(tree, PanelTabs).props.children('size');
};
const pinSection = (id) => PinSection(find(properties(id), PinSection).props);
// LL4 b: expand the shared line controls like markup.
const expand = (tree) => Array.isArray(tree) ? tree.flatMap(expand)
  : tree?.type === LineAttachSection ? LineAttachSection(tree.props)
    : tree && typeof tree === 'object' ? { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } } : tree;
const lineSection = (id) => expand(ColumnLineSection(find(properties(id), ColumnLineSection).props));
const checkbox = (tree) => nodes(tree).find(({ type, props }) => type === 'input' && props.type === 'checkbox');

beforeEach(() => {
  vi.clearAllMocks();
  const source = run({
    autoCount: false, style: { cabinetStyleId: 13 },
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [auto('A'), { ...auto('B'), grid: structuredClone(stackedColumn) }, auto('C')],
  });
  const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
  const initialRoom = syncRoom(room({ walls: [wall({ length: 120, x2: 120, runs: [source] })] }), settings);
  state = createInitialElevationState({ settings, rooms: [initialRoom], activeRoomId: initialRoom.id, activeWallId: 'wall-1' });
  useDispatch.mockReturnValue(dispatch);
});

describe('LL4 b column layout line properties', () => {
  it('anchor 4: selects the top leaf and puts its root column on a new line at its centre (60)', () => {
    const tree = properties();
    const columnSteps = find(tree, ColumnStepFields);
    const section = find(tree, ColumnLineSection);
    expect(section.props).toMatchObject({ nested: true, item: { id: 'B' }, piece: { id: 'B', x: 40, width: 40 } });
    expect(section.props.item).toBe(columnSteps.props.item);
    expect(lineSection().props.title).toBe('Column layout line');
    expect(find(properties(), PinSection)).toBeDefined();
    expect(pinSection()).toBeNull();
    control(lineSection(), 'Column layout line').props.onChange({ target: { value: NEW_LINE } });
    const sent = dispatch.mock.calls.at(-1)[0];
    expect(sent.type).toBe(attachColumnToNewLine.type);
    expect(sent.payload).toMatchObject({ wallId: 'wall-1', runId: 'run-1', itemId: 'B', at: 'center' });
    const [made] = current().wall.lines;
    expect(made).toMatchObject({ label: 'L1', from: 'left', value: 60 });
    expect(current().run.grid.cols[1].attach).toEqual(attach(made.id));
    expect(findCell(current().run.grid, 'B-top').cell.node.attach).toBeUndefined();
    control(lineSection(), 'Column line offset').props.onCommit(-10);
    expect(current().run.grid.cols[1].attach).toEqual(attach(made.id, 'center', -10));
    expect(control(lineSection('B-bottom'), 'Column layout line').props.value).toBe(made.id);
    expect(text(lineSection())).toContain('Moves with L1. To move this column, change L1 or detach.');
    control(lineSection('B-bottom'), 'Column layout line').props.onChange({ target: { value: '' } });
    expect(current().run.grid.cols[1].attach).toBeUndefined();
  });

  it('anchor 3: Right edge sends the attachment with the new point', () => {
    control(lineSection('A'), 'Column layout line').props.onChange({ target: { value: NEW_LINE } });
    const right = nodes(lineSection('A')).find(({ type, props }) => type === 'button' && props.children === 'Right edge');
    right.props.onClick();
    const sent = dispatch.mock.calls.at(-1)[0];
    expect(sent.payload).toMatchObject({
      wallId: 'wall-1', target: { kind: 'column', runId: 'run-1', itemId: 'A' }, attach: { at: 'right', offset: 0 },
    });
    expect(current().run.grid.cols[0].attach.at).toBe('right');
  });

});

describe('DR3b return pin properties', () => {
  beforeEach(() => {
    const { run: source, settings } = current();
    const initialRoom = syncRoom(room({ walls: [
      wall({ length: 120, x2: 120, runs: [source], openings: [opening()] }),
      wall({
        id: 'W', label: 'Wall 4', x1: 60, y1: 0, x2: 60, y2: 72, thickness: 0,
        landings: {
          start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 60 },
          end: null,
        },
        runs: [run({ id: 'R', width: 48, items: [auto('desk')],
          anchors: { left: true, right: false } })],
      }),
    ] }), settings);
    state = createInitialElevationState({ settings, rooms: [initialRoom], activeRoomId: initialRoom.id, activeWallId: 'wall-1' });
    checkbox(pinSection()).props.onChange({ target: { checked: true } });
  });

  it('maps every return edge to its anchor and accepts signed offsets while retaining a typed width', () => {
    dispatch(setItemWidth({ wallId: 'wall-1', runId: 'run-1', itemId: 'B', width: 40 }));
    expect(nodes(control(pinSection(), 'Pinned return edge')).filter(({ type }) => type === 'option').map(text))
      .toEqual(['Left', 'Right', 'Centre', 'Both']);
    for (const [edge, value, left] of [
      ['left', 0, 35.125], ['center', 0, 27.5625],
      ['left', 1.5, 33.625], ['left', -1.5, 36.625],
      ['right', 1.5, 21.5], ['right', -1.5, 18.5],
      ['center', 1.5, 29.0625], ['center', -1.5, 26.0625],
    ]) {
      control(pinSection(), 'Pinned return edge').props.onChange({ target: { value: edge } });
      control(pinSection(), 'Pin offset').props.onCommit(value);
      expect(current().run.grid.cols[1].pin).toEqual(pin(value, {
        from: 'return', wallId: 'W', runId: 'R', edge, anchor: edge,
      }));
      expect(control(pinSection(), 'Pin right offset')).toBeUndefined();
      expect(control(pinSection(), 'Resolved column left edge').props.value).toBe(left);
      expect(control(pinSection(), 'Resolved column width').props.value).toBe(40);
    }
    control(pinSection(), 'Pinned return edge').props.onChange({ target: { value: 'both' } });
    expect(current().run.grid.cols[1].pin).toMatchObject({ edge: 'both', anchor: 'left', valueRight: 0 });
    control(pinSection(), 'Pin left offset').props.onCommit(-1.5);
    control(pinSection(), 'Pin right offset').props.onCommit(-1.5);
    expect(control(pinSection(), 'Resolved column left edge').props.value).toBe(36.625);
    expect(control(pinSection(), 'Resolved column width').props.value).toBe(21.875);
  });

});
