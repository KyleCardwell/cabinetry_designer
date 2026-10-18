import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cabinetInterior } from '../../model/interiors.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setItemInterior } from '../../store/elevationSlice.js';
import { fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import FaceProperties from './FaceProperties.jsx';
import InteriorFields from './InteriorFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (fn) => fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../model/interiors.js', async (original) => {
  const actual = await original();
  return { ...actual, cabinetInterior: vi.fn(actual.cabinetInterior) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, text(props.children)]);
const group = (direction, dividers, children = Array.from({ length: dividers.length + 1 }, () => ({}))) => (
  { direction, children, dividers }
);
const fixedShelf = { kind: 'fixed' };
const partition = { kind: 'partition' };
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', itemIds: ['c1'] };
let state;
let hookIndex;
let hookState;
let effects;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid)[0];
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
function render(overrides = {}) {
  hookIndex = 0;
  effects = [];
  const tree = InteriorFields({ room: room(), wall: wall(), run: run(), item: item(),
    settings: state.settings, ...overrides });
  effects.forEach((effect) => effect());
  return tree;
}
const field = (label) => nodes(render()).find(({ props }) => props['aria-label'] === label);
const button = (label) => nodes(render()).find((node) => node.type === 'button' && text(node) === label);
const click = (label) => button(label).props.onClick();
const change = (label, value) => field(label).props.onChange({ target: { value } });
const commit = (label, value) => field(label).props.onCommit(value);
const select = (path) => field(`Interior ${path}`).props.onClick();
const edit = (fn) => { state = structuredClone(state); fn(); };
const expectInterior = (interior) => {
  expect(dispatch).toHaveBeenLastCalledWith(setItemInterior({ ...at, interior }));
  if (interior === null) expect(item()).not.toHaveProperty('interior');
  else expect(item().interior).toEqual(interior);
};

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({
    width: 30, autoCount: false, items: [fixed('c1', 30)],
    ends: { left: { type: 'none' }, right: { type: 'none' } },
  }));
  state.settings.runFlex = 0;
  state.facePath = null;
  hookIndex = 0;
  hookState = [];
  effects = [];
  useState.mockImplementation((initial) => {
    const index = hookIndex++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (value) => { hookState[index] = value; }];
  });
  useEffect.mockImplementation((effect) => effects.push(effect));
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN2 Interior section', () => {
  it('anchor 1: shows the one clear 28 1/2 × 29 section, immediately after Box in the panel', () => {
    const rows = nodes(render()).filter(({ props }) => props['aria-pressed'] !== undefined);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe('Section 28 1/2" × 29"');
    expect(rows[0].props['aria-pressed']).toBe(true);
    expect(field('Interior sections').props).toMatchObject({ min: 2, max: 8, value: 2 });

    const view = resolveWall(room(), wall());
    const scene = runScene(room(), view, run(), state.settings);
    const tree = FaceProperties({ wall: view, run: run(), item: item(), settings: state.settings,
      piece: scene.cells.pieces.find(({ id }) => id === 'c1'), layout: scene.result, cells: scene.cells });
    const children = tree.props.children;
    const index = children.findIndex(({ type } = {}) => type === BoxConstructionFields);
    expect(children[index + 1].type).toBe(InteriorFields);
    for (const key of ['room', 'wall', 'run', 'item']) {
      expect(children[index + 1].props[key]).toBe(children[index].props[key]);
    }
    expect(children[index + 1].props.settings).toBe(state.settings);
  });

  it('anchor 2: splits into two fixed shelves, supports count edits and indented section selection', () => {
    click('Fixed shelves');
    expectInterior(group('vertical', [fixedShelf]));
    expect(text(field('Interior r'))).toBe('Stack × 2');
    select('r.0');
    expect(field('Interior r.0').props).toMatchObject({ 'aria-pressed': true, style: { paddingLeft: 12 } });
    change('Interior sections', '3');
    click('Partitions');
    expectInterior(group('vertical', [fixedShelf], [group('horizontal', [partition, partition]), {}]));
    expect(text(field('Interior r.0'))).toBe('Side by side × 3');
    select('r.0.1');
    expect(field('Interior r.0.1').props.style.paddingLeft).toBe(24);
    for (const [value, expected] of [['1', 2], ['9', 8], ['bad', 2], ['3.6', 4]]) {
      change('Interior sections', value);
      field('Interior sections').props.onBlur();
      expect(field('Interior sections').props.value).toBe(expected);
    }
  });

  it('anchor 3: edits the root shelf of a nested tree and disables removal beside a group', () => {
    edit(() => {
      run().height = 84;
      run().width = run().grid.cols[0].size = 36;
      item().interior = group('vertical', [{ ...fixedShelf, at: 36 }], [group('horizontal', [partition]), {}]);
    });
    select('r.0');
    select('r');
    expect(field('Remove divider r.0').props).toMatchObject({
      disabled: true, title: 'Remove the splits beside it first',
    });
    expect(options(field('Divider kind r.0'))).toEqual([
      ['fixed', 'Fixed shelf'], ['double_fixed', 'Double fixed shelf'], ['stretcher', 'Stretcher'],
    ]);
    expect(nodes(render()).map(({ props }) => props.label)).toContain('oc from bottom');
    commit('Divider position r.0', 30);
    expectInterior(group('vertical', [{ ...fixedShelf, at: 30 }], [group('horizontal', [partition]), {}]));
    commit('Divider depth r.0', 6);
    change('Divider kind r.0', 'stretcher');
    expectInterior(group('vertical', [{ kind: 'stretcher', at: 30, depth: 6 }], [group('horizontal', [partition]), {}]));
    commit('Divider depth r.0', null);
    expect(field('Divider depth r.0').props).toMatchObject({ value: undefined, allowBlank: true, placeholder: 'Auto (4")' });
    commit('Divider position r.0', null);
    expect(item().interior.dividers[0]).toEqual({ kind: 'stretcher' });
    const calls = dispatch.mock.calls.length;
    for (const value of [0, -1, Infinity]) {
      expect(commit('Divider position r.0', value)).toBe(false);
      expect(commit('Divider depth r.0', value)).toBe(false);
    }
    expect(dispatch).toHaveBeenCalledTimes(calls);
  });

  it('anchor 4: switching an auto partition at centre 24 to Right stores at 12 from right', () => {
    edit(() => {
      run().width = run().grid.cols[0].size = 36;
      // The right-hand nested span is 12.75..35.25, so its auto divider is at 24.
      item().interior = group('horizontal', [{ ...partition, at: 12.375 }], [{}, group('horizontal', [partition])]);
    });
    select('r.1');
    expect(field('Divider from r.1.0').props.value).toBe('right');
    expect(field('Divider position r.1.0').props).toMatchObject({ value: undefined, placeholder: 'Auto (12")' });
    expect(options(field('Divider kind r.1.0'))).toEqual([
      ['partition', 'Partition'], ['double_partition', 'Double partition'],
    ]);
    change('Divider from r.1.0', 'right');
    expectInterior(group('horizontal', [{ ...partition, at: 12.375 }], [{},
      group('horizontal', [{ kind: 'partition', at: 12, from: 'right' }])]));
    change('Divider from r.1.0', 'left');
    expect(item().interior.children[1].dividers[0]).toEqual({ kind: 'partition', at: 24 });
    change('Divider kind r.1.0', 'double_partition');
    expect(item().interior.children[1].dividers[0]).toEqual({ kind: 'double_partition', at: 24 });
    change('Divider from r.1.0', 'right');
    commit('Divider position r.1.0', 10);
    expect(item().interior.children[1].dividers[0]).toEqual({ kind: 'double_partition', at: 10, from: 'right' });
    commit('Divider position r.1.0', null);
    expect(item().interior.children[1].dividers[0]).toEqual({ kind: 'double_partition' });
  });

  it('equalizes positions, clears nested groups, removes dividers and resets vanished selections', () => {
    edit(() => {
      item().interior = group('horizontal', [{ kind: 'double_partition', at: 10, from: 'right', depth: 5 }]);
    });
    click('Equal spacing');
    expectInterior(group('horizontal', [{ kind: 'double_partition', depth: 5 }]));
    select('r.0');
    click('Fixed shelves');
    click('Clear');
    expectInterior(group('horizontal', [{ kind: 'double_partition', depth: 5 }]));
    select('r');
    expect(field('Remove divider r.0').props.disabled).toBe(false);
    field('Remove divider r.0').props.onClick();
    expectInterior(null);
    click('Partitions');
    select('r.1');
    edit(() => { delete item().interior; });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
    edit(() => { item().interior = group('vertical', [fixedShelf]); });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
    expect(field('Interior r.1').props['aria-pressed']).toBe(false);
    click('Clear');
    expectInterior(null);
  });

  it('shows warning text and auto depths, and resolves front and back views from the source wall', () => {
    expect(field('Interior r')).toBeDefined();
    expect(cabinetInterior).toHaveBeenLastCalledWith(room(), wall(), 'front', state.settings, 'c1');
    edit(() => { item().interior = group('vertical', [{ ...fixedShelf, at: 1, depth: 30 }]); });
    expect(text(render())).toContain('A section is smaller than 1". Move a divider.');
    expect(text(render())).toContain('A divider is deeper than the box interior.');
    commit('Divider depth r.0', null);
    expect(field('Divider depth r.0').props.placeholder).toBe('Auto (23")');
    expect(text(render())).not.toContain('A divider is deeper than the box interior.');
    edit(() => { run().wallSide = 'back'; });
    const view = resolveWall(room(), wall(), 'back');
    expect(render({ wall: view, run: view.runs[0] })).not.toBeNull();
    expect(cabinetInterior).toHaveBeenLastCalledWith(room(), wall(), 'back', state.settings, 'c1');
    expect(render()).toBeNull();
  });
});
