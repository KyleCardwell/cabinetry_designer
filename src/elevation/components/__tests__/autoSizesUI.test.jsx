import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { boxInsets, findCell, formatInchesInput, runItems } from '../../model/index.js';
import { syncRoom } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { splitCell } from '../../store/elevationSlice.js';
import { auto, opening, pin, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import OpeningProperties from '../properties/OpeningProperties.jsx';
import RunGeometrySection from '../properties/RunGeometrySection.jsx';
import SoffitProperties from '../properties/SoffitProperties.jsx';
import Field, { ReadOnlyValue } from '../properties/Field.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const shared = [OverrideInput, OverrideField, Field, ReadOnlyValue];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? shared.includes(tree.type) ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const input = (tree, label) => InchInput(field(tree, label).props);
const type = (tree, label, value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  input(tree, label).props.onBlur();
};
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const at = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const props = (id = 'a') => {
  const scene = runScene(room(), wall(), run(), state.settings);
  const piece = scene.cells.pieces.find((candidate) => candidate.id === id);
  const item = runItems(run()).find((candidate) => candidate.id === id) ?? findCell(run().grid, id).cell.node;
  const insets = boxInsets(scene.frames, scene.cells, state.settings);
  return { room: room(), wall: wall(), run: run(), settings: state.settings, piece, item,
    layout: scene.result, cells: scene.cells, insets, inset: insets.get(id) };
};
const sizeTab = (tree) => nodes(tree).find(({ type }) => type === PanelTabs).props.children('size');
const cabinet = () => sizeTab(CabinetProperties(props()));
const cell = () => sizeTab(CellProperties(props()));
const noLocks = (tree) => expect(nodes(tree).filter(({ type }) => type === 'button').map(text).join(' ')).not.toMatch(/Lock|Unlock/);
const autoField = (tree, label, placeholder) => {
  expect(input(tree, label).props).toMatchObject({ value: '', placeholder });
  expect(input(tree, label).props.className).toContain('border-gray-600');
  const wrapper = nodes(tree).find(({ props }) => props.title === `auto: ${placeholder}\"`);
  expect(wrapper).toBeDefined();
  expect(nodes(wrapper).some(({ type, props }) => type === 'span' && props.children === 'auto')).toBe(true);
  expect(nodes(wrapper).some(({ type }) => type === 'button')).toBe(false);
  noLocks(tree);
};

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ width: 60, autoCount: false, seamGap: 0,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, items: [auto('a'), auto('b')] }));
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
});

describe('UI2 step b auto sizes', () => {
  it('shows an auto Euro base cabinet as blank with placeholder 30, auto tag and no Reset or Lock (anchor 1)', () => {
    expect(props().piece.width).toBe(30);
    expect(props().item.width).toBeNull();
    autoField(cabinet(), 'Cabinet box width', '30');
    expect(field(cabinet(), 'Reset Box width')).toBeUndefined();
  });

  it('types 27 plus trim, re-splits the run and resets to the recomputed auto width (anchors 2 and 3)', () => {
    for (const cabinetStyleId of [13, 14]) {
      state = stateWithRun(makeRun({ width: 60, autoCount: false, seamGap: 0,
        ends: { left: { type: 'none' }, right: { type: 'none' } }, items: [auto('a'), { ...auto('b'), style: { cabinetStyleId: 13 } }], style: { cabinetStyleId } }));
      state.rooms[0] = structuredClone(syncRoom(room(), state.settings));
      const before = props('b').piece.width;
      const { inset } = props();
      const trim = (inset?.left ?? 0) + (inset?.right ?? 0);
      expect(cabinetStyleId === 14 ? trim > 0 : trim === 0).toBe(true);
      type(cabinet(), 'Cabinet box width', '27');
      expect(runItems(run())[0].width).toBe(27 + trim);
      expect(props('b').piece.width).toBeGreaterThan(before);
      if (cabinetStyleId === 13) expect(props('b').piece.width).toBe(33);
      expect(input(cabinet(), 'Cabinet box width').props.value).toBe('27');
      expect(input(cabinet(), 'Cabinet box width').props.className).toContain('border-teal-500');
      if (trim) expect(text(cabinet())).toContain('Frame section:');
      run().width = 66;
      field(cabinet(), 'Reset Box width').props.onClick();
      expect(runItems(run())[0].width).toBeNull();
      expect(props().piece.width).toBeGreaterThan(27);
      if (cabinetStyleId === 13) expect(props().piece.width).toBe(33);
      autoField(cabinet(), 'Cabinet box width', formatInchesInput(props().piece.width - trim));
      type(cabinet(), 'Cabinet box width', '27');
      type(cabinet(), 'Cabinet box width', '');
      expect(runItems(run())[0].width).toBeNull();
    }
  });

  it('tags derived pin, opening, anchored soffit and run geometry readouts auto', () => {
    const assertTag = (tree, label) => {
      const readout = field(tree, label);
      expect(readout.props.className).toContain('border-dashed border-gray-700');
      const wrapper = nodes(tree).find(({ type, props }) => type === 'label'
        && nodes(props.children).some(({ props }) => props['aria-label'] === label));
      expect(nodes(wrapper ?? readout).some(({ type, props }) => type === 'span' && props.children === 'auto')).toBe(true);
    };
    run().grid.cells[0].node.pin = pin(15);
    assertTag(cabinet(), 'Resolved pin target');
    assertTag(cabinet(), 'Actual cabinet center');
    assertTag(OpeningProperties({ wall: wall(), opening: opening(), settings: state.settings }), 'Opening head height');
    const soffit = { id: 'soffit', x: 0, width: 60, bottom: 84, molding: 'none' };
    for (const anchors of [{ left: false, right: false }, { left: { to: 'end', offset: 0 }, right: false },
      { left: { to: 'end', offset: 0 }, right: { to: 'end', offset: 0 } }]) {
      const tree = SoffitProperties({ room: room(), wall: wall(), settings: state.settings, soffit: { ...soffit, anchors } });
      if (anchors.left) assertTag(tree, 'Soffit left');
      else expect(field(tree, 'Soffit left').type).toBe(InchInput);
      if (anchors.right) assertTag(tree, 'Soffit width');
      else expect(field(tree, 'Soffit width').type).toBe(InchInput);
    }
    run().anchors = { left: true, right: true };
    const tree = RunGeometrySection({ wall: wall(), run: run(), settings: state.settings,
      actionBase: at, validateAndDispatch: vi.fn() });
    for (const label of ['Resolved run width', 'Installed front depth', 'Run left edge position',
      'Run left center position', 'Run right edge position', 'Run right center position']) assertTag(tree, label);
  });

  for (const axis of ['row', 'col']) {
    it(`types and resets ${axis} section sizes and column widths with trim, keeping the other axis tagged auto`, () => {
      run().style = { cabinetStyleId: 14 };
      run().grid.cells[1].node.style = { cabinetStyleId: 13 };
      dispatch(splitCell({ ...at, cellId: 'a', direction: 'down', count: 2 }));
      if (axis === 'col') dispatch(splitCell({ ...at, cellId: 'a', direction: 'across', count: 2 }));
      const context = () => findCell(run().grid, 'a');
      expect(context().axis).toBe(axis);
      const label = `Cell ${axis === 'row' ? 'height' : 'width'}`;
      const reset = `Reset ${axis === 'row' ? 'Height' : 'Box width'}`;
      const size = () => axis === 'row' ? props().piece.height
        : props().piece.width - (props().inset?.left ?? 0) - (props().inset?.right ?? 0);
      autoField(cell(), label, formatInchesInput(size()));
      if (axis === 'col') {
        const other = nodes(cell()).find(({ type, props }) => type === 'label'
          && nodes(props.children).some(({ props }) => props['aria-label'] === 'Cell height'));
        expect(nodes(other).some(({ type, props }) => type === 'span' && props.children === 'auto')).toBe(true);
        expect(field(cell(), 'Cell height').props.className).toContain('border-dashed border-gray-700');
      } else {
        // UI10: a stacked cell is as wide as its column, so its width field edits the column.
        expect(field(cell(), 'Cell width')).toBeUndefined();
      }
      const trim = (props().inset?.left ?? 0) + (props().inset?.right ?? 0);
      type(cell(), label, '10');
      expect(context().track.size).toBe(axis === 'row' ? 10 : 10 + trim);
      expect(input(cell(), label).props.value).toBe('10');
      expect(input(cell(), label).props.className).toContain('border-teal-500');
      field(cell(), reset).props.onClick();
      expect(context().track.size).toBeNull();
      autoField(cell(), label, formatInchesInput(size()));
      type(cell(), label, '10');
      type(cell(), label, '');
      expect(context().track.size).toBeNull();

      const columnId = props().piece.columnId;
      const columnInset = props().insets.get(columnId);
      const columnTrim = (columnInset?.left ?? 0) + (columnInset?.right ?? 0);
      expect(columnTrim).toBeGreaterThan(0);
      autoField(cell(), 'Column box width', formatInchesInput(props().layout.pieces.find(({ id }) => id === columnId).width - columnTrim));
      type(cell(), 'Column box width', '27');
      expect(runItems(run()).find(({ id }) => id === columnId).width).toBe(27 + columnTrim);
      expect(input(cell(), 'Column box width').props.value).toBe('27');
      // Reset the column width independently of the section width.
      const column = nodes(cell()).find(({ props }) => props.title?.endsWith('override · auto: 27\"'));
      field(column, `Reset ${axis === 'row' ? 'Box width' : 'Column box width'}`).props.onClick();
      expect(runItems(run()).find(({ id }) => id === columnId).width).toBeNull();
      noLocks(cell());
    });
  }
});
