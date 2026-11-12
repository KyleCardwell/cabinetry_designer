import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import InchInput from '../InchInput.jsx';
import { cabinetInterior } from '../../model/interiors.js';
import { gridLeaves } from '../../model/grid.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setItemInterior } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { fixed, run as makeRun } from '../../../test/builders.js';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import FaceProperties from './FaceProperties.jsx';
import InteriorFields from './InteriorFields.jsx';
import SlideSelect from './SlideSelect.jsx';
import { wallRollouts } from '../../model/rollouts.js';
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

});

describe('IN9 roll-out controls', () => {
  const base = (width = 24, type = 'door') => edit(() => {
    run().width = run().grid.cols[0].size = item().width = width;
    item().face = { type, size: null, ...(type === 'door' ? { hinge: 'left' } : {}) };
    state.settings.drawerSlideId = 'blum-562h';
  });
  const cards = () => nodes(render()).filter(({ props }) => props['aria-label']?.match(/^Roll-out r\.\d+$/));

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

});

