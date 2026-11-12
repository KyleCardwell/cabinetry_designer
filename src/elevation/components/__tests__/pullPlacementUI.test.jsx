import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { runPulls } from '../../model/pullLayouts.js';
import elevationReducer, { setCabinetPullHeight } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
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
  useRef: () => ({ current: null }),
}));
vi.mock('../panel/usePanelState.js', () => ({ default: () => [true, vi.fn()] }));
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
const face = () => FaceProperties({ ...props(), part: 'style' });
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

});
