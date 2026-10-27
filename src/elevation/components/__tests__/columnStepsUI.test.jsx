import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDispatch } from 'react-redux';
import { findCell, runItems } from '../../model/index.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setColumnStep, splitCell } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import ColumnStepFields from '../properties/ColumnStepFields.jsx';
import PinSection from '../properties/PinSection.jsx';
import Field from '../properties/Field.jsx';
import WarningsList from '../properties/WarningsList.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const at = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [ColumnStepFields, PinSection, Field].includes(tree.type) ? nodes(tree.type(tree.props))
      : [tree, ...nodes(tree.props?.children)] : [];
const props = (id = 'a') => {
  const scene = runScene(room(), wall(), run(), state.settings);
  return { room: room(), wall: wall(), run: run(), settings: state.settings,
    piece: scene.cells.pieces.find((piece) => piece.id === id),
    item: runItems(run()).find((item) => item.id === id) ?? findCell(run().grid, id).cell.node,
    layout: scene.result, cells: scene.cells };
};
const size = (Component, id) => nodes(Component(props(id))).find(({ type }) => type === PanelTabs).props.children('size');
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const input = (tree, label) => InchInput(field(tree, label).props);
const type = (tree, label, value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  input(tree, label).props.onBlur();
};

beforeEach(() => {
  vi.clearAllMocks();
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  state = stateWithRun(makeRun({ width: 60, autoCount: false, seamGap: 0,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, items: [auto('a'), auto('b')] }));
});

describe('ST1 step c column step fields', () => {
  it('shows blank zero placeholders after pin controls and commits inches, clears and invalid edits', () => {
    const cabinet = () => size(CabinetProperties);
    for (const label of ['Top drop', 'Bottom up']) {
      expect(input(cabinet(), label).props).toMatchObject({ value: '', placeholder: '0' });
      expect(input(cabinet(), label).props.className).toContain('placeholder:text-gray-500');
    }
    const sections = nodes(cabinet()).filter(({ props }) => props.id?.startsWith('piece.')).map(({ props }) => props.id);
    expect(sections.indexOf('piece.steps')).toBe(sections.indexOf('piece.pin') + 1);
    type(cabinet(), 'Top drop', '3 1/2');
    type(cabinet(), 'Bottom up', '2');
    expect(dispatch).toHaveBeenLastCalledWith(setColumnStep({ ...at, itemId: 'a', edge: 'bottom', value: 2 }));
    expect(props().piece).toMatchObject({ z: run().z + 2, height: run().height - 5.5, width: 30 });
    expect(input(cabinet(), 'Top drop').props.value).toBe('3 1/2');
    const before = structuredClone(state);
    type(cabinet(), 'Top drop', '-1');
    type(cabinet(), 'Bottom up', 'garbage');
    expect(state).toEqual(before);
    type(cabinet(), 'Top drop', '');
    type(cabinet(), 'Bottom up', '0');
    expect(runItems(run())[0]).not.toHaveProperty('top');
    expect(runItems(run())[0]).not.toHaveProperty('bottom');
    expect(input(cabinet(), 'Bottom up').props.value).toBe('');
  });

  it('edits the same root column from nested leaves at multiple depths', () => {
    dispatch(splitCell({ ...at, cellId: 'a', direction: 'down', count: 2 }));
    const rootId = props().piece.columnId;
    const siblingId = run().grid.cells[0].node.cells[1].node.id;
    dispatch(splitCell({ ...at, cellId: 'a', direction: 'across', count: 2 }));
    type(size(CellProperties), 'Column top drop', '4');
    expect(dispatch).toHaveBeenLastCalledWith(setColumnStep({ ...at, itemId: rootId, edge: 'top', value: 4 }));
    type(size(CellProperties, siblingId), 'Column bottom up', '2');
    expect(run().grid.cols[0]).toMatchObject({ top: { value: 4, source: 'manual' }, bottom: { value: 2, source: 'manual' } });
    expect(input(size(CellProperties), 'Column bottom up').props.value).toBe('2');
    expect(input(size(CellProperties, siblingId), 'Column top drop').props.value).toBe('4');
    expect(findCell(run().grid, 'a').cell.node).not.toHaveProperty('top');
    expect(run().grid.cols[1]).not.toHaveProperty('top');
    type(size(CellProperties, siblingId), 'Column top drop', '');
    expect(input(size(CellProperties), 'Column top drop').props.value).toBe('');
  });

  it('shows oversized steps through the existing warnings list and omits fields for other root kinds', () => {
    type(size(CabinetProperties), 'Top drop', '30');
    const layout = props().layout;
    expect(layout.warnings).toContainEqual({ code: 'column-step-too-big', pieceId: 'a',
      message: 'Top drop and bottom up leave less than 1 inch of box.' });
    expect(props().piece.height).toBe(run().height);
    expect(renderToStaticMarkup(<WarningsList layout={layout} />)).toContain('Top drop and bottom up leave less than 1 inch of box.');
    for (const kind of ['filler', 'void', 'shelves', 'panel']) {
      expect(ColumnStepFields({ wall: wall(), run: run(), item: { id: 'other', kind } })).toBeNull();
    }
  });
});
