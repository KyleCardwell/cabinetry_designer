import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { findCell, runItems } from '../../model/index.js';
import { syncRoom } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { stackedColumn } from '../../model/__tests__/fixtures/pinnedColumn.js';
import elevationReducer, { createInitialElevationState, setItemPin } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import ColumnStepFields from '../properties/ColumnStepFields.jsx';
import PinSection from '../properties/PinSection.jsx';
import { ReadOnlyValue } from '../properties/Field.jsx';

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
const checkbox = (tree) => nodes(tree).find(({ type, props }) => type === 'input' && props.type === 'checkbox');
const note = 'A second pin locks both pinned cabinets to their current widths.';

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

describe('DR3a column pin properties', () => {
  it('anchor 4: selects the top leaf and edits its root column pin with centre 60', () => {
    const tree = properties();
    const columnSteps = find(tree, ColumnStepFields);
    const section = find(tree, PinSection);
    expect(section.props).toMatchObject({ nested: true, item: { id: 'B' }, piece: { id: 'B', x: 40, width: 40 } });
    expect(section.props.item).toBe(columnSteps.props.item);
    expect(pinSection().props.title).toBe('Column pin');
    expect(text(pinSection())).toContain('Pin column');
    checkbox(pinSection()).props.onChange({ target: { checked: true } });
    expect(dispatch).toHaveBeenLastCalledWith(setItemPin({ wallId: 'wall-1', runId: 'run-1', itemId: 'B', pin: pin(60) }));
    expect(current().run.grid.cols[1].pin).toEqual(pin(60));
    expect(findCell(current().run.grid, 'B-top').cell.node.pin).toBeUndefined();
    control(pinSection(), 'Pin distance').props.onCommit(50);
    expect(current().run.grid.cols[1].pin).toEqual(pin(50));
    expect(control(pinSection('B-bottom'), 'Actual cabinet center').type).toBe(ReadOnlyValue);
    expect(control(pinSection('B-bottom'), 'Actual cabinet center').props.value).toBe(50);
    expect(control(pinSection(), 'Resolved pin target').props.value).toBe(50);
    expect(find(pinSection(), InchInput).props.value).toBe(50);
    checkbox(pinSection('B-bottom')).props.onChange({ target: { checked: false } });
    expect(current().run.grid.cols[1].pin).toBeNull();
  });

  it('keeps root labels and shows the same second-pin note for root and nested leaves', () => {
    const root = pinSection('A');
    expect(root.props.title).toBe('Pin');
    expect(text(root)).toContain('Pin cabinet');
    expect(text(root)).not.toContain(note);
    expect(text(pinSection())).not.toContain(note);
    checkbox(root).props.onChange({ target: { checked: true } });
    expect(current().run.grid.cols[0].pin).toEqual(pin(20));
    expect(text(pinSection())).toContain(note);
    checkbox(pinSection()).props.onChange({ target: { checked: true } });
    expect(text(pinSection())).not.toContain(note);
    expect(text(pinSection('A'))).not.toContain(note);
    expect(runItems(current().run).slice(0, 2).map(({ width }) => width)).toEqual([40, 40]);
    checkbox(pinSection('A')).props.onChange({ target: { checked: false } });
    expect(text(pinSection('A'))).toContain(note);
  });
});
