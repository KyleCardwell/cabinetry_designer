import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { syncRoom, resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { CABINET_STYLE_IDS } from '../../model/styles.js';
import { resolveSelectedPiece } from '../../properties/helpers.js';
import elevationReducer, { setCellKind, setColumnStep, setRunStyle, setStepEnd, splitCell } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import StepEndsSection from '../properties/StepEndsSection.jsx';
import InsideEndsSection from '../properties/InsideEndsSection.jsx';
import PieceProperties from '../properties/PieceProperties.jsx';
import PartNumberField from '../properties/PartNumberField.jsx';
import PartReportFields, { ReportTextField } from '../properties/PartReportFields.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import OverrideInput from '../OverrideInput.jsx';
import InchInput from '../InchInput.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (fn) => fn(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const room = () => state.rooms[0];
const run = () => room().walls[0].runs[0];
const leaf = (id = 'A') => findLeaf(run().grid, id);
const base = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const ofType = (tree, type) => nodes(tree).find((node) => node.type === type);

function props(id = 'A') {
  const wall = resolveWall(room(), room().walls[0]);
  const scene = runScene(room(), wall, run(), state.settings);
  return { room: room(), wall, run: run(), item: leaf(id), settings: state.settings,
    piece: scene.cells.pieces.find((piece) => piece.id === id), layout: scene.result, cells: scene.cells };
}
const section = (id) => StepEndsSection(props(id));
const pick = (side, value, id) => field(section(id), `${side} step end`).props.onChange({ target: { value } });
const panels = () => props().cells.pieces.filter((piece) => piece.step);
const step = (itemId, edge, value) => dispatch(setColumnStep({ ...base, itemId, edge, value }));
const inputProps = (id = 'A', side = 'Right') => {
  const override = field(section(id), `${side} step end return width`);
  return OverrideInput(override.props).props.children('border-gray-600').props;
};
const typeWidth = (value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  InchInput(inputProps()).props.onBlur();
};

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  state = stateWithRun(makeRun({ width: 90, autoCount: false, seamGap: 0,
    style: { cabinetStyleId: CABINET_STYLE_IDS.INSET },
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [auto('A'), { ...auto('B'), top: { value: 2, source: 'manual' } }, auto('C')],
  }));
  state.settings.runFlex = 0;
  state.rooms[0] = syncRoom(room(), state.settings);
});

describe('ST3 step d step ends properties', () => {
  it('shows default gray Return and blank 6-inch width only on framed step sides, including cabinet size properties', () => {
    expect(section().props.title).toBe('Step ends');
    const selector = field(section(), 'Right step end');
    expect(selector.props.value).toBe('');
    expect(selector.props.className).toContain('text-gray-500');
    expect(nodes(selector).filter(({ type }) => type === 'option').map(text)).toEqual(['Return', 'Panel', 'None']);
    expect(field(section(), 'Left step end')).toBeUndefined();
    expect(field(section('C'), 'Left step end')).toBeDefined();
    expect(section('B')).toBeNull();
    expect(InchInput(inputProps()).props).toMatchObject({ value: '', placeholder: '6' });
    expect(InchInput(inputProps()).props.className).toContain('placeholder:text-gray-500');
    const tabs = ofType(CabinetProperties(props()), PanelTabs);
    expect(StepEndsSection(ofType(tabs.props.children('size'), StepEndsSection).props).props.title).toBe('Step ends');
    expect(props().cells.pieces.filter((piece) => piece.kind === 'cabinet').map(({ id, x, width }) => ({ id, x, width })))
      .toEqual([{ id: 'A', x: 0.75, width: 29.5 }, { id: 'B', x: 30.25, width: 29.5 }, { id: 'C', x: 59.75, width: 29.5 }]);
    expect(run()._stepEnds).toEqual([
      { leafId: 'A', side: 'right', edge: 'top', z: 32.5, height: 2, choice: 'return', width: 6 },
      { leafId: 'C', side: 'left', edge: 'top', z: 32.5, height: 2, choice: 'return', width: 6 },
    ]);
    dispatch(setRunStyle({ ...base, style: { cabinetStyleId: CABINET_STYLE_IDS.EUROPEAN } }));
    expect(section()).toBeNull();
  });

  it('commits inch widths, Panel and None, clears to Return and rejects invalid widths without moving boxes', () => {
    const boxes = props().cells.pieces.filter((piece) => piece.kind === 'cabinet');
    typeWidth('8 1/2');
    expect(leaf().stepEnds).toEqual({ right: { type: 'return', width: 8.5 } });
    expect(run()._stepEnds[0].width).toBe(8.5);
    expect(InchInput(inputProps()).props.value).toBe('8 1/2');
    expect(field(section(), 'Right step end').props.className).toContain('text-gray-100');
    const before = state;
    for (const value of ['-1', '0', 'garbage']) typeWidth(value);
    for (const value of [0, -1, NaN, Infinity]) {
      expect(field(section(), 'Right step end return width').props.onChange(value)).toBe(false);
    }
    expect(state).toBe(before);
    typeWidth('');
    expect(leaf()).not.toHaveProperty('stepEnds');
    expect(InchInput(inputProps()).props.value).toBe('');
    pick('Right', 'panel');
    expect(leaf().stepEnds.right).toEqual({ type: 'panel' });
    expect(panels()).toMatchObject([{ id: 'A:step-right-top', x: 30.25, z: 32.5, height: 2 }]);
    expect(field(section(), 'Right step end return width')).toBeUndefined();
    expect(props().cells.pieces.filter((piece) => piece.kind === 'cabinet')).toEqual(boxes);
    pick('Right', 'none');
    expect(leaf().stepEnds.right).toBe('none');
    expect(panels()).toHaveLength(0);
    expect(run()._stepEnds.some((entry) => entry.leafId === 'A')).toBe(false);
    expect(field(section(), 'Right step end').props.value).toBe('none');
    pick('Right', '');
    expect(leaf()).not.toHaveProperty('stepEnds');
    expect(run()._stepEnds[0].choice).toBe('return');
  });

  it('edits nested leaves, shares one row across top and bottom, retains inactive choices and validates reducer targets', () => {
    step('B', 'bottom', 2);
    expect(nodes(section()).filter(({ type }) => type === 'select')).toHaveLength(1);
    pick('Right', 'panel');
    expect(panels().map((piece) => piece.id).sort()).toEqual(['A:step-right-bottom', 'A:step-right-top']);
    dispatch(splitCell({ ...base, cellId: 'A', direction: 'down', count: 2 }));
    const nestedId = props().cells.pieces.find((piece) => piece.columnId && piece.z > 4).id;
    const tabs = ofType(CellProperties(props(nestedId)), PanelTabs);
    const included = ofType(tabs.props.children('size'), StepEndsSection);
    field(StepEndsSection(included.props), 'Right step end').props.onChange({ target: { value: 'none' } });
    expect(leaf(nestedId).stepEnds.right).toBe('none');
    step('B', 'top', null);
    expect(section(nestedId)).toBeNull();
    expect(leaf(nestedId).stepEnds.right).toBe('none');
    step('B', 'top', 2);
    expect(field(section(nestedId), 'Right step end').props.value).toBe('none');
    dispatch(setCellKind({ ...base, cellId: 'C', kind: 'void' }));
    expect(section('C')).toBeNull();
    for (const payload of [
      { cellId: 'missing', side: 'right', value: 'none' },
      { cellId: 'C', side: 'left', value: 'none' },
      { cellId: nestedId, side: 'top', value: 'none' },
      { runId: 'missing', cellId: nestedId, side: 'right', value: 'none' },
      ...[undefined, 'panel', {}, { type: 'other' }, { type: 'return', width: 0 },
        { type: 'return', width: NaN }, { type: 'return', width: Infinity }]
        .map((value) => ({ cellId: nestedId, side: 'right', value })),
    ]) {
      const before = state;
      dispatch(setStepEnd({ ...base, ...payload }));
      expect(state).toBe(before);
    }
    dispatch(setStepEnd({ ...base, cellId: nestedId, side: 'right', value: { type: 'return' } }));
    expect(leaf(nestedId).stepEnds.right).toEqual({ type: 'return' });
    expect(InchInput(inputProps(nestedId)).props).toMatchObject({ value: '', placeholder: '6' });
    dispatch(setStepEnd({ ...base, cellId: nestedId, side: 'right', value: null }));
    expect(leaf(nestedId)).not.toHaveProperty('stepEnds');
  });

  it('edits a selected step panel’s shared style, part number, note and only its owner side', () => {
    step('B', 'top', null);
    step('A', 'top', 2);
    step('C', 'top', 2);
    pick('Left', 'panel', 'B');
    pick('Right', 'panel', 'B');
    const panel = panels().find((piece) => piece.side === 'right');
    const selected = () => {
      const p = props();
      return PieceProperties({ ...p, selectionContext: resolveSelectedPiece(run(), p.cells, panel.id) });
    };
    const number = ofType(selected(), PartNumberField);
    expect(number.props.partKey).toBe(panel.id);
    field(PartNumberField(number.props), 'Part number').props.onChange({ target: { value: '42' } });
    expect(room().partNumberOverrides[panel.id]).toBe(42);
    const reports = ofType(selected(), PartReportFields);
    const note = nodes(PartReportFields(reports.props)).find((node) => node.type === ReportTextField && node.props.label === 'Note');
    note.props.onCommit('Step panel note');
    expect(room().reportParts[panel.id].note).toBe('Step panel note');
    const panelProperties = nodes(selected()).find((node) => node.type?.name === 'InsidePanelProperties');
    const tree = panelProperties.type(panelProperties.props);
    field(tree, 'Inside end panel style').props.onChange({ target: { value: 'sheet' } });
    expect(run().ends.right.styleId).toBe('sheet');
    expect(panels().find((piece) => piece.id === panel.id).styleId).toBe('sheet');
    expect(ofType(tree, InsideEndsSection)).toBeUndefined();
    const ownerSection = ofType(tree, StepEndsSection);
    const ownerTree = StepEndsSection(ownerSection.props);
    expect(field(ownerTree, 'Left step end')).toBeUndefined();
    field(ownerTree, 'Right step end').props.onChange({ target: { value: 'none' } });
    expect(leaf('B').stepEnds).toEqual({ left: { type: 'panel' }, right: 'none' });
    expect(panels().map((piece) => piece.side)).toEqual(['left']);
  });
});
