import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { syncRoom, resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { CABINET_STYLE_IDS } from '../../model/styles.js';
import { resolveSelectedPiece } from '../../properties/helpers.js';
import elevationReducer, { setCellKind, setInsideEnd, setRunStyle, splitCell } from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
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
const leaf = (id = 'cabinet') => findLeaf(run().grid, id);
const base = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const ofType = (tree, type) => nodes(tree).find((node) => node.type === type);

function props(id = 'cabinet') {
  const wall = resolveWall(room(), room().walls[0]);
  const scene = runScene(room(), wall, run(), state.settings);
  return { room: room(), wall, run: run(), item: leaf(id), settings: state.settings,
    piece: scene.cells.pieces.find((piece) => piece.id === id), layout: scene.result, cells: scene.cells };
}
const section = (id) => InsideEndsSection(props(id));
const pick = (side, value, id) => field(section(id), `${side} inside end`).props.onChange({ target: { value } });
const panels = () => props().cells.pieces.filter((piece) => piece.inside);
const resync = () => { state.rooms[0] = syncRoom(room(), state.settings); };

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  state = stateWithRun(makeRun({ width: 90, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'left', kind: 'void', width: null },
      { id: 'cabinet', kind: 'cabinet', width: null },
      { id: 'right', kind: 'void', width: null }],
  }));
  resync();
});

describe('IE1 step e inside ends properties', () => {
  it('shows gray auto choices only on open sides and includes the section in cabinet size properties', () => {
    const tree = section();
    expect(tree.props.title).toBe('Inside ends');
    const selectors = nodes(tree).filter(({ type }) => type === 'select');
    expect(selectors.map(({ props }) => props['aria-label'])).toEqual(['Left inside end', 'Right inside end']);
    for (const selector of selectors) {
      expect(selector.props.value).toBe('');
      expect(selector.props.className).toContain('text-gray-500');
      expect(nodes(selector).filter(({ type }) => type === 'option').map(text)).toEqual(['End panel', 'None']);
    }
    const tabs = ofType(CabinetProperties(props()), PanelTabs);
    const included = ofType(tabs.props.children('size'), InsideEndsSection);
    expect(InsideEndsSection(included.props).props.title).toBe('Inside ends');
    expect(panels()).toHaveLength(2);
    expect(section('left')).toBeNull();
    dispatch(setCellKind({ ...base, cellId: 'left', kind: 'cabinet' }));
    expect(field(section(), 'Left inside end')).toBeUndefined();
    dispatch(setCellKind({ ...base, cellId: 'right', kind: 'cabinet' }));
    expect(section()).toBeNull();
  });

  it('removes panels and their gaps with None and restores auto without storing it', () => {
    const autoWidth = props().piece.width;
    pick('Left', 'none');
    expect(leaf().insideEnds).toEqual({ left: 'none' });
    expect(panels().map((piece) => piece.side)).toEqual(['right']);
    expect(props().piece.width).toBeGreaterThan(autoWidth);
    expect(field(section(), 'Left inside end').props.value).toBe('none');
    pick('Right', 'none');
    expect(panels()).toHaveLength(0);
    expect(section()).not.toBeNull();
    pick('Left', '');
    expect(leaf().insideEnds).toEqual({ right: 'none' });
    pick('Right', '');
    expect(leaf()).not.toHaveProperty('insideEnds');
    expect(panels()).toHaveLength(2);
    expect(props().piece.width).toBe(autoWidth);
  });

  it('offers frame returns only in face frame runs, with a blank gray 6-inch default and editable width', () => {
    dispatch(setRunStyle({ ...base, style: { cabinetStyleId: CABINET_STYLE_IDS.INSET } }));
    expect(nodes(field(section(), 'Left inside end')).filter(({ type }) => type === 'option').map(text))
      .toEqual(['End panel', 'Frame return', 'None']);
    pick('Left', 'return');
    expect(leaf().insideEnds.left).toEqual({ type: 'return' });
    expect(panels().map((piece) => piece.side)).toEqual(['right']);
    const returnField = () => field(section(), 'Left inside end return width');
    expect(returnField().type).toBe(OverrideInput);
    const inputProps = () => {
      const override = OverrideInput(returnField().props);
      return override.props.children('border-gray-600').props;
    };
    expect(inputProps().value).toBeNull();
    expect(inputProps().placeholder).toBe('6');
    const input = InchInput(inputProps());
    expect(input.props.value).toBe('');
    expect(input.props.className).toContain('placeholder:text-gray-500');
    useState.mockReturnValueOnce(['8 1/2', vi.fn()]);
    InchInput(inputProps()).props.onBlur();
    expect(leaf().insideEnds.left).toEqual({ type: 'return', width: 8.5 });
    expect(InchInput(inputProps()).props.value).toBe('8 1/2');
    useState.mockReturnValueOnce(['', vi.fn()]);
    InchInput(inputProps()).props.onBlur();
    expect(leaf().insideEnds.left).toEqual({ type: 'return' });
    expect(returnField().props.onChange(-1)).toBe(false);
    dispatch(setRunStyle({ ...base, style: { cabinetStyleId: CABINET_STYLE_IDS.EUROPEAN } }));
    expect(leaf().insideEnds.left).toEqual({ type: 'return' });
    expect(field(section(), 'Left inside end').props.value).toBe('');
    expect(returnField()).toBeUndefined();
    expect(panels()).toHaveLength(2);
  });

  it('edits nested cabinet leaves, retains closed-side choices, and rejects invalid reducer targets and values', () => {
    dispatch(splitCell({ ...base, cellId: 'cabinet', direction: 'down', count: 2 }));
    const cabinetId = props().cells.pieces.find((piece) => piece.kind === 'cabinet' && piece.id !== 'cabinet').id;
    const tabs = ofType(CellProperties(props(cabinetId)), PanelTabs);
    const included = ofType(tabs.props.children('size'), InsideEndsSection);
    const nested = InsideEndsSection(included.props);
    field(nested, 'Right inside end').props.onChange({ target: { value: 'none' } });
    expect(leaf(cabinetId).insideEnds).toEqual({ right: 'none' });
    expect(leaf()).not.toHaveProperty('insideEnds');
    expect(panels().some((piece) => piece.ownerId === cabinetId && piece.side === 'right')).toBe(false);
    dispatch(setCellKind({ ...base, cellId: 'right', kind: 'cabinet' }));
    expect(field(section(cabinetId), 'Right inside end')).toBeUndefined();
    expect(leaf(cabinetId).insideEnds.right).toBe('none');
    for (const payload of [
      { cellId: 'missing', side: 'left', value: 'none' },
      { cellId: 'left', side: 'left', value: 'none' },
      { cellId: cabinetId, side: 'top', value: 'none' },
      ...[undefined, 'panel', {}, { type: 'return', width: 0 }, { type: 'return', width: NaN }]
        .map((value) => ({ cellId: cabinetId, side: 'left', value })),
    ]) {
      const before = state;
      dispatch(setInsideEnd({ ...base, ...payload }));
      expect(state).toBe(before);
    }
  });

  it('edits a selected inside panel’s shared style, part number, note and only its owner side', () => {
    const panel = panels().find((piece) => piece.side === 'left');
    const selected = () => {
      const p = props();
      return PieceProperties({ ...p, selectionContext: resolveSelectedPiece(run(), p.cells, panel.id) });
    };
    const tree = selected();
    const number = ofType(tree, PartNumberField);
    expect(number.props.partKey).toBe(panel.id);
    field(PartNumberField(number.props), 'Part number').props.onChange({ target: { value: '42' } });
    expect(room().partNumberOverrides[panel.id]).toBe(42);
    const reports = ofType(tree, PartReportFields);
    const note = nodes(PartReportFields(reports.props)).find((node) => node.type === ReportTextField && node.props.label === 'Note');
    note.props.onCommit('Inside panel note');
    expect(room().reportParts[panel.id].note).toBe('Inside panel note');
    const insidePanel = nodes(selected()).find((node) => node.type?.name === 'InsidePanelProperties');
    const panelTree = insidePanel.type(insidePanel.props);
    field(panelTree, 'Inside end panel style').props.onChange({ target: { value: 'sheet' } });
    expect(run().ends.left.styleId).toBe('sheet');
    expect(panels().find((piece) => piece.id === panel.id).styleId).toBe('sheet');
    const ownerSection = ofType(panelTree, InsideEndsSection);
    const ownerTree = InsideEndsSection(ownerSection.props);
    expect(field(ownerTree, 'Right inside end')).toBeUndefined();
    field(ownerTree, 'Left inside end').props.onChange({ target: { value: 'none' } });
    expect(leaf().insideEnds.left).toBe('none');
    expect(panels().map((piece) => piece.side)).toEqual(['right']);
  });
});
