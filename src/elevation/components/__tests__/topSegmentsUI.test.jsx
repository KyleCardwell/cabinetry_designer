import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { runItems } from '../../model/grid.js';
import { runScene } from '../../model/runScene.js';
import { toElevationDocument } from '../../store/persistence.js';
import elevationReducer, { splitCell } from '../../store/elevationSlice.js';
import { fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import AddTopSegmentButton from '../properties/AddTopSegmentButton.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import RunProperties from '../properties/RunProperties.jsx';
import RunTopSegmentsSection from '../properties/RunTopSegmentsSection.jsx';
import TopSegmentRow from '../properties/TopSegmentRow.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (fn) => fn(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const props = () => ({ room: room(), wall: wall(), run: run(), settings: state.settings });
const scene = () => runScene(room(), wall(), run(), state.settings);
const piece = (id = 'B') => scene().cells.pieces.find((candidate) => candidate.id === id);
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const ofType = (tree, type) => nodes(tree).find((node) => node.type === type);
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option');
const warnings = (tree) => nodes(tree).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
const expandRows = (tree) => {
  if (Array.isArray(tree)) return tree.map(expandRows);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.type === TopSegmentRow) return expandRows(TopSegmentRow(tree.props));
  return { ...tree, props: { ...tree.props, children: expandRows(tree.props.children) } };
};
const render = (extra = {}) => expandRows(RunTopSegmentsSection({ ...props(), ...extra }));
const addButton = (extra = {}) => AddTopSegmentButton({ ...props(), piece: piece(), ...extra });
const add = () => addButton().props.onClick();
const change = (label, value) => field(render(), label).props.onChange({ target: { value } });
const typeDrop = (value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  InchInput(field(render(), 'Segment 1 Drop').props).props.onBlur();
};

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ width: 90, z: 4, height: 30.5, top: 'stone',
    style: { cabinetStyleId: 13 }, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: ['A', 'B', 'C'].map((id) => fixed(id, 30)),
  }));
  state.settings.runFlex = 0;
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
});

describe('ST4 step d top segment properties', () => {
  it('wires run and cabinet sections, adds the default on the anchor run and limits the add button', () => {
    expect(scene().cells.pieces.map(({ id, x, z, width, height }) => [id, x, z, width, height]))
      .toEqual([['A', 0, 4, 30, 30.5], ['B', 30, 4, 30, 30.5], ['C', 60, 4, 30, 30.5]]);
    expect(text(render())).toContain('Select a root cabinet column');
    const runPanel = RunProperties({ ...props(), layout: scene().result, showMessage: vi.fn() });
    expect(ofType(runPanel.props.children('heights'), RunTopSegmentsSection).props).toMatchObject(props());
    const cabinet = CabinetProperties({ ...props(), piece: piece(), item: runItems(run())[1],
      layout: scene().result, cells: scene().cells, numbers: { byKey: new Map() } });
    const included = ofType(ofType(cabinet, PanelTabs).props.children('size'), RunTopSegmentsSection);
    expect(included.props.numbers).toEqual({ byKey: new Map() });
    const button = ofType(RunTopSegmentsSection(included.props), AddTopSegmentButton);
    expect(text(AddTopSegmentButton(button.props))).toBe('Add top segment');
    AddTopSegmentButton(button.props).props.onClick();
    expect(run().topSegments).toEqual([{ id: expect.any(String), from: 'B', to: 'B', kind: 'wood', drop: 1, mode: 'box' }]);
    expect(piece().height).toBe(29.5);
    expect(addButton()).toBeNull();
    expect(field(render({ piece: piece() }), 'Segment 1 Drop')).toBeDefined();
    expect(addButton({ piece: piece('A') })).not.toBeNull();
    for (const top of ['none', 'crown', 'topMold']) {
      expect(addButton({ run: { ...run(), top }, piece: piece('A') })).toBeNull();
    }
    expect(addButton({ run: { ...run(), top: 'wood' }, piece: piece('A') })).not.toBeNull();
    expect(addButton({ run: { ...run(), top: undefined }, piece: piece('A') })).not.toBeNull();
    expect(addButton({ run: { ...run(), top: undefined, stack: { above: { runId: 'upper' } } }, piece: piece('A') })).toBeNull();
    expect(addButton({ piece: { ...piece('A'), kind: 'filler' } })).toBeNull();
  });

  it('edits endpoints, kind and inch drops, rejects invalid drops and preserves box mode', () => {
    add();
    change('Segment 1 From', 'C');
    change('Segment 1 To', 'A');
    expect(run().topSegments[0]).toMatchObject({ from: 'C', to: 'A' });
    expect(addButton()).toBeNull();
    expect(field(render({ piece: piece() }), 'Segment 1 From').props.value).toBe('C');
    expect(options(field(render(), 'Segment 1 Kind')).map(text)).toEqual(['Wood', 'Stone']);
    change('Segment 1 Kind', 'stone');
    typeDrop('2 1/2');
    expect(run().topSegments[0]).toMatchObject({ kind: 'stone', drop: 2.5, mode: 'box' });
    expect(piece().height).toBe(28);
    const before = structuredClone(run().topSegments);
    for (const value of [0, -1, null, NaN, Infinity]) {
      expect(field(render(), 'Segment 1 Drop').props.onCommit(value)).toBe(false);
    }
    for (const value of ['', '0', '-1', 'garbage']) typeDrop(value);
    expect(run().topSegments).toEqual(before);
    expect(nodes(render()).filter(({ type }) => type === 'select').map(({ props }) => props['aria-label']))
      .toEqual(['Segment 1 From', 'Segment 1 To', 'Segment 1 Kind', 'Segment 1 Mode']);
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].topSegments).toEqual(before);
    field(render(), 'Remove top segment 1').props.onClick();
    expect(run().topSegments).toEqual([]);
    expect(addButton()).not.toBeNull();
  });

  it('numbers root column options like cutouts, including split columns while excluding nested leaves', () => {
    add();
    room().partNumberOverrides = { A: 7, B: 8, C: 9 };
    for (const label of ['From', 'To']) {
      expect(options(field(render(), `Segment 1 ${label}`)).map(text)).toEqual(['#7 — 30"', '#8 — 30"', '#9 — 30"']);
    }
    expect(options(field(render({ numbers: { byKey: new Map() } }), 'Segment 1 From')).map(text))
      .toEqual(['1 — 30"', '2 — 30"', '3 — 30"']);
    dispatch(splitCell({ wallId: wall().id, runId: run().id, cellId: 'B', direction: 'down', count: 2 }));
    const columnId = runItems(run())[1].id;
    expect(columnId).not.toBe('B');
    expect(options(field(render(), 'Segment 1 From'))[0].props).toMatchObject({ value: 'B', disabled: true });
    change('Segment 1 From', columnId);
    change('Segment 1 To', columnId);
    expect(options(field(render(), 'Segment 1 From')).map(({ props }) => props.value)).toEqual(['A', columnId, 'C']);
    const nested = scene().cells.pieces.find((candidate) => candidate.columnId === columnId);
    expect(nested).toBeDefined();
    expect(addButton({ piece: nested })).toBeNull();
    expect(render({ piece: nested })).toBeNull();
    expect(render({ piece: { ...piece('A'), kind: 'panel' } })).toBeNull();
  });

  it('keeps ignored rows editable and shows each segment’s missing, overlap or no-countertop warning', () => {
    add();
    const segment = run().topSegments[0];
    run().topSegments = [segment, { ...segment, id: 'orphan', to: 'gone' }, { ...segment, id: 'overlap' }];
    expect(warnings(field(render(), 'Top segment 1'))).toEqual([]);
    expect(warnings(field(render(), 'Top segment 2'))).toEqual(['A selected cabinet is missing.']);
    expect(warnings(field(render(), 'Top segment 3'))).toEqual(['Overlaps another top segment.']);
    const missing = options(field(render(), 'Segment 2 To'))[0];
    expect(missing.props).toMatchObject({ value: 'gone', disabled: true });
    expect(text(missing)).toBe('Missing cabinet');
    change('Segment 2 To', 'A');
    change('Segment 2 From', 'A');
    expect(warnings(field(render(), 'Top segment 2'))).toEqual([]);
    expect(addButton({ piece: piece('A') })).toBeNull();
    run().top = 'none';
    for (const index of [1, 2, 3]) {
      expect(warnings(field(render(), `Top segment ${index}`))).toEqual(['This run has no countertop.']);
    }
    field(render(), 'Remove top segment 2').props.onClick();
    expect(run().topSegments.map(({ id }) => id)).toEqual([segment.id, 'overlap']);
    field(render(), 'Remove top segment 2').props.onClick();
    field(render(), 'Remove top segment 1').props.onClick();
    expect(render()).toBeNull();
  });
});
