import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import InchInput from '../InchInput.jsx';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { cabinetInterior } from '../../model/interiors.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { createInitialElevationState, setInteriorPath, setItemInterior, setItemShelves } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { fixed, run as makeRun, room as makeRoom, wall as makeWall } from '../../../test/builders.js';
import { wallInteriorData } from '../../model/shelves.js';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import FaceProperties from './FaceProperties.jsx';
import InteriorFields from './InteriorFields.jsx';
import SlideSelect from './SlideSelect.jsx';
import { newAccessory } from '../../model/accessories.js';
import { wallRollouts } from '../../model/rollouts.js';
import { formatInches } from '../../model/units.js';
import { newShape } from '../../model/libraryShapes.js';
import InteriorShapes from '../InteriorShapes.jsx';
import { shippingList } from '../../../reports/shippingList.js';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (fn) => fn(), useRef: (current) => ({ current }),
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
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

describe('IN15e step b zone gap controls', () => {
  it('anchors 1–3: shows the sink gap, widens roll-outs at zero, and hides Gap for a partition', () => {
    state = createInitialElevationState({ rooms: [makeRoom({ walls: [makeWall({ runs: [makeRun({
      width: 36, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...fixed('c1', 36), purpose: 'sink', face: { type: 'pair_door', size: null } }],
    })] })] })], activeRoomId: 'room-1', activeWallId: 'wall-1' });
    state.settings.drawerSlideId = 'blum-562h';
    select('r');
    commit('Roll-out count r', 2);
    dispatch(setInteriorPath({ path: 'r', divider: 0 }));
    const data = () => wallInteriorData(room(), wall(), 'front', state.settings);
    const widths = () => [...data().rollouts.get('c1').values()].map(({ rollouts }) => rollouts[0].width);
    const shapes = () => nodes(InteriorShapes({ entries: [...data().interiors.values()], drawnPieces: [],
      transform: { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 }, selectedPieceId: 'c1' }));
    const lines = () => shapes().filter(({ type, props }) => type === 'line' && props.dash);
    const dividerRow = nodes(render()).find(({ type, props }) => type === 'div'
      && props.className?.includes('border-blue-500'));
    expect(dividerRow.props.children.slice(0, 2).map(({ props }) => props.label)).toEqual(['Kind', 'Gap']);
    expect(field('Divider gap r.0').props).toMatchObject({
      value: undefined, placeholder: 'Auto (1")', allowBlank: true, allowAuto: true,
    });
    expect(data().interiors.get('c1').dividers[0]).toMatchObject({ fromLeft: 18, width: 1, linked: true });
    expect(lines()).toHaveLength(2);
    expect(lines().map(({ props }) => props.points[0])).toEqual([0, 8]);
    expect(widths()).toEqual([15, 15]);
    expect(commit('Divider gap r.0', -1)).toBe(false);
    expect(widths()).toEqual([15, 15]);
    commit('Divider gap r.0', 0);
    expect(item().interior.dividers[0].gap).toBe(0);
    expect(lines()).toHaveLength(1);
    expect(widths()).toEqual([15.5, 15.5]);
    commit('Divider gap r.0', null);
    expect(item().interior.dividers[0]).not.toHaveProperty('gap');
    expect(widths()).toEqual([15, 15]);
    commit('Divider gap r.0', 2);
    change('Divider kind r.0', 'partition');
    expect(field('Divider gap r.0')).toBeUndefined();
    expect(item().interior.dividers[0]).not.toHaveProperty('gap');
    expect(data().interiors.get('c1').dividers[0]).toMatchObject({ kind: 'partition', width: 0.75 });
    expect(shapes().find(({ key }) => key === 'r:0').type).toBe('rect');
    expect(lines()).toHaveLength(0);
    change('Divider kind r.0', 'zone');
    expect(field('Divider gap r.0').props).toMatchObject({ value: undefined, placeholder: 'Auto (1")' });
  });

  it('anchor 4: defaults an up/down gap to Auto (0") and draws a single dashed line', () => {
    select('r');
    field('Split as zones').props.onChange({ target: { checked: true } });
    click('Fixed shelves');
    dispatch(setInteriorPath({ path: 'r', divider: 0 }));
    expect(field('Divider gap r.0').props).toMatchObject({ value: undefined, placeholder: 'Auto (0")' });
    const data = wallInteriorData(room(), wall(), 'front', state.settings);
    const shapes = nodes(InteriorShapes({ entries: [...data.interiors.values()], drawnPieces: [],
      transform: { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 }, selectedPieceId: 'c1' }));
    expect(shapes.filter(({ type, props }) => type === 'line' && props.dash)).toHaveLength(1);
    commit('Divider gap r.0', 0);
    expect(field('Divider gap r.0').props.value).toBe(0);
    commit('Divider gap r.0', null);
    expect(item().interior.dividers[0]).not.toHaveProperty('gap');
    expect(field('Divider gap r.0').props.placeholder).toBe('Auto (0")');
  });
});

describe('IN15b step c zone controls', () => {
  it('anchors 1–3: splits as zones, edits the line, hides depth/banding and keeps the fixed shelf centre', () => {
    edit(() => { run().height = 34.5; });
    select('r');
    expect(field('Split as zones').props.checked).toBe(false);
    field('Split as zones').props.onChange({ target: { checked: true } });
    click('Fixed shelves');
    expectInterior(group('vertical', [{ kind: 'zone' }]));
    expect(field('Interior r.0')).toBeDefined();
    expect(field('Interior r.1')).toBeDefined();
    dispatch(setInteriorPath({ path: 'r', divider: 0 }));
    expect(field('Divider kind r.0').props.value).toBe('zone');
    expect(field('Divider position r.0').props.placeholder).toBe('Auto (17 1/4")');
    expect(field('Divider depth r.0')).toBeUndefined();
    expect(field('Divider banding r.0')).toBeUndefined();
    commit('Divider position r.0', 17.25);
    change('Divider kind r.0', 'fixed');
    const resolved = cabinetInterior(room(), wall(), 'front', state.settings, 'c1');
    expect(resolved.dividers[0]).toMatchObject({ kind: 'fixed', height: 0.75, fromBottom: 17.25 });
    expect(field('Divider depth r.0')).toBeDefined();
    expect(field('Divider banding r.0')).toBeDefined();
    commit('Divider depth r.0', 12);
    change('Divider kind r.0', 'zone');
    expect(item().interior.dividers[0]).toMatchObject({ kind: 'zone', at: 17.25, depth: 12 });
    expect(field('Divider depth r.0')).toBeUndefined();
    expect(field('Divider banding r.0')).toBeUndefined();
    click('Clear');
    click('Partitions');
    expectInterior(group('horizontal', [{ kind: 'zone' }]));
    click('Clear');
    field('Split as zones').props.onChange({ target: { checked: false } });
    click('Partitions');
    expectInterior(group('horizontal', [partition]));
  });

  it('shows shared manual and Auto flags on either zone and writes only to the first member', () => {
    edit(() => {
      item().face = { type: 'door', hinge: 'left' };
      item().interior = group('vertical', [{ kind: 'zone' }], [
        { shelves: { count: 0 }, lineBore: false, hinges: true },
        { shelves: { count: 2 }, lineBore: true, hinges: false },
      ]);
    });
    for (const path of ['r.0', 'r.1']) {
      select(path);
      expect(field(`Line bore ${path}`).props.value).toBe('false');
      expect(field(`Hinge plates ${path}`).props.value).toBe('true');
      expect(options(field(`Line bore ${path}`))[0]).toEqual(['', 'Auto (Yes)']);
      expect(options(field(`Hinge plates ${path}`))[0]).toEqual(['', 'Auto (Yes)']);
      expect(text(render())).toContain('Applies to the whole section (zones)');
    }
    change('Line bore r.1', '');
    change('Hinge plates r.1', '');
    expect(item().interior.children[0]).toEqual({ shelves: { count: 0 } });
    expect(item().interior.children[1]).toMatchObject({ lineBore: true, hinges: false });
    expect(field('Line bore r.1').props.value).toBe('');
    expect(field('Hinge plates r.1').props.value).toBe('');
    change('Line bore r.1', 'false');
    change('Hinge plates r.1', 'true');
    expect(item().interior.children[0]).toMatchObject({ lineBore: false, hinges: true });
    select('r.0');
    expect(field('Line bore r.0').props.value).toBe('false');
    expect(field('Hinge plates r.0').props.value).toBe('true');
  });
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
      ['zone', 'Zone'],
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
      ['zone', 'Zone'],
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
    expect(fields[fields.findIndex(({ props }) => props['aria-label'] === 'Shelf bottom r') + 1]
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

  it('SH3 e anchor 4: mirrors a placed ROD-ACC drawing and removes the key on untick', () => {
    edit(() => {
      state.settings.shapes = [{ ...newShape([], 'RODC'), kind: 'accessory' }];
      state.settings.accessories = [{ ...newAccessory([], 'ROD-ACC'), shapeId: 'RODC' },
        { ...newAccessory([], 'box'), name: 'Box' }];
    });
    change('Add accessory r', 'ROD-ACC');
    expect(field('Accessory mirror r.0')).toBeUndefined();
    commit('Accessory up r.0', 40);
    expect(field('Accessory mirror r.0').props.checked).toBe(false);
    field('Accessory mirror r.0').props.onChange({ target: { checked: true } });
    expectInterior({ accessories: [{ accessoryId: 'ROD-ACC', fromBottom: 40, mirror: true }] });
    expect(field('Accessory mirror r.0').props.checked).toBe(true);
    field('Accessory mirror r.0').props.onChange({ target: { checked: false } });
    expectInterior({ accessories: [{ accessoryId: 'ROD-ACC', fromBottom: 40 }] });
    change('Add accessory r', 'box');
    commit('Accessory up r.1', 40);
    expect(field('Accessory mirror r.1')).toBeUndefined();
    edit(() => { state.settings.shapes = []; });
    expect(field('Accessory mirror r.0')).toBeUndefined();
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

  it('SH4 a: formats front and back depth warnings in amber', () => {
    edit(() => {
      state.settings.shapes = [{ ...newShape([], 'RODC'), kind: 'accessory',
        box: { x: 0, y: 0, z: 0, w: 12, h: 12, d: 2 } }];
      state.settings.accessories = [{ ...newAccessory([], 'ROD-ACC'), shapeId: 'RODC',
        depthAnchor: { at: 'back', offset: 1 } }];
    });
    change('Add accessory r', 'ROD-ACC');
    commit('Accessory up r.0', 40);
    const warning = (message) => nodes(render()).find((node) => node.type === 'p' && text(node) === message);
    expect(warning('Sticks out the back of the section by 1".').props.className).toContain('text-amber-400');
    edit(() => { state.settings.accessories[0].depthAnchor = { at: 'front', offset: -0.5 }; });
    expect(warning('Sticks out the front of the section by 1/2".').props.className).toContain('text-amber-400');
    commit('Accessory up r.0', null);
    expect(text(render())).not.toContain('Sticks out');
  });
});


describe('IN15c step b stack placement controls', () => {
  beforeEach(() => {
    state = createInitialElevationState({ rooms: [makeRoom({ walls: [makeWall({ runs: [makeRun({
      width: 24, height: 31.5, x: 24, z: 40, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...fixed('c1', 24), face: { type: 'door', size: null, hinge: 'left' } }],
    })] })] })], activeRoomId: 'room-1', activeWallId: 'wall-1' });
    state.settings.drawerSlideId = 'blum-562h';
    select('r');
  });

  const data = () => wallInteriorData(room(), wall(), 'front', state.settings);
  const shelves = () => data().shelves.get('c1').get('r');
  const boxes = () => data().rollouts.get('c1').get('r').rollouts;
  const positions = () => {
    const actual = data();
    const bottom = actual.interiors.get('c1').sections.find(({ path }) => path === 'r').z;
    return actual.shelves.get('c1').get('r').positions.map((z) => z - bottom);
  };
  const type = (label, value) => {
    const props = field(label).props;
    hookIndex = 10;
    hookState[10] = value;
    InchInput(props).props.onBlur();
  };
  const amber = () => nodes(render()).filter(({ type, props }) => type === 'p'
    && props.className?.includes('text-amber-400')).map(text);

  it('anchors 1–2: shows Auto bottom and Equal top, then updates spacing and doors-off positions', () => {
    expect(data().interiors.get('c1').sections[0].height).toBe(30);
    expect(field('Shelf count r').props.placeholder).toBe('Auto (1)');
    expect(field('Shelf bottom r').props).toMatchObject({ value: undefined, placeholder: '14 5/8',
      allowBlank: true, allowAuto: true });
    hookIndex = 10;
    hookState[10] = '';
    expect(InchInput(field('Shelf bottom r').props).props.className).toContain('placeholder:text-gray-500');
    expect(field('Shelf top mode r').props.value).toBe('equal');
    expect(options(field('Shelf top mode r'))).toEqual([['equal', 'Equal'], ['from-top', 'From top']]);
    expect(field('Shelf from top r')).toBeUndefined();
    const labels = nodes(render()).filter(({ props }) => props.label).map(({ props }) => props.label);
    expect(labels.slice(labels.indexOf('Adj. shelves'), labels.indexOf('Adj. shelves') + 3))
      .toEqual(['Adj. shelves', 'Bottom', 'Top']);

    type('Shelf bottom r', '12');
    change('Shelf top mode r', 'from-top');
    type('Shelf from top r', '0');
    commit('Shelf count r', 2);
    expect(item().interior.shelves).toEqual({ count: 2, bottom: 12, top: 0 });
    expect(field('Shelf bottom r').props.value).toBe(12);
    expect(field('Shelf from top r').props.value).toBe(0);
    expect(text(field('Shelf spacing r'))).toBe('16 1/2 clear between shelves');
    expect(positions()).toEqual([12, 29.25]);
    expect(shelves().gap).toBe(16.5);

    type('Shelf bottom r', '');
    expect(item().interior.shelves).toEqual({ count: 2, top: 0 });
    expect(field('Shelf bottom r').props.placeholder).toBe('14 1/4');
    change('Shelf top mode r', 'equal');
    expect(item().interior.shelves).toEqual({ count: 2 });
    type('Shelf count r', 'auto');
    expect(field('Shelf bottom r').props.placeholder).toBe('14 5/8');
  });

  it('anchor 3: shows slide clearance, positions roll-out boxes and displays spacing for 2+ auto boxes', () => {
    expect(field('Roll-out bottom r').props.disabled).toBe(true);
    expect(field('Roll-out top mode r').props.disabled).toBe(true);
    commit('Roll-out count r', 2);
    expect(field('Roll-out bottom r').props).toMatchObject({ placeholder: '9/16', value: undefined,
      allowBlank: true, allowAuto: true, disabled: false });
    expect(field('Roll-out top mode r').props.value).toBe('equal');
    change('Roll-out top mode r', 'from-top');
    type('Roll-out from top r', '18');
    expect(item().interior.rollouts).toEqual({ count: 2, top: 18 });
    expect(boxes().map(({ at }) => at)).toEqual([0.5625, 7.75]);
    expect(text(field('Roll-out spacing r'))).toBe('Spacing 2 15/16"');

    type('Roll-out bottom r', '2');
    commit('Roll-out at r.0', 3);
    expect(boxes().map(({ at }) => at)).toEqual([3, 7.75]);
    expect(field('Roll-out spacing r')).toBeUndefined();
    commit('Roll-out at r.1', 20);
    expect(boxes().map(({ at }) => at)).toEqual([3, 20]);
    type('Roll-out bottom r', 'auto');
    expect(item().interior.rollouts).not.toHaveProperty('bottom');
    expect(item().interior.rollouts.top).toBe(18);
    change('Roll-out top mode r', 'equal');
    expect(item().interior.rollouts).not.toHaveProperty('top');
    edit(() => {
      state.settings.slides = state.settings.slides.map((slide) => slide.id === 'accuride-3832'
        ? { ...slide, minBelow: 0.125 } : slide);
    });
    change('Roll-out slide r.0', 'accuride-3832');
    expect(field('Roll-out bottom r').props.placeholder).toBe('1/8');
    commit('Roll-out count r', 1);
    expect(field('Roll-out spacing r')).toBeUndefined();
  });

  it('validates ends, clears Bottom independently, and renders the stack warnings in amber', () => {
    commit('Shelf count r', 1);
    type('Shelf bottom r', '12');
    change('Shelf top mode r', 'from-top');
    expect(amber()).toContain('Top ignored with one shelf');
    expect(field('Shelf spacing r')).toBeUndefined();
    commit('Roll-out count r', 2);
    type('Shelf bottom r', '0');
    expect(amber()).toContain('Shelves reach into the roll-outs');
    commit('Shelf count r', 2);
    type('Shelf bottom r', '29');
    expect(amber()).toContain("Don't fit");
    change('Roll-out top mode r', 'from-top');
    type('Roll-out from top r', '24');
    expect(amber()).toContain("Don't fit");
    commit('Roll-out count r', 1);
    expect(amber()).toContain('Top ignored with one roll-out');
    for (const prefix of ['Shelf', 'Roll-out']) {
      const before = state;
      for (const bad of [-1, NaN, Infinity]) {
        expect(commit(`${prefix} bottom r`, bad)).toBe(false);
        expect(commit(`${prefix} from top r`, bad)).toBe(false);
      }
      type(`${prefix} from top r`, '');
      expect(state).toBe(before);
      type(`${prefix} bottom r`, '');
      expect(item().interior[prefix === 'Shelf' ? 'shelves' : 'rollouts']).not.toHaveProperty('bottom');
    }
  });
});


describe('IN15d step b sink zones and mounting messages', () => {
  beforeEach(() => {
    state = createInitialElevationState({ rooms: [makeRoom({ walls: [makeWall({ runs: [makeRun({
      width: 36, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...fixed('c1', 36), purpose: 'sink', face: { type: 'pair_door', size: null } }],
    })] })] })], activeRoomId: 'room-1', activeWallId: 'wall-1' });
    state.settings.drawerSlideId = 'blum-562h';
    select('r');
  });
  const data = () => wallInteriorData(room(), wall(), 'front', state.settings);
  const notice = 'Split into side-by-side zones at the pair doors';

  it('anchors 1 and 3: splits at the pair seam, keeps shipping grouped, then converts to a partition', () => {
    commit('Roll-out count r', 1);
    commit('Roll-out height r.0', 5);
    commit('Roll-out count r', 2);
    expect(item().interior).toEqual(group('horizontal', [{ kind: 'zone', seam: 'r:pair' }],
      Array.from({ length: 2 }, () => ({ rollouts: { count: 1, items: [{ height: 5 }] } }))));
    expect(state.interiorPath).toBe('r');
    expect(text(field('Interior r'))).toBe('Side by side × 2');
    expect(field('Roll-out count r').props).toMatchObject({ value: 2, disabled: true });
    const countSection = nodes(render()).find(({ type, props }) => type === 'div'
      && props.children?.some?.((node) => node?.type === 'h4' && text(node) === 'Roll-outs'));
    expect(text(countSection.props.children[2])).toBe(notice);
    expect(field('Roll-out layout r')).toBeUndefined();
    const actual = data();
    expect(actual.interiors.get('c1').dividers[0]).toMatchObject({ kind: 'zone', linked: true, fromLeft: 18 });
    expect([...actual.rollouts.get('c1').values()].map(({ rollouts, warnings }) => [rollouts.length, rollouts[0].width, warnings]))
      .toEqual([[1, 15, []], [1, 15, []]]);
    const shapes = nodes(InteriorShapes({ entries: [...actual.interiors.values()], drawnPieces: [],
      shelves: actual.shelves, rollouts: actual.rollouts, accessories: actual.accessories,
      transform: { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 }, selectedPieceId: 'c1' }));
    expect(shapes.filter(({ type, props }) => type === 'line' && props.dash)).toHaveLength(2);
    expect(shapes.filter(({ type, key }) => type === 'group' && String(key).startsWith('rollout:'))).toHaveLength(2);
    expect(shippingList(room(), state.settings).rows.find(({ key }) => key === 'c1').notes)
      .toEqual(['NLB', '2 ro - 18"']);
    select('r.0');
    expect(text(render())).toContain('Roll-out 1 (bottom)');
    expect(text(render())).not.toContain(notice);
    dispatch(setInteriorPath({ path: 'r', divider: 0 }));
    change('Divider kind r.0', 'partition');
    expect(data().interiors.get('c1').dividers[0].kind).toBe('partition');
    expect([...data().rollouts.get('c1').values()].map(({ rollouts, warnings }) => [rollouts[0].width, warnings]))
      .toEqual([[15.125, []], [15.125, []]]);
    expect(text(render())).not.toContain(notice);
  });

  it('anchor 2: stacks a non-sink pair and a sink single door, splitting only on a qualifying count commit', () => {
    edit(() => { delete item().purpose; });
    commit('Roll-out count r', 2);
    expectInterior({ rollouts: { count: 2 } });
    expect(wallRollouts(room(), wall(), 'front', state.settings).get('c1').get('r').rollouts[1].z)
      .toBeGreaterThan(wallRollouts(room(), wall(), 'front', state.settings).get('c1').get('r').rollouts[0].z);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text))
      .toEqual(expect.arrayContaining(['Roll-out 1 (bottom)', 'Roll-out 2']));
    expect(field('Roll-out layout r')).toBeUndefined();
    edit(() => { item().purpose = 'sink'; item().face = { type: 'door', hinge: 'left' }; });
    commit('Roll-out count r', 2);
    expect(item().interior).toEqual({ rollouts: { count: 2 } });
    edit(() => { item().face = { type: 'pair_door', size: null }; });
    expect(text(render())).not.toContain(notice);
    expect(item().interior).toEqual({ rollouts: { count: 2 } });
    commit('Roll-out count r', 3);
    expect(item().interior).toEqual({ rollouts: { count: 3 } });
    commit('Roll-out count r', 2);
    expect(item().interior.dividers).toEqual([{ kind: 'zone', seam: 'r:pair' }]);
    edit(() => {
      item().face = { direction: 'horizontal', size: null, children: [
        { type: 'door', hinge: 'left', size: 10 }, { type: 'pair_door', size: null },
      ] };
      item().interior = group('horizontal', [partition]);
    });
    select('r.0');
    commit('Roll-out count r.0', 2);
    // Only one half of the pair covers this section, so it remains a stack.
    expect(item().interior.children[0]).toEqual({ rollouts: { count: 2 } });
    select('r.1');
    commit('Roll-out count r.1', 2);
    expect(item().interior.dividers).toEqual([partition, { kind: 'zone', seam: 'r.1:pair' }]);
    expect(item().interior.children).toEqual([
      { rollouts: { count: 2 } }, { rollouts: { count: 1 } }, { rollouts: { count: 1 } },
    ]);
    expect(state.interiorPath).toBe('r');
    expect(text(render())).toContain(notice);
  });

  it('renders each mounting message in amber and clears them with a partition or by deleting the zone', () => {
    edit(() => { delete item().purpose; });
    field('Split as zones').props.onChange({ target: { checked: true } });
    click('Partitions');
    select('r.0');
    commit('Roll-out count r.0', 2);
    commit('Shelf count r.0', 1);
    edit(() => {
      state.settings.accessories = [{ ...newAccessory([], 'rod'), size: { width: 'section', height: 1, depth: 1 } }];
    });
    change('Add accessory r.0', 'rod');
    const messages = ['Nothing to mount the slides to at the zone line',
      'Shelves need a side or partition at the zone line', 'Nothing to mount it to at the zone line'];
    const amber = () => nodes(render()).filter(({ type, props }) => type === 'p'
      && props.className?.includes('text-amber-400')).map(text);
    expect(amber()).toEqual(expect.arrayContaining(messages));
    expect(text(field('Roll-out r.0.0'))).not.toContain(messages[0]);
    expect(text(field('Roll-out r.0.1'))).toContain(messages[0]);
    commit('Shelf count r.0', 0);
    commit('Shoe shelves r.0', 1);
    expect(amber()).toContain(messages[1]);
    const zoned = structuredClone(item().interior);
    select('r');
    change('Divider kind r.0', 'partition');
    select('r.0');
    for (const message of messages) expect(amber()).not.toContain(message);
    edit(() => { item().interior = zoned; });
    select('r');
    field('Remove divider r.0').props.onClick();
    for (const message of messages) expect(amber()).not.toContain(message);
  });
});
