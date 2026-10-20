import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { runPulls } from '../../model/pullLayouts.js';
import elevationReducer, { setCabinetPullHeight } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import ProjectSettingsPanel from '../../../projects/ProjectSettingsPanel.jsx';
import InchInput from '../InchInput.jsx';
import RoomSettingsPanel from '../RoomSettingsPanel.jsx';
import SettingsPanel from '../SettingsPanel.jsx';
import FaceProperties from '../properties/FaceProperties.jsx';
import CabinetStyleProperties from '../properties/CabinetStyleProperties.jsx';
import PullPicks from '../properties/PullPicks.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  // Open the settings panels and Pulls group; leave InchInput as a component
  // so commits exercise its real UI callback and the real Redux reducer.
  useState: (value) => [typeof value === 'boolean' ? true
    : typeof value === 'function' ? value()
    : value && typeof value === 'object' ? { ...value, pulls: true } : value, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', () => ({ Link: 'a' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, text(props.children)]);
const change = (tree, label, value) => find(tree, label).props.onChange({ target: { value } });
const expand = (tree) => Array.isArray(tree) ? tree.map(expand)
  : !tree || typeof tree !== 'object' ? tree
    : typeof tree.type === 'function' && tree.type !== InchInput ? expand(tree.type(tree.props))
      : { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid).find(({ id }) => id === 'c1');
const settings = () => effectiveSettings(state, room());
function props() {
  const resolvedWall = resolveWall(room(), wall());
  const scene = runScene(room(), resolvedWall, run(), settings());
  return { room: room(), wall: resolvedWall, run: run(), item: item(), settings: settings(),
    piece: scene.cells.pieces.find(({ id }) => id === 'c1'), layout: scene.result, cells: scene.cells,
    faceLayout: scene.faceLayouts.get('c1') };
}
const face = () => FaceProperties(props());
const cabinet = (itemIds) => {
  const tree = CabinetStyleProperties({ ...props(), ...(itemIds ? { itemIds } : {}) });
  return PullPicks(nodes(tree).find(({ type }) => type === PullPicks).props);
};
const edit = (fn) => { state = structuredClone(state); fn(); };

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ autoCount: false, width: 36,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, items: [auto('c1'), auto('c2')] }));
  item().face = { type: 'door', size: null, hinge: 'left' };
  state.facePath = 'r';
  state.layers = { project: { id: 1, values: {} }, phase: { id: 2, values: {} } };
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('HP4 step c pull placement pickers', () => {
  it('anchor 1: shows the base door auto placement and direction without a count picker', () => {
    expect(options(find(face(), 'Pull position'))).toEqual([
      ['', 'Auto (Top corner)'], ['top-corner', 'Top corner'], ['bottom-corner', 'Bottom corner'],
      ['height', 'Tall pull height'], ['center', 'Centred'], ['top-rail', 'On top rail'], ['bottom-rail', 'On bottom rail'],
    ]);
    expect(options(find(face(), 'Pull direction'))).toEqual([
      ['', 'Auto (Vertical)'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal'],
    ]);
    expect(find(face(), 'Pulls across')).toBeUndefined();
  });

  it('anchor 2: stores position and direction, removes both on Auto, and skips unchanged commits', () => {
    for (const type of ['door', 'pair_door']) {
      edit(() => { item().face = { type, size: null, hinge: 'left' }; });
      change(face(), 'Pull position', 'center');
      change(face(), 'Pull direction', 'horizontal');
      expect(item().face).toMatchObject({ pullAt: 'center', pullOrientation: 'horizontal' });
      expect(find(face(), 'Pull position').props.value).toBe('center');
      expect(find(face(), 'Pull direction').props.value).toBe('horizontal');
      expect(options(find(face(), 'Pull position'))[0]).toEqual(['', 'Auto (Top corner)']);
      expect(options(find(face(), 'Pull direction'))[0]).toEqual(['', 'Auto (Vertical)']);
      const placements = runPulls(room(), props().wall, run(), settings()).pulls.filter(({ pieceId }) => pieceId === 'c1');
      expect(placements).toHaveLength(type === 'pair_door' ? 2 : 1);
      expect(placements.every(({ at, orientation }) => at === 'center' && orientation === 'horizontal')).toBe(true);
      dispatch.mockClear();
      change(face(), 'Pull position', 'center');
      change(face(), 'Pull direction', 'horizontal');
      expect(dispatch).not.toHaveBeenCalled();
      change(face(), 'Pull position', '');
      change(face(), 'Pull direction', '');
      expect(item().face).not.toHaveProperty('pullAt');
      expect(item().face).not.toHaveProperty('pullOrientation');
    }
  });

  it('anchor 3: offers only drawer positions, stores 2–4 pulls across, and removes the count on 1', () => {
    for (const type of ['drawer_front', 'false_front']) {
      edit(() => { item().face = { type, size: null, pullId: 'pull-4' }; });
      expect(options(find(face(), 'Pull position'))).toEqual([
        ['', 'Auto (Centred)'], ['center', 'Centred'], ['top-rail', 'On top rail'],
      ]);
      expect(options(find(face(), 'Pull direction'))[0]).toEqual(['', 'Auto (Horizontal)']);
      expect(options(find(face(), 'Pulls across'))).toEqual([[1, '1'], [2, '2'], [3, '3'], [4, '4']]);
      for (const count of [2, 3, 4]) {
        change(face(), 'Pulls across', String(count));
        expect(item().face.pullCount).toBe(count);
      }
      change(face(), 'Pulls across', '1');
      expect(item().face).not.toHaveProperty('pullCount');
    }
  });

  it('anchor 4: sets cabinet height 42, shows the tall auto choice, clears to inherited 45 and supports itemIds', () => {
    // This door extends across both candidate heights, 42 and 45 inches.
    run().height = 50;
    const input = () => find(cabinet(), 'Tall pull height');
    expect(input().type).toBe(InchInput);
    expect(input().props).toMatchObject({ value: null, allowBlank: true, placeholder: 'Inherit (45")' });
    input().props.onCommit(42);
    expect(dispatch).toHaveBeenLastCalledWith(setCabinetPullHeight({ wallId: 'wall-1', runId: 'run-1', itemIds: ['c1'], value: 42 }));
    expect(item().pullHeight).toBe(42);
    expect(input().props.value).toBe(42);
    expect(options(find(face(), 'Pull position'))[0]).toEqual(['', 'Auto (Tall pull height)']);
    expect(runPulls(room(), props().wall, run(), settings()).pulls.find(({ pieceId }) => pieceId === 'c1').centers[0].z).toBe(42);
    input().props.onCommit(null);
    expect(item()).not.toHaveProperty('pullHeight');
    expect(input().props.placeholder).toBe('Inherit (45")');
    for (const invalid of [0, -1, Infinity, NaN]) expect(input().props.onCommit(invalid)).toBe(false);
    expect(item()).not.toHaveProperty('pullHeight');
    find(cabinet(['c1', 'c2']), 'Tall pull height').props.onCommit(42);
    expect(gridLeaves(run().grid).every(({ pullHeight }) => pullHeight === 42)).toBe(true);
    edit(() => { room().settingsOverrides = { pullHeight: 48 }; });
    find(cabinet(['c1', 'c2']), 'Tall pull height').props.onCommit(null);
    expect(input().props.placeholder).toBe('Inherit (48")');
    expect(find(PullPicks({ settings: settings(), levelsAbove: [], node: run(), label: 'Run' }), 'Tall pull height')).toBeUndefined();
    expect(find(PullPicks({ settings: settings(), levelsAbove: [], node: wall(), label: 'Wall' }), 'Tall pull height')).toBeUndefined();
  });

  it('anchor 5: explains missing hinges, hides placement for No pull, and hides direction for knobs', () => {
    // Sliding keeps the hinge blank; swing doors acquire an automatic side.
    item().face = { type: 'door', size: null, action: 'sliding' };
    expect(options(find(face(), 'Pull position'))[0]).toEqual(['', 'Auto (needs hinge)']);
    expect(text(face())).toContain('Set a hinge side (or pick a centred or rail pull position) so this door\'s pull can be placed.');
    change(face(), 'Pull position', 'center');
    expect(text(face())).not.toContain('Set a hinge side');
    change(face(), 'Pull direction', 'horizontal');
    change(face(), 'Pull', 'none');
    expect(find(face(), 'Pull position')).toBeUndefined();
    expect(find(face(), 'Pull direction')).toBeUndefined();
    expect(item().face).toMatchObject({ pullAt: 'center', pullOrientation: 'horizontal' });
    change(face(), 'Pull', 'knob-1-25');
    expect(find(face(), 'Pull position')).toBeDefined();
    expect(find(face(), 'Pull direction')).toBeUndefined();
  });

  it('anchor 6: renders Tall door pull height in all four Pulls settings panels and resets room 48', () => {
    for (const [scope, Component, componentProps] of [
      ['team', SettingsPanel, {}], ['project', ProjectSettingsPanel, { level: 'project' }],
      ['phase', ProjectSettingsPanel, { level: 'phase' }], ['room', RoomSettingsPanel, {}],
    ]) {
      const render = () => expand(<Component {...componentProps} />);
      const label = scope === 'team' ? 'Tall door pull height' : `${scope[0].toUpperCase()}${scope.slice(1)} Tall door pull height`;
      const pulls = () => nodes(render()).find(({ type, props }) => type === 'section'
        && nodes(props.children).some(({ type, props }) => type === 'button' && text(props.children).startsWith('Pulls'))
        && find({ props }, label));
      expect(find(pulls(), label)?.type).toBe(InchInput);
      find(pulls(), label).props.onCommit(48);
      const own = () => scope === 'team' ? state.settings : scope === 'room' ? room().settingsOverrides : state.layers[scope].values;
      expect(own().pullHeight).toBe(48);
      if (scope !== 'team') {
        find(render(), 'Reset Tall door pull height').props.onClick();
        expect(own() ?? {}).not.toHaveProperty('pullHeight');
      }
    }
  });

  it('labels tab edges only inside Auto and uses horizontal rail defaults for top, bottom and pullout doors', () => {
    for (const [patch, label] of [[{ hinge: 'top' }, 'On bottom rail'], [{ hinge: 'bottom' }, 'On top rail'], [{ action: 'pullout' }, 'On top rail']]) {
      edit(() => { item().face = { type: 'door', size: null, ...patch }; });
      expect(options(find(face(), 'Pull position'))[0]).toEqual(['', `Auto (${label})`]);
      expect(options(find(face(), 'Pull direction'))[0]).toEqual(['', 'Auto (Horizontal)']);
    }
    edit(() => {
      state.settings.pulls.push({ id: 'tab', name: 'Tab', kind: 'tab', length: 3, height: 0.5, projection: 1, hardwarePullId: null, price: null, actualCost: null, labor: {} });
      item().face = { type: 'door', size: null, hinge: 'left', pullId: 'tab' };
    });
    expect(options(find(face(), 'Pull position'))[0]).toEqual(['', 'Auto (Top edge)']);
    expect(find(face(), 'Pull direction')).toBeUndefined();
    edit(() => { run().z = 54; });
    expect(options(find(face(), 'Pull position'))[0]).toEqual(['', 'Auto (Bottom edge)']);
    expect(options(find(face(), 'Pull position')).slice(1).some(([at]) => at.endsWith('edge'))).toBe(false);
  });

  it('shows too-long warnings only for the selected piece and face path', () => {
    item().face = { direction: 'vertical', size: null, children: [
      { type: 'drawer_front', size: null, pullCount: 4 },
      { type: 'drawer_front', size: null },
    ] };
    state.facePath = 'r.0';
    expect(text(face())).toContain('This pull is longer than the space it sits in on this face.');
    state.facePath = 'r.1';
    expect(text(face())).not.toContain('This pull is longer');
    edit(() => {
      gridLeaves(run().grid).find(({ id }) => id === 'c2').face = { type: 'drawer_front', size: null, pullCount: 4 };
      item().face = { type: 'drawer_front', size: null };
      state.facePath = 'r';
    });
    expect(text(face())).not.toContain('This pull is longer');
  });
});
