import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import InchInput from '../InchInput.jsx';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { cabinetInterior } from '../../model/interiors.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setInteriorPath, setItemInterior, setItemShelves } from '../../store/elevationSlice.js';
import { fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import FaceProperties from './FaceProperties.jsx';
import InteriorFields from './InteriorFields.jsx';
import SlideSelect from './SlideSelect.jsx';
import { newAccessory } from '../../model/accessories.js';
import { wallRollouts } from '../../model/rollouts.js';
import { formatInches } from '../../model/units.js';
import { newShape } from '../../model/libraryShapes.js';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (fn) => fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../model/interiors.js', async (original) => {
  const actual = await original();
  return { ...actual, cabinetInterior: vi.fn(actual.cabinetInterior) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.type === SlideSelect ? SlideSelect(tree.props) : tree.props?.children)] : [];
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
  it('IN3 anchor 4: shares outline selection, highlights only the selected divider, and clears vanished paths', () => {
    edit(() => {
      run().height = 84;
      run().width = run().grid.cols[0].size = 36;
      item().interior = group('vertical', [{ ...fixedShelf, at: 36 }], [group('horizontal', [partition]), {}]);
      state.interiorPath = 'r.0';
      state.interiorDivider = 0;
    });
    const dividerRows = () => nodes(render()).filter(({ type, props }) => type === 'div'
      && props.className?.includes('rounded border p-2'));
    expect(field('Interior r.0').props['aria-pressed']).toBe(true);
    expect(dividerRows()[0].props.className).toContain('border-blue-500');
    click('Stack × 2');
    expect(dispatch).toHaveBeenLastCalledWith(setInteriorPath({ path: 'r' }));
    expect(state).toMatchObject({ interiorPath: 'r', interiorDivider: null });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
    expect(dividerRows()[0].props.className).toContain('border-gray-700');
    dispatch(setInteriorPath({ path: 'r', divider: 0 }));
    expect(dividerRows()[0].props.className).toContain('border-blue-500');
    edit(() => { item().interior = group('vertical', [fixedShelf, fixedShelf]); });
    expect(dividerRows().map(({ props }) => props.className.includes('border-blue-500'))).toEqual([true, false]);
    select('r.1');
    expect(state).toMatchObject({ interiorPath: 'r.1', interiorDivider: null });
    edit(() => { delete item().interior; });
    render();
    expect(dispatch).toHaveBeenLastCalledWith(setInteriorPath(null));
    expect(state).toMatchObject({ interiorPath: null, interiorDivider: null });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
  });

  it('anchor 1: shows the one clear 28 1/2 × 29 section, immediately after Box in the panel', () => {
    const rows = nodes(render()).filter(({ props }) => props['aria-pressed'] !== undefined);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toBe('Section 28 1/2" × 29"');
    expect(rows[0].props['aria-pressed']).toBe(true);
    expect(field('Interior sections').props).toMatchObject({ min: 2, max: 8, value: 2 });

    const view = resolveWall(room(), wall());
    const scene = runScene(room(), view, run(), state.settings);
    const tree = FaceProperties({ part: 'inside', wall: view, run: run(), item: item(), settings: state.settings,
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
    expectInterior({});
    click('Partitions');
    select('r.1');
    edit(() => { delete item().interior; });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
    edit(() => { item().interior = group('vertical', [fixedShelf]); });
    expect(field('Interior r').props['aria-pressed']).toBe(true);
    expect(field('Interior r.1').props['aria-pressed']).toBe(false);
    click('Clear');
    expectInterior({});
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


const autoDoors = () => edit(() => {
  run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
  run().height = 84;
  item().face = { direction: 'vertical', size: null,
    children: [{ type: 'door', size: null }, { type: 'door', size: null }] };
});
const linkedShelf = { kind: 'fixed', seam: 'r:0' };

describe('IN7 effective interior edits', () => {
  it('anchors 1–3: shows automatic outlines, edits, relinks via auto or blank, and restores Auto', () => {
    autoDoors();
    expect(item()).not.toHaveProperty('interior');
    expect(text(render())).toContain('Auto from faces');
    expect(text(field('Interior r'))).toBe('Stack × 2');
    expect(field('Divider position r.0').props.placeholder).toBe('Auto (42" · Seam)');
    select('r.1');
    expect(field('Interior r.1').props['aria-pressed']).toBe(true);
    select('r');
    for (const value of ['auto', '']) {
      commit('Divider position r.0', 40);
      expectInterior(group('vertical', [{ ...linkedShelf, at: 40 }]));
      expect(text(render())).toContain('Edited');
      expect(field('Divider position r.0').props.value).toBe(40);
      expect(text(render())).toContain('type auto to return to the seam');
      const props = field('Divider position r.0').props;
      const input = () => {
        hookIndex = 1;
        return InchInput(props);
      };
      input().props.onChange({ target: { value } });
      input().props.onBlur();
      expectInterior(group('vertical', [linkedShelf]));
      expect(field('Divider position r.0').props.placeholder).toBe('Auto (42" · Seam)');
      expect(text(render())).toContain('Edited');
      expect(text(render())).not.toContain('type auto to return to the seam');
    }
    click('Auto');
    expectInterior(null);
    expect(text(render())).toContain('Auto from faces');
    expect(button('Auto')).toBeUndefined();
  });

  it('anchor 4: removing the last automatic shelf stores an edited empty section; nested edits retain the auto tree', () => {
    autoDoors();
    field('Remove divider r.0').props.onClick();
    expectInterior({});
    expect(text(render())).toContain('Edited');
    expect(field('Divider position r.0')).toBeUndefined();
    click('Auto');
    select('r.0');
    click('Partitions');
    expectInterior(group('vertical', [linkedShelf], [group('horizontal', [partition]), {}]));
    click('Auto');
    select('r');
    click('Clear');
    expectInterior({});
  });

  it('edits effective kinds, depths and banding, preserving seams and explicit picks until reset', () => {
    autoDoors();
    const tick = (checked) => field('Divider banding r.0').props.onChange({ target: { checked } });
    expect(field('Divider banding r.0').props.checked).toBe(true);
    tick(true); // An explicit pick sticks even when it matches the default.
    expectInterior(group('vertical', [{ ...linkedShelf, banding: true }]));
    edit(() => { item().style = { cabinetStyleId: 14 }; });
    expect(field('Divider banding r.0').props.checked).toBe(true);
    field('Reset divider banding r.0').props.onClick();
    expectInterior(group('vertical', [linkedShelf]));
    expect(field('Divider banding r.0').props.checked).toBe(false);
    expect(field('Reset divider banding r.0')).toBeUndefined();
    tick(false);
    edit(() => { item().style = { cabinetStyleId: 13 }; });
    expect(field('Divider banding r.0').props.checked).toBe(false);
    click('Auto');
    commit('Divider depth r.0', 10);
    expectInterior(group('vertical', [{ ...linkedShelf, depth: 10 }]));
    click('Auto');
    change('Divider kind r.0', 'double_fixed');
    expectInterior(group('vertical', [{ ...linkedShelf, kind: 'double_fixed' }]));
    tick(false);
    expect(item().interior.dividers[0].banding).toBe(false);
    change('Divider kind r.0', 'stretcher');
    expectInterior(group('vertical', [{ kind: 'stretcher', seam: 'r:0' }]));
    expect(field('Divider banding r.0')).toBeUndefined();
    click('Auto');
    commit('Divider position r.0', 40);
    click('Equal spacing');
    expectInterior(group('vertical', [linkedShelf]));
    expect(field('Divider position r.0').props.placeholder).toBe('Auto (42" · Seam)');
    edit(() => {
      run().width = run().grid.cols[0].size = item().width = 42;
      item().face = { type: 'pair_door', size: null };
      delete item().interior;
    });
    expect(field('Divider banding r.0')).toBeUndefined();
    change('Divider kind r.0', 'double_partition');
    expectInterior(group('horizontal', [{ kind: 'double_partition', seam: 'r:pair' }]));
  });

  it('explains missing seam and wide box warnings', () => {
    autoDoors();
    commit('Divider position r.0', 40);
    edit(() => { item().face = { type: 'door', size: null }; });
    expect(text(render())).toContain("A shelf or partition lost its door seam; it's spaced evenly.");
    edit(() => {
      run().width = run().grid.cols[0].size = item().width = 42;
      item().face = { type: 'pair_door', size: null };
      item().interior = {};
    });
    expect(text(render())).toContain('Box is over 36" wide with no partition between the doors.');
  });
});


describe('IN13b step d shoe shelf controls', () => {
  beforeEach(() => {
    edit(() => {
      run().width = run().grid.cols[0].size = item().width = 24;
      item().face = { type: 'door', size: null };
    });
    select('r');
  });

  it('anchor 1: stores shoe count on the effective section and shows hardwood dimensions after the flat size', () => {
    expect(field('Shoe shelves r').props).toMatchObject({ value: undefined, allowBlank: true, placeholder: '0' });
    const fields = nodes(render()).filter(({ type }) => type === InchInput);
    expect(fields[fields.findIndex(({ props }) => props['aria-label'] === 'Shelf count r') + 1]
      .props['aria-label']).toBe('Shoe shelves r');
    expect(commit('Shoe shelves r', 2)).toBe(true);
    expectInterior({ shelves: { shoe: 2 } });
    expect(text(field('Shoe shelf size r'))).toBe('Shoe: 22 3/8 × 23 1/16 × 3/4 + 1 1/2 × 13/16 nosing · 12°');
    const sizes = nodes(render()).filter(({ props }) => props['aria-label']?.includes('size r'));
    expect(sizes.map(({ props }) => props['aria-label'])).toEqual(['Shelf size r', 'Shoe shelf size r']);
  });

  it('anchor 2: removes shoe count with zero and a blank input and hides its size', () => {
    commit('Shoe shelves r', 2);
    expect(commit('Shoe shelves r', 0)).toBe(true);
    expectInterior({});
    expect(field('Shoe shelf size r')).toBeUndefined();
    commit('Shoe shelves r', 2);
    const props = field('Shoe shelves r').props;
    const input = () => { hookIndex = 1; return InchInput(props); };
    input().props.onChange({ target: { value: '' } });
    input().props.onBlur();
    expectInterior({});
    expect(field('Shoe shelf size r')).toBeUndefined();
  });

  it('anchor 3: rejects out-of-range and fractional counts without changing the tree', () => {
    commit('Shoe shelves r', 2);
    const before = item().interior;
    const calls = dispatch.mock.calls.length;
    for (const shoe of [21, 2.5, -1, NaN, Infinity]) expect(commit('Shoe shelves r', shoe)).toBe(false);
    expect(item().interior).toBe(before);
    expect(dispatch).toHaveBeenCalledTimes(calls);
    expect(commit('Shoe shelves r', 20)).toBe(true);
    expectInterior({ shelves: { shoe: 20 } });
  });

  it('anchors 4–5: resolves the auto flat count above shoes and renders the exact amber clearance warning', () => {
    commit('Shoe shelves r', 4);
    const message = 'Shoe shelves leave less than 6" clear above the top one (4 7/8" here).';
    const warning = nodes(render()).find(({ type, props }) => type === 'p' && text(props.children) === message);
    expect(warning.props.className).toContain('text-amber-400');
    edit(() => { run().height = 84; });
    expect(field('Shelf count r').props.placeholder).toBe('Auto (4)');
    expect(text(render())).not.toContain(message);
  });

  it('anchor 6: displays folded order depth and retains the shoe material when glass disables nosing', () => {
    edit(() => { item().shelves = { nosing: 'folded' }; });
    commit('Shoe shelves r', 2);
    const expected = 'Shoe: 22 3/8 × 23 1/16 × 3/4 · order 25 1/16 deep (folded) · 12°';
    expect(text(field('Shoe shelf size r'))).toBe(expected);
    field('Glass shelves r').props.onChange({ target: { checked: true } });
    expect(field('Shelf nosing r').props.disabled).toBe(true);
    expect(text(field('Shelf size r'))).toBe('22 3/8 × 22 7/8 × 1/4');
    expect(text(field('Shoe shelf size r'))).toBe(expected);
    commit('Shoe shelves r', 1);
    expect(item().interior.shelves.shoe).toBe(1);
  });
});

describe('IN8 shelf controls', () => {
  const base = (width = 24, type = 'door') => edit(() => {
    run().width = run().grid.cols[0].size = item().width = width;
    item().face = { type, size: null };
  });
  const tick = (label, checked) => field(label).props.onChange({ target: { checked } });

  it('anchor 1: stores count 2 on the effective auto section, accepts zero, and resets with blank or auto', () => {
    base();
    expect(field('Shelf count r')).toBeUndefined();
    select('r');
    expect(field('Shelf count r').props).toMatchObject({ value: undefined, placeholder: 'Auto (1)', allowAuto: true });
    expect(field('Shelf count r').props.className).toContain('placeholder:text-gray-500');
    expect(text(field('Shelf size r'))).toBe('22 3/8 × 22 7/8 × 3/4');
    commit('Shelf count r', 2);
    expectInterior({ shelves: { count: 2 } });
    expect(field('Shelf count r').props.placeholder).toBe('Auto (1)');
    const calls = dispatch.mock.calls.length;
    for (const count of [-1, 21, 1.5, NaN, Infinity]) expect(commit('Shelf count r', count)).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(calls);
    commit('Shelf count r', 0);
    expectInterior({ shelves: { count: 0 } });
    expect(options(field('Line bore r'))[0]).toEqual(['', 'Auto (No)']);
    for (const value of ['', 'auto']) {
      commit('Shelf count r', 2);
      const props = field('Shelf count r').props;
      const input = () => { hookIndex = 1; return InchInput(props); };
      input().props.onChange({ target: { value } });
      input().props.onBlur();
      expectInterior({});
    }
    click('Auto');
    expectInterior(null);
  });

  it('IN8.1: counts shelves in wall coordinates for a cabinet away from the origin, and shows the clear spacing', () => {
    base();
    edit(() => { run().x = 40; run().z = 36; });
    select('r');
    expect(field('Shelf count r').props.placeholder).toBe('Auto (1)');
    expect(text(field('Shelf spacing r'))).toBe('14 1/8 clear between shelves');
    commit('Shelf count r', 0);
    expect(field('Shelf spacing r')).toBeUndefined();
  });

  it('anchor 2: cabinet hardwood removes the auto wide partition without storing a tree', () => {
    base(42, 'pair_door');
    expect(field('Interior r.0')).toBeDefined();
    change('Cabinet shelf nosing', 'hardwood');
    expect(dispatch).toHaveBeenLastCalledWith(setItemShelves({ ...at, patch: { nosing: 'hardwood' } }));
    expect(item()).not.toHaveProperty('interior');
    expect(field('Interior r.0')).toBeUndefined();
    select('r');
    expect(text(field('Shelf size r'))).toBe('40 3/8 × 22 7/8 × 3/4 + 1 1/2 × 13/16 nosing');
    expect(options(field('Shelf nosing r'))[0]).toEqual(['', 'Auto (Hardwood)']);
  });

  it('anchor 3: glass disables nosing and shows quarter-inch size; explicit material picks reset to cabinet values', () => {
    base();
    change('Cabinet shelf nosing', 'folded');
    tick('Cabinet glass shelves', true);
    expect(field('Cabinet shelf nosing').props.disabled).toBe(true);
    expect(item()).not.toHaveProperty('interior');
    select('r');
    expect(field('Glass shelves r').props.checked).toBe(true);
    expect(field('Shelf nosing r').props.disabled).toBe(true);
    expect(text(field('Shelf size r'))).toBe('22 3/8 × 22 7/8 × 1/4');
    tick('Glass shelves r', false);
    expectInterior({ shelves: { glass: false } });
    expect(field('Shelf nosing r').props.disabled).toBe(false);
    expect(text(field('Shelf size r'))).toContain('order 24 7/8 deep (folded)');
    change('Shelf nosing r', 'none');
    expectInterior({ shelves: { glass: false, nosing: 'none' } });
    change('Shelf nosing r', '');
    field('Auto glass shelves r').props.onClick();
    expectInterior({});
    tick('Glass shelves r', true); // Explicit cabinet-equal pick sticks.
    expectInterior({ shelves: { glass: true } });
    expect(field('Auto glass shelves r').props['aria-pressed']).toBe(false);
  });

  it('edits effective child flags, preserves explicit auto-equal picks, and shows crowded warnings on that section', () => {
    autoDoors();
    select('r.0');
    expect(options(field('Hinge plates r.0'))).toEqual([['', 'Auto (Yes)'], ['true', 'Yes'], ['false', 'No']]);
    change('Hinge plates r.0', 'true');
    change('Line bore r.0', 'false');
    expectInterior(group('vertical', [linkedShelf], [{ hinges: true, lineBore: false }, {}]));
    commit('Shelf count r.0', 20);
    expect(text(render())).toContain('Adjustable shelves have less than 3" of clear space between them.');
    select('r.1');
    expect(text(render())).not.toContain('Adjustable shelves have less than 3" of clear space between them.');
    select('r.0');
    change('Hinge plates r.0', '');
    change('Line bore r.0', '');
    commit('Shelf count r.0', null);
    expectInterior(group('vertical', [linkedShelf]));
    select('r');
    expect(field('Shelf count r')).toBeUndefined();
  });
});


describe('IN9 roll-out controls', () => {
  const base = (width = 24, type = 'door') => edit(() => {
    run().width = run().grid.cols[0].size = item().width = width;
    item().face = { type, size: null, ...(type === 'door' ? { hinge: 'left' } : {}) };
    state.settings.drawerSlideId = 'blum-562h';
  });
  const cards = () => nodes(render()).filter(({ props }) => props['aria-label']?.match(/^Roll-out r\.\d+$/));

  it('IN4c anchor 6: shows the exact amber notch note under the typed roll-out', () => {
    base();
    edit(() => { run().depth = 22.5; });
    select('r');
    commit('Roll-out count r', 1);
    expect(field('Roll-out depth r.0').props.placeholder).toBe('Auto (18)');
    commit('Roll-out depth r.0', 21);
    const note = nodes(cards()[0]).find(({ type, props }) => type === 'p'
      && text(props.children) === 'Blum Tandem 562H needs 3/4" behind the box; notch the cabinet back 1/4".');
    expect(note.props.className).toContain('text-amber-400');
    commit('Roll-out depth r.0', null);
    expect(text(cards()[0])).not.toContain('notch the cabinet back');
  });

  it('anchor 1: saves the effective auto section and shows two auto cards and zero shelves', () => {
    base();
    expect(field('Roll-out count r')).toBeUndefined();
    select('r');
    expect(field('Roll-out count r').props).toMatchObject({ placeholder: 'None', value: undefined });
    commit('Roll-out count r', 2);
    expectInterior({ rollouts: { count: 2 } });
    expect(cards()).toHaveLength(2);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text))
      .toContain('Roll-out 1 (bottom)');
    expect(field('Roll-out at r.0').props.placeholder).toBe('Auto (9/16)');
    expect(field('Roll-out at r.1').props.placeholder).toBe('Auto (14 25/32)');
    expect(field('Roll-out height r.0').props.placeholder).toBe('Auto (4 1/4)');
    expect(field('Shelf count r').props.placeholder).toBe('Auto (0)');
    expect(text(field('Roll-out size r.0'))).toBe('20 3/4 wide · spacer left');
  });

  it('anchor 2: stores a sparse position override and moves the box above the deck', () => {
    base();
    edit(() => { run().x = 24; run().z = 40; });
    select('r');
    commit('Roll-out count r', 2);
    commit('Roll-out at r.1', 10);
    expectInterior({ rollouts: { count: 2, items: [{}, { at: 10 }] } });
    const boxes = wallRollouts(room(), wall(), 'front', state.settings).get('c1').get('r').rollouts;
    expect(boxes[1].z).toBe(50.75);
    expect(field('Roll-out at r.1').props).toMatchObject({ value: 10, placeholder: 'Auto (14 25/32)' });
    commit('Roll-out at r.1', null);
    expectInterior({ rollouts: { count: 2 } });
    click('Auto');
    expectInterior(null);
    expect(cards()).toHaveLength(0);
  });

  it('anchor 3: shows the sink pair labels, outer spacers and automatic sink depths', () => {
    base(36, 'pair_door');
    edit(() => { item().purpose = 'sink'; });
    select('r');
    commit('Roll-out count r', 2);
    expect(options(field('Roll-out layout r'))[0]).toEqual(['', 'Auto (Side by side)']);
    expect(cards().map((card) => nodes(card).find(({ type }) => type === 'h4')).map(text)).toEqual(['Left', 'Right']);
    expect(text(field('Roll-out size r.0'))).toBe('15 1/2 wide · spacer left');
    expect(text(field('Roll-out size r.1'))).toBe('15 1/2 wide · spacer right');
    for (const index of [0, 1]) expect(field(`Roll-out depth r.${index}`).props.placeholder).toBe('Auto (18, DRW-006)');
    change('Roll-out layout r', 'stack');
    expect(item().interior.rollouts.layout).toBe('stack');
    expect(text(cards()[0])).toContain('Roll-out 1 (bottom)');
    expect(text(field('Roll-out size r.0'))).toBe('31 1/2 wide · spacers left & right');
    change('Roll-out layout r', '');
    expect(item().interior.rollouts).toEqual({ count: 2 });
  });

  it('anchor 4: edits the cabinet slide without a section selection and inherits it in cards', () => {
    base();
    edit(() => { item().interior = { rollouts: { count: 2 } }; });
    expect(options(field('Cabinet drawer slide'))[0]).toEqual(['', 'Inherit (Blum Tandem 562H)']);
    change('Cabinet drawer slide', 'accuride-3832');
    expect(item().drawerSlideId).toBe('accuride-3832');
    select('r');
    for (const index of [0, 1]) expect(options(field(`Roll-out slide r.${index}`))[0])
      .toEqual(['', 'Auto (Accuride 3832)']);
    change('Roll-out slide r.0', 'blum-562h');
    expect(item().interior.rollouts.items).toEqual([{ slideId: 'blum-562h' }]);
    expect(options(field('Roll-out slide r.0'))[0]).toEqual(['', 'Auto (Accuride 3832)']);
    change('Roll-out slide r.0', '');
    expect(item().interior.rollouts).toEqual({ count: 2 });
    edit(() => { state.interiorPath = null; item().face = { type: 'drawer_front', size: null }; });
    expect(field('Cabinet drawer slide')).toBeUndefined();
  });

  it('validates edits, clears blank/auto picks and count, and shows item and section warnings', () => {
    base();
    select('r');
    commit('Roll-out count r', 2);
    for (const count of [-1, 9, 1.5, NaN, Infinity]) expect(commit('Roll-out count r', count)).toBe(false);
    for (const key of ['height', 'depth', 'at']) {
      for (const value of [-1, NaN, Infinity]) expect(commit(`Roll-out ${key} r.0`, value)).toBe(false);
      expect(field(`Roll-out ${key} r.0`).props).toMatchObject({ allowBlank: true, allowAuto: true });
      expect(field(`Roll-out ${key} r.0`).props.className).toContain('placeholder:text-gray-500');
    }
    for (const key of ['height', 'depth']) expect(commit(`Roll-out ${key} r.0`, 0)).toBe(false);
    commit('Roll-out at r.1', 3);
    expect(text(cards()[1])).toContain('Roll-outs overlap; move one or use fewer.');
    change('Roll-out layout r', 'pair');
    expect(text(render())).toContain('Side by side needs 2 roll-outs behind a pair door; stacked instead.');
    commit('Roll-out height r.0', 40);
    commit('Roll-out depth r.0', 25);
    expect(text(cards()[0])).toContain('Taller than 15 1/8');
    expect(text(cards()[0])).toContain('Deeper than the interior (23").');
    expect(text(cards()[0])).toContain("A roll-out runs past the section's clear space.");
    change('Roll-out slide r.0', 'missing-slide');
    expect(options(field('Roll-out slide r.0'))).toContainEqual(['missing-slide', 'Missing (missing-slide)']);
    expect(text(cards()[0])).toContain("A slide picked here isn't in the Library any more; using Blum Tandem 562H.");
    for (const value of ['', 'auto']) {
      const props = field('Roll-out height r.0').props;
      const input = () => { hookIndex = 1; return InchInput(props); };
      input().props.onChange({ target: { value } });
      input().props.onBlur();
      expect(item().interior.rollouts.items[0]).not.toHaveProperty('height');
    }
    commit('Roll-out count r', 1);
    expect(item().interior.rollouts.items).toHaveLength(1);
    for (const count of [0, null]) {
      commit('Roll-out count r', count);
      expect(item().interior).not.toHaveProperty('rollouts');
      expect(cards()).toHaveLength(0);
      commit('Roll-out count r', 2);
    }
  });
});


describe('IN12b section accessory controls', () => {
  const base = () => edit(() => {
    run().width = run().grid.cols[0].size = item().width = 24;
    item().face = { type: 'door', size: null, hinge: 'left' };
    state.settings.accessories = [
      { ...newAccessory([], 'susan'), name: 'Lazy susan 28', wholeSection: true,
        minOpening: { width: 27, depth: null, height: null } },
      { ...newAccessory([], 'tray'), name: 'Tray dividers' },
      { ...newAccessory([], 'drawer'), name: 'Drawer insert', attachesTo: 'drawer_box' },
    ];
  });
  const cards = () => nodes(render()).filter(({ props }) => props['aria-label']?.match(/^Accessory r\.\d+$/));

  it('anchors 1–2: adds to the auto section, shows zero Auto shelves and the exact width warning', () => {
    base();
    expect(field('Add accessory r')).toBeUndefined();
    select('r');
    expect(cards()).toHaveLength(0);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text)).toContain('Accessories');
    expect(options(field('Add accessory r'))).toEqual([
      ['', 'Add accessory…'], ['susan', 'Lazy susan 28'], ['tray', 'Tray dividers'],
    ]);
    change('Add accessory r', 'susan');
    expectInterior({ accessories: [{ accessoryId: 'susan' }] });
    expect(cards()).toHaveLength(1);
    expect(field('Add accessory r').props.value).toBe('');
    expect(field('Shelf count r').props.placeholder).toBe('Auto (0)');
    expect(options(field('Line bore r'))[0]).toEqual(['', 'Auto (No)']);
    expect(text(cards()[0])).toContain('Needs 27" wide (22 1/2" here).');
    expect(nodes(cards()[0]).find(({ type }) => type === 'p').props.className).toContain('text-amber-400');
    change('Add accessory r', 'susan');
    expect(item().interior.accessories).toEqual([{ accessoryId: 'susan', qty: 2 }]);
    click('Auto');
    expectInterior(null);
    expect(cards()).toHaveLength(0);
    expect(field('Shelf count r').props.placeholder).toBe('Auto (1)');
  });

  it('anchor 3: edits quantities, clears qty at one, replaces picks and removes the final key', () => {
    base();
    select('r');
    change('Add accessory r', 'tray');
    expect(field('Accessory qty r.0').props).toMatchObject({ type: 'number', min: 1, max: 20, step: 1, value: 1 });
    change('Accessory qty r.0', '3');
    expectInterior({ accessories: [{ accessoryId: 'tray', qty: 3 }] });
    for (const value of ['0', '21', '1.5', '', 'NaN', 'Infinity']) {
      change('Accessory qty r.0', value);
      expect(item().interior.accessories[0].qty).toBe(3);
    }
    change('Accessory qty r.0', '1');
    expectInterior({ accessories: [{ accessoryId: 'tray' }] });
    change('Accessory qty r.0', '20');
    expect(item().interior.accessories[0].qty).toBe(20);
    change('Accessory pick r.0', 'susan');
    expect(item().interior.accessories).toEqual([{ accessoryId: 'susan', qty: 20 }]);
    change('Accessory pick r.0', 'tray');
    field('Remove Tray dividers').props.onClick();
    expectInterior({});
    expect(item().interior).not.toHaveProperty('accessories');
    expect(cards()).toHaveLength(0);
  });

  it('anchor 4: disables Add with the Library hint when no section accessories are available', () => {
    base();
    select('r');
    for (const library of [[], undefined, state.settings.accessories.filter(({ attachesTo }) => attachesTo === 'drawer_box')]) {
      edit(() => { state.settings.accessories = library; });
      expect(field('Add accessory r').props.disabled).toBe(true);
      expect(options(field('Add accessory r'))).toEqual([['', 'Add accessory…']]);
      expect(text(render())).toContain('Add accessories in Library → Accessories.');
    }
  });

  it('keeps missing and wrong-place picks repairable and renders all size and section warnings', () => {
    base();
    select('r');
    edit(() => {
      run().x = 40;
      run().z = 36;
      state.settings.accessories[0].minOpening = { width: 27, depth: 30, height: 40 };
      item().interior = { accessories: [{ accessoryId: 'lost' }, { accessoryId: 'drawer' }, { accessoryId: 'susan' }] };
    });
    expect(options(field('Accessory pick r.0'))[0]).toEqual(['lost', 'Missing']);
    expect(text(cards()[0])).toContain("This accessory isn't in the Library any more.");
    expect(options(field('Accessory pick r.1'))[0]).toEqual(['drawer', 'Drawer insert']);
    expect(text(cards()[1])).toContain('Drawer insert goes on a drawer box, not in a section.');
    expect(text(cards()[2])).toContain('Needs 27" wide (22 1/2" here); Needs 30" deep (23" here); Needs 40" tall (29" here).');
    const wholeMessage = 'Lazy susan 28 takes the whole section; remove the roll-outs, typed shelves or other accessories.';
    expect(text(render())).not.toContain(wholeMessage);
    change('Add accessory r', 'tray');
    expect(text(render())).toContain(wholeMessage);
    change('Accessory pick r.0', 'tray');
    expect(item().interior.accessories).toEqual([
      { accessoryId: 'drawer' }, { accessoryId: 'susan' }, { accessoryId: 'tray', qty: 2 },
    ]);
    field('Remove Tray dividers').props.onClick();
    expect(text(render())).not.toContain(wholeMessage);
    commit('Shelf count r', 2);
    expect(text(render())).toContain(wholeMessage);
    expect(field('Shelf count r').props.placeholder).toBe('Auto (0)');
    commit('Shelf count r', null);
    commit('Roll-out count r', 1);
    expect(text(render())).toContain(wholeMessage);
  });
});

describe('IN13a step d placed accessory controls', () => {
  beforeEach(() => {
    edit(() => {
      run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
      run().height = 84;
      run().width = run().grid.cols[0].size = item().width = 24;
      item().face = { type: 'door', size: null, hinge: 'left' };
      state.settings.accessories = [
        { ...newAccessory([], 'FR'), name: 'Fixed rod',
          size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 },
        { ...newAccessory([], 'HK'), name: 'Robe hook', size: { width: 3, height: 2, depth: 3 } },
        { ...newAccessory([], 'BIG'), name: 'Big rod', lengthDeduction: 30 },
        { ...newAccessory([], 'CU'), name: 'Drawer insert', attachesTo: 'drawer_box' },
      ];
    });
    select('r');
  });

  it('anchors 1–2: commits Up 40 and blank through InchInput, shows ordered length and one hint', () => {
    change('Add accessory r', 'FR');
    expect(field('Accessory up r.0').props).toMatchObject({ value: null, allowBlank: true, placeholder: 'Not placed' });
    expect(nodes(render()).some(({ props }) => props.label === 'Up (oc)')).toBe(true);
    expect(text(render())).toContain('Ordered length 22 1/4"');
    const typeUp = (value) => {
      const props = field('Accessory up r.0').props;
      const input = () => { hookIndex = 1; return InchInput(props); };
      input().props.onChange({ target: { value } });
      input().props.onBlur();
    };
    typeUp('40');
    expectInterior({ accessories: [{ accessoryId: 'FR', fromBottom: 40 }] });
    expect(field('Accessory up r.0').props.value).toBe(40);
    for (const value of [0, -1, Infinity, NaN]) {
      expect(commit('Accessory up r.0', value)).toBe(false);
      expect(item().interior.accessories[0].fromBottom).toBe(40);
    }
    typeUp('');
    expectInterior({ accessories: [{ accessoryId: 'FR' }] });
    change('Add accessory r', 'HK');
    const hint = "Height from the bottom of the section to the accessory's centre.";
    expect(nodes(render()).filter((node) => node.type === 'p' && text(node) === hint)).toHaveLength(1);
    edit(() => {
      item().interior.accessories = [{ accessoryId: 'gone', fromBottom: 10 }, { accessoryId: 'CU', fromBottom: 10 }];
    });
    expect(field('Accessory up r.0')).toBeUndefined();
    expect(field('Accessory up r.1')).toBeUndefined();
    expect(text(render())).not.toContain(hint);
  });

  it('anchor 3: renders outside and invalid ordered-length warnings in amber', () => {
    change('Add accessory r', 'HK');
    const height = cabinetInterior(room(), wall(), 'front', state.settings, item().id).sections[0].height;
    commit('Accessory up r.0', height - 0.5);
    change('Add accessory r', 'BIG');
    const messages = nodes(render()).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
    expect(messages).toContain(`Placed outside the section (${formatInches(height)} tall here).`);
    expect(messages).toContain('Big rod is ordered at section width − 30" (22 1/2" wide here).');
    expect(text(render())).not.toContain('Ordered length');
  });

  it('renders missing drawings and fixed-size drawing warnings with the correct axis words', () => {
    edit(() => {
      state.settings.accessories[0].shapeId = 'gone';
      item().interior = { accessories: [{ accessoryId: 'FR', fromBottom: 40 }] };
    });
    expect(text(render())).toContain("Its drawing isn't in the shape library.");
    edit(() => {
      state.settings.shapes = [{ ...newShape([], 'drawing'),
        stretch: { x: [[3, 9]], y: [[3, 9]], z: [[3, 9]] } }];
      state.settings.accessories[0].shapeId = 'drawing';
      state.settings.accessories[0].size = { width: 5, height: 5, depth: 5 };
    });
    const messages = nodes(render()).filter(({ type, props }) => type === 'p'
      && props.className?.includes('text-amber-400')).map(text);
    for (const axis of ['wide', 'tall', 'deep']) {
      expect(messages).toContain(`Too small for its drawing: the fixed parts are 6" ${axis}, this is 5".`);
    }
    expect(text(render())).not.toContain("Its drawing isn't in the shape library.");
  });
});
