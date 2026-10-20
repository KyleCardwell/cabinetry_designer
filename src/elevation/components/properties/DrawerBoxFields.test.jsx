import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cabinetDrawerBoxesFor } from '../../model/drawerBoxes.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { BUILT_IN_SLIDES } from '../../model/slides.js';
import elevationReducer, { setCabinetSlide, setFaceDrawerBox } from '../../store/elevationSlice.js';
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
const options = (field) => nodes(field).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, text(props.children)]);
const drawer = (size = null) => ({ type: 'drawer_front', size });
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid)[0];
const edit = (fn) => { state = structuredClone(state); fn(); };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
const render = (overrides = {}) => DrawerBoxFields({ room: room(), wall: wall(), run: run(),
  item: item(), settings: state.settings, ...overrides });
const field = (label, tree = render()) => nodes(tree).find(({ type, props }) =>
  (type === 'select' || type === 'div' || type === 'input' || type === InchInput) && props['aria-label'] === label);
const change = (label, value, overrides) => field(label, render(overrides)).props.onChange({ target: { value } });
const commit = (label, value) => field(label).props.onCommit(value);
const placeholders = (kind) => nodes(render()).filter(({ type, props }) => type === InchInput
  && props['aria-label'].startsWith(`Drawer ${kind}`)).map(({ props }) => props.placeholder);

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ width: 18, autoCount: false, items: [fixed('c1', 18)],
    ends: { left: { type: 'none' }, right: { type: 'none' } } }));
  state.settings = { ...state.settings, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h', runFlex: 0 ,
    // These fixtures type a 1/8" top reveal; keep the standard fronts at 5 7/8 (IN7.2).
    stoneTopReveal: 0.125 };
  item().face = { direction: 'vertical', size: null, children: [drawer(5.875), drawer(), drawer()] };
  item().reveals = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };
  state.facePath = 'r.1';
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN6 Drawer boxes rules and pull-outs', () => {
  const pullout = () => ({ type: 'door', action: 'pullout', size: null });
  const panel = () => {
    const view = resolveWall(room(), wall());
    const scene = runScene(room(), view, run(), state.settings);
    return FaceProperties({ wall: view, run: run(), item: item(),
      piece: scene.cells.pieces[0], layout: scene.result, cells: scene.cells, settings: state.settings });
  };

  it('anchor 1: names file slide and height rules and restores them after clearing overrides', () => {
    edit(() => { item().purpose = 'file'; item().face.children = [drawer(5.875), drawer()]; });
    expect(options(field('Drawer slide r.1'))[0]).toEqual(['', 'Auto (Accuride 3832, DRW-003)']);
    expect(placeholders('height')[1]).toBe('Auto (10 1/4", DRW-003)');
    expect(placeholders('depth')[1]).toBe('Auto (22")');
    change('Drawer slide r.1', 'blum-562h');
    commit('Drawer height r.1', 9.25);
    expect(field('Drawer height r.1').props.value).toBe(9.25);
    expect(field('Drawer slide r.1').props.value).toBe('blum-562h');
    commit('Drawer height r.1', null);
    change('Drawer slide r.1', '');
    expect(placeholders('height')[1]).toBe('Auto (10 1/4", DRW-003)');
    expect(options(field('Drawer slide r.1'))[0]).toEqual(['', 'Auto (Accuride 3832, DRW-003)']);
    edit(() => { delete item().purpose; run().depth = 12; });
    expect(options(field('Drawer slide r.1'))[0]).toEqual(['', 'Auto (Accuride 3832, DRW-002)']);
  });

  it('anchor 2: shows sink rule depths, box notes and the cabinet note at the end', () => {
    edit(() => { item().purpose = 'sink'; item().box = { top: 'spreaders' }; });
    expect(placeholders('depth')).toEqual(Array(3).fill('Auto (18", DRW-006)'));
    for (const path of ['r.0', 'r.1', 'r.2']) {
      expect(text(field(`Drawer box ${path}`))).toContain('notch drw around plumbing');
    }
    expect(nodes(render()).filter(({ type }) => type === 'p').map(text).at(-1))
      .toBe('notch drw around plumbing (DRW-006)');
    commit('Drawer depth r.0', 20);
    expect(field('Drawer depth r.0').props.value).toBe(20);
    expect(text(field('Drawer box r.0'))).toContain('notch drw around plumbing');
    commit('Drawer depth r.0', null);
    expect(placeholders('depth')[0]).toBe('Auto (18", DRW-006)');
    edit(() => { run().width = 42; run().grid.cols[0].size = 42; });
    expect(nodes(render()).filter(({ type }) => type === 'p').map(text).slice(-2))
      .toEqual(['notch drw around plumbing (DRW-006)', 'drawer stabilizers (BOX-007)']);
  });

  it('IN12c d: keeps Charging visible until step e without a resolved charging field', () => {
    expect(field('Charging r.0').props.checked).toBeUndefined();
    field('Charging r.0').props.onChange({ target: { checked: true } });
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { charging: true } }));
    expect(field('Charging r.0').props.checked).toBeUndefined();
    expect(item().face.children[0]).not.toHaveProperty('drawerBox');
    expect(placeholders('depth')[0]).toBe('Auto (21")');
    field('Charging r.0').props.onChange({ target: { checked: false } });
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { charging: null } }));
    expect(item().face.children[0].drawerBox).toBeUndefined();
    expect(placeholders('depth')[0]).toBe('Auto (21")');
  });

  it('anchor 4: shows ROT rows, rule dimensions and notes, including a pull-out-only cabinet', () => {
    edit(() => { item().purpose = 'trash'; item().face.children = [drawer(5.875), pullout()]; });
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text))
      .toEqual(['Front 5 7/8"', 'ROT · front 24 1/4"']);
    expect(placeholders('height')[1]).toBe('Auto (15 1/8", DRW-009)');
    expect(placeholders('depth')[1]).toBe('Auto (22", DRW-009)');
    expect(text(field('Drawer box r.1'))).toContain('bottom up 1 3/4"');
    expect(field('Charging r.0')).toBeDefined();
    expect(field('Charging r.1')).toBeUndefined();
    edit(() => { item().face = pullout(); });
    expect(nodes(panel()).some(({ type }) => type === DrawerBoxFields)).toBe(true);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text)).toEqual(['ROT · front 30 1/4"']);
    expect(field('Charging r')).toBeUndefined();
    commit('Drawer height r', 12.125);
    commit('Drawer depth r', 21);
    expect(field('Drawer height r').props.value).toBe(12.125);
    expect(field('Drawer depth r').props.value).toBe(21);
    expect(text(render())).not.toContain('bottom up 1 3/4"');
    commit('Drawer height r', null);
    commit('Drawer depth r', null);
    expect(placeholders('height')).toEqual(['Auto (15 1/8", DRW-009)']);
    expect(placeholders('depth')).toEqual(['Auto (22", DRW-009)']);
  });

  it('shows hamper rows and ROT warning messages with the resolved measurements', () => {
    edit(() => { item().purpose = 'hamper'; item().face = pullout(); });
    expect(nodes(panel()).some(({ type }) => type === DrawerBoxFields)).toBe(true);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text)).toEqual(['Hamper · front 30 1/4"']);
    expect(placeholders('height')).toEqual(['Auto (6 1/4", DRW-010)']);
    expect(field('Charging r')).toBeUndefined();
    expect(text(render())).toContain('A hamper box needs at least 15 × 22 (this one is 16" × 21").');
    edit(() => { item().face = { direction: 'vertical', size: null, children: [drawer(5.875), drawer(9), pullout()] }; });
    expect(text(render())).toContain('A hamper needs 11 clear below the box (8 1/16" here).');
    edit(() => { item().purpose = 'trash'; });
    expect(text(render())).toContain('ROT · front 15 1/8": Shorter than the standard 15 1/8 ROT (13 3/4" available).');
    edit(() => { item().face = pullout(); run().depth = 21; });
    expect(text(render())).toContain('No ROT depth rule for a 18" × 21" box; sized like a drawer.');
  });
});

describe('IN5 Drawer boxes section', () => {
  it('anchor 1: shows the three ordered fronts, matched heights, widths and depths after Interior', () => {
    expect(options(field('Cabinet drawer slide'))).toEqual([
      ['', 'Inherit (Blum Tandem 562H)'], ...BUILT_IN_SLIDES.map(({ id, name }) => [id, name]),
    ]);
    expect(nodes(render()).filter(({ type }) => type === 'h4').map(text))
      .toEqual(['Front 5 7/8"', 'Front 12 1/16"', 'Front 12 1/16"']);
    expect(placeholders('height')).toEqual(['Auto (4 1/4")', 'Auto (10 1/4", matched)', 'Auto (10 1/4")']);
    expect(placeholders('depth')).toEqual(Array(3).fill('Auto (21")'));
    for (const path of ['r.0', 'r.1', 'r.2']) {
      expect(text(field(`Drawer width ${path}`))).toBe('16"');
      expect(field(`Drawer height ${path}`).props.value).toBeUndefined();
      expect(field(`Drawer box ${path}`).props.className.includes('border-blue-500')).toBe(path === 'r.1');
      expect(options(field(`Drawer slide ${path}`))[0]).toEqual(['', 'Auto (Blum Tandem 562H)']);
    }
    const view = resolveWall(room(), wall());
    const scene = runScene(room(), view, run(), state.settings);
    const children = FaceProperties({ wall: view, run: run(), item: item(), itemIds: ['c1', 'c2'],
      piece: scene.cells.pieces[0], layout: scene.result, cells: scene.cells, settings: state.settings }).props.children;
    const index = children.findIndex(({ type } = {}) => type === InteriorFields);
    expect(children[index + 1].type).toBe(DrawerBoxFields);
    expect(children[index + 1].props).toMatchObject({ room: room(), wall: view, run: run(),
      item: item(), itemIds: ['c1', 'c2'], settings: state.settings });
  });

  it('anchor 2: picks and clears the cabinet slide, resizes boxes, and accepts panel multi-select targets', () => {
    change('Cabinet drawer slide', 'accuride-3832');
    expect(dispatch).toHaveBeenLastCalledWith(setCabinetSlide({ ...at, itemIds: ['c1'], slideId: 'accuride-3832' }));
    for (const path of ['r.0', 'r.1', 'r.2']) expect(text(field(`Drawer width ${path}`))).toBe('15 1/2"');
    expect(placeholders('depth')).toEqual(Array(3).fill('Auto (22")'));
    change('Cabinet drawer slide', '', { itemIds: ['c1', 'c2'] });
    expect(dispatch).toHaveBeenLastCalledWith(setCabinetSlide({ ...at, itemIds: ['c1', 'c2'], slideId: null }));
    expect(field('Cabinet drawer slide').props.value).toBe('');
  });

  it('anchor 3: parses 3 5/8 in Height and clears it back to auto', () => {
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

  it('anchor 4: hides the section for a cabinet containing only doors or false fronts', () => {
    for (const type of ['door', 'pair_door', 'false_front', 'panel', 'open']) {
      edit(() => { item().face = { type, size: null }; });
      expect(render()).toBeNull();
      const view = resolveWall(room(), wall());
      const scene = runScene(room(), view, run(), state.settings);
      const panel = FaceProperties({ wall: view, run: run(), item: item(),
        piece: scene.cells.pieces[0], layout: scene.result, cells: scene.cells, settings: state.settings });
      expect(nodes(panel).some(({ type }) => type === DrawerBoxFields)).toBe(false);
    }
  });

  it('edits box slides and depths, retains missing picks, and marks maple widths', () => {
    change('Drawer slide r.0', 'accuride-3832');
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { slideId: 'accuride-3832' } }));
    expect(text(field('Drawer width r.0'))).toBe('15 1/2"');
    commit('Drawer depth r.0', 24);
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { depth: 24 } }));
    expect(text(render())).toContain('Front 5 7/8": Deeper than the interior (23").');
    commit('Drawer depth r.0', null);
    change('Drawer slide r.0', '');
    expect(dispatch).toHaveBeenLastCalledWith(setFaceDrawerBox({ ...at, itemId: 'c1', path: 'r.0', patch: { slideId: null } }));
    edit(() => {
      item().drawerSlideId = 'gone-cabinet';
      item().face.children[0].drawerBox = { slideId: 'gone-box' };
      room().reportParts = { c1: { boxes: 'Pre-finished maple' } };
    });
    for (const [label, id] of [['Cabinet drawer slide', 'gone-cabinet'], ['Drawer slide r.0', 'gone-box']]) {
      expect(field(label).props.value).toBe(id);
      expect(options(field(label))).toContainEqual([id, `Missing (${id})`]);
    }
    expect(text(render())).toContain("Front 5 7/8\": A slide picked here isn't in the Library any more; using Blum Tandem 562H.");
    expect(text(field('Drawer width r.0'))).toBe('16 1/16" +1/16 maple');
  });

  it('shows no-fit placeholders and all sizing warnings with front labels', () => {
    edit(() => {
      item().face = { direction: 'vertical', size: null, children: [drawer(2), { type: 'door', size: null }] };
      run().depth = 8;
    });
    expect(placeholders('height')).toEqual(['Auto (none fits)']);
    expect(placeholders('depth')).toEqual(['Auto (no length fits)']);
    expect(text(render())).toContain('No drawer box fits this front (needs 3 1/16").');
    expect(text(render())).toContain('No Blum Tandem 562H length fits 7" of depth.');
    edit(() => {
      item().face = { direction: 'horizontal', size: null, children: [drawer(), drawer()] };
      run().depth = 24;
      item().face.children[0].drawerBox = { height: 40 };
      item().face.children[1].drawerBox = { height: 3.625 };
    });
    expect(text(render())).toContain('Front 30 1/4": Side-by-side drawers need a partition between them.');
    expect(text(render())).toContain('This box is taller than the space (28 3/16" available).');
    expect(text(render())).toContain('Same-height fronts have different typed box heights.');
    expect(text(render())).toContain('Taller than 15 1/8", the tallest the shop normally builds.');
  });

  it('labels fronts outside the interior and resolves back views from the source wall', () => {
    edit(() => {
      item().face = { direction: 'vertical', size: null, children: [drawer(0.25), { type: 'door', size: null }] };
    });
    const view = resolveWall(room(), wall());
    const faceLayout = runScene(room(), view, run(), state.settings).faceLayouts.get('c1');
    expect(text(render({ wall: view, faceLayout }))).toContain("Front 1/4\": This drawer front isn't over the cabinet's interior.");
    expect(cabinetDrawerBoxesFor).toHaveBeenLastCalledWith(room(), wall(), 'front', state.settings, 'c1');
    edit(() => { run().wallSide = 'back'; item().face = drawer(); });
    const back = resolveWall(room(), wall(), 'back');
    expect(render({ wall: back, run: back.runs[0] })).not.toBeNull();
    expect(cabinetDrawerBoxesFor).toHaveBeenLastCalledWith(room(), wall(), 'back', state.settings, 'c1');
    expect(render()).toBeNull();
  });
});
