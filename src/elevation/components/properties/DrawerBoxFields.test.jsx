import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cabinetDrawerBoxesFor } from '../../model/drawerBoxes.js';
import { newAccessory } from '../../model/accessories.js';
import { gridLeaves } from '../../model/grid.js';
import { runScene } from '../../model/runScene.js';
import { BUILT_IN_SLIDES } from '../../model/slides.js';
import elevationReducer, { setFaceDrawerBox } from '../../store/elevationSlice.js';
import { fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import DrawerBoxFields from './DrawerBoxFields.jsx';
import FaceProperties from './FaceProperties.jsx';
import InteriorFields from './InteriorFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useMemo: (fn) => fn(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../model/drawerBoxes.js', async (original) => {
  const actual = await original();
  return { ...actual, cabinetDrawerBoxesFor: vi.fn(actual.cabinetDrawerBoxesFor) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.type?.name === 'SlideSelect'
    ? tree.type(tree.props) : tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const drawer = (size = null) => ({ type: 'drawer_front', size });
const accessory = (id, name, effects = [], minOpening = {}) => ({
  ...newAccessory([], id), name, attachesTo: 'drawer_box', effects,
  minOpening: { width: null, depth: null, height: null, ...minOpening },
});
const accessories = [
  accessory('CU', 'Charging unit', [{ kind: 'clear_behind', inches: 2 }]),
  accessory('KN', 'Knife insert', [{ kind: 'max_height', inches: 4.25 }], { width: 15, depth: 18 }),
  accessory('SP', 'Spice insert', [{ kind: 'fixed_height', inches: 3.25 }]),
  accessory('PO', 'Pot organizer', [{ kind: 'slide', slideId: 'accuride-4034' }, { kind: 'probox_note', text: '1/2" bottom' }]),
  accessory('OS', 'Outlet strip', [{ kind: 'max_depth', inches: 15 }]),
  { ...newAccessory([], 'Susan'), name: 'Lazy susan 28' },
];
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid)[0];
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
const render = (overrides = {}) => DrawerBoxFields({ room: room(), wall: wall(), run: run(),
  item: item(), settings: state.settings, ...overrides });
const field = (label, tree = render()) => nodes(tree).find(({ type, props }) =>
  (type === 'select' || type === 'div' || type === 'input' || type === InchInput) && props['aria-label'] === label);
const commit = (label, value) => field(label).props.onCommit(value);

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ width: 18, autoCount: false, items: [fixed('c1', 18)],
    ends: { left: { type: 'none' }, right: { type: 'none' } } }));
  state.settings = { ...state.settings, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h', accessories, runFlex: 0 ,
    // These fixtures type a 1/8" top reveal; keep the standard fronts at 5 7/8 (IN7.2).
    stoneTopReveal: 0.125 };
  item().face = { direction: 'vertical', size: null, children: [drawer(5.875), drawer(), drawer()] };
  item().reveals = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };
  state.facePath = 'r.1';
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('Drawer boxes section (IN5)', () => {
  it('parses 3 5/8 in Height and clears it back to auto', () => {
    let typed = '3 5/8';
    useState.mockImplementation(() => [typed, vi.fn()]);
    InchInput(field('Drawer height r.0').props).props.onBlur();
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { height: 3.625 } }));
    expect(field('Drawer height r.0').props.value).toBe(3.625);
    typed = '';
    InchInput(field('Drawer height r.0').props).props.onBlur();
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { height: null } }));
    expect(field('Drawer height r.0').props).toMatchObject({ value: undefined, allowBlank: true, placeholder: 'Auto (4 1/4")' });
    for (const value of [0, -1, Infinity, NaN]) expect(commit('Drawer height r.0', value)).toBe(false);
  });

});

