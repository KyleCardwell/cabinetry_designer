import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { pullPickOptions } from '../../model/pulls.js';
import elevationReducer, { setPullPick } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import SettingField from '../SettingField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import OverrideField from '../OverrideField.jsx';
import FaceProperties from '../properties/FaceProperties.jsx';
import PullPicks from '../properties/PullPicks.jsx';
import CabinetStyleProperties from '../properties/CabinetStyleProperties.jsx';
import RunProperties from '../properties/RunProperties.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: (value) => [value, vi.fn()], useEffect: vi.fn(), useMemo: (fn) => fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]);
const change = (select, value) => select.props.onChange({ target: { value } });
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid).find(({ id }) => id === 'c1');
const settings = () => effectiveSettings(state, room());
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const pick = (payload) => dispatch(setPullPick({ ...at, key: 'doorPullId', ...payload }));
const selectPulls = (node, levelsAbove = []) => PullPicks({ settings: settings(), node, levelsAbove, label: 'Cabinet', onChange: vi.fn() });
function setting(scope, settingKey = 'drawerPullId') {
  const tree = SettingField({ scope, settingKey });
  return tree.type === OverrideInput ? OverrideInput(tree.props) : tree;
}
function face() {
  const resolvedWall = resolveWall(room(), wall());
  const scene = runScene(room(), resolvedWall, run(), settings());
  return FaceProperties({ part: 'style', wall: resolvedWall, run: run(), item: item(),
    piece: scene.cells.pieces.find(({ id }) => id === 'c1'), layout: scene.result, cells: scene.cells, settings: settings() });
}

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ autoCount: false, width: 36,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, items: [auto('c1'), auto('c2')] }));
  state.facePath = 'r';
  state.layers = { project: { id: 1, values: {} }, phase: { id: 2, values: {} } };
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('HP3c step b pull pickers', () => {
  it('anchor 1: offers named team pulls in list order, then No pull, and stores the knob', () => {
    state.settings.pulls = [...state.settings.pulls, { ...state.settings.pulls[0], id: 'custom', name: 'Custom' }];
    const tree = setting('team', 'doorPullId');
    expect(options(tree)).toEqual([['pull-4', '4" pull'], ['knob-1-25', '1 1/4" knob'], ['custom', 'Custom'], ['none', 'No pull']]);
    change(find(tree, 'Door pull'), 'knob-1-25');
    expect(state.settings.doorPullId).toBe('knob-1-25');
  });

  it('anchor 2: shows room No pull as overridden and resets; all override scopes inherit by name', () => {
    for (const scope of ['project', 'phase', 'room']) {
      const label = `${scope[0].toUpperCase()}${scope.slice(1)} Drawer pull`;
      let tree = setting(scope);
      const select = () => find(tree.props.children('border-test'), label);
      expect(options(select())[0]).toEqual(['', 'Inherit (4" pull)']);
      change(select(), 'none');
      const own = () => scope === 'room' ? room().settingsOverrides : state.layers[scope].values;
      expect(own().drawerPullId).toBe('none');
      tree = setting(scope);
      expect(tree.props.overridden).toBe(true);
      expect(select().props.value).toBe('none');
      const reset = find(OverrideField(tree.props), 'Reset Drawer pull');
      reset.props.onClick();
      expect(own() ?? {}).not.toHaveProperty('drawerPullId');
    }
    state = structuredClone(state);
    state.layers.project.values = { drawerPullId: 'knob-1-25' };
    expect(setting('phase').props.inheritedText).toBe('1 1/4" knob');
  });

  it('anchor 3: inherits run doors separately from drawers and ignores unknown picks', () => {
    pick({ level: 'run', pullId: 'knob-1-25' });
    expect(run().doorPullId).toBe('knob-1-25');
    const tree = selectPulls(item(), [{ level: 'run', node: run() }, { level: 'wall', node: wall() }]);
    expect(options(find(tree, 'Cabinet door pull'))[0]).toEqual(['', 'Inherit (1 1/4" knob)']);
    expect(options(find(tree, 'Cabinet drawer pull'))[0]).toEqual(['', 'Inherit (4" pull)']);
    const before = state;
    pick({ level: 'run', pullId: 'zzz' });
    expect(state).toBe(before);
    pick({ level: 'run', pullId: 'none' });
    expect(pullPickOptions(settings(), 'door', [{ level: 'run', node: run() }], item(), 'doorPullId').inherit.text).toBe('Inherit (No pull)');
    const own = { doorPullId: 'knob-1-25' };
    expect(pullPickOptions(settings(), 'door', [], own, 'doorPullId').inherit.text).toBe('Inherit (4" pull)');
    expect(own.doorPullId).toBe('knob-1-25');
  });

  it('anchor 4: stores a door face pick, inherits drawers, and hides pulls on open, panel and groups', () => {
    pick({ level: 'run', pullId: 'knob-1-25' });
    change(find(face(), 'Pull'), 'pull-4');
    expect(item().face.pullId).toBe('pull-4');
    expect(find(face(), 'Pull').props.value).toBe('pull-4');
    change(find(face(), 'Pull'), '');
    expect(item().face).not.toHaveProperty('pullId');
    for (const type of ['drawer_front', 'pair_door', 'open', 'panel']) {
      state = structuredClone(state);
      item().face = { type, size: null };
      if (type === 'drawer_front') expect(options(find(face(), 'Pull'))[0]).toEqual(['', 'Inherit (4" pull)']);
      else if (type === 'pair_door') expect(find(face(), 'Pull')).toBeDefined();
      else expect(find(face(), 'Pull')).toBeUndefined();
    }
    state = structuredClone(state);
    item().face = { direction: 'vertical', size: null, children: [{ type: 'door', size: null }, { type: 'door', size: null }] };
    expect(find(face(), 'Pull')).toBeUndefined();
  });

  it('anchor 4b: false fronts default to no pull, allow a knob and clear the key on default', () => {
    item().face = { type: 'false_front', size: null };
    state.settings.drawerPullId = 'knob-1-25';
    expect(find(face(), 'Pull').props.value).toBe('');
    expect(options(find(face(), 'Pull'))).toEqual([['', 'No pull (default)'], ['pull-4', '4" pull'], ['knob-1-25', '1 1/4" knob']]);
    change(find(face(), 'Pull'), 'knob-1-25');
    expect(item().face.pullId).toBe('knob-1-25');
    change(find(face(), 'Pull'), '');
    expect(item().face).not.toHaveProperty('pullId');
  });

  it('anchor 5: keeps Missing (gone) selected and shows the fallback by name to inheriting cabinets', () => {
    run().doorPullId = 'gone';
    const tree = selectPulls(run());
    expect(find(tree, 'Cabinet door pull').props.value).toBe('gone');
    expect(options(find(tree, 'Cabinet door pull')).at(-1)).toEqual(['gone', 'Missing (gone)']);
    const levels = [{ level: 'run', node: run() }];
    expect(pullPickOptions(settings(), 'door', levels, item(), 'doorPullId').inherit).toEqual({ id: 'pull-4', text: 'Inherit (4" pull)' });
    for (const scope of ['team', 'project', 'phase', 'room']) {
      state = structuredClone(state);
      if (scope === 'team') state.settings.drawerPullId = 'gone';
      else if (scope === 'room') room().settingsOverrides = { drawerPullId: 'gone' };
      else state.layers[scope].values.drawerPullId = 'gone';
      const tree = setting(scope);
      const select = scope === 'team' ? find(tree, 'Drawer pull') : find(tree.props.children('border-test'), `${scope[0].toUpperCase()}${scope.slice(1)} Drawer pull`);
      expect(select.props.value).toBe('gone');
      expect(options(select).at(-1)).toEqual(['gone', 'Missing (gone)']);
    }
    state = structuredClone(state);
    item().face = { type: 'false_front', size: null, pullId: 'gone' };
    expect(options(find(face(), 'Pull')).at(-1)).toEqual(['gone', 'Missing (gone)']);
  });

  it('sets and clears wall/run/multiple cabinet picks, excludes panels, rejects bad input and respects read-only', () => {
    state = stateWithRun(makeRun({ autoCount: false, items: [auto('c1'), auto('c2'), { id: 'panel', kind: 'panel', width: 0.75 }] }));
    for (const level of ['wall', 'run', 'cabinet']) {
      const payload = { level, itemIds: ['c1', 'c2', 'panel'], key: 'drawerPullId', pullId: 'none' };
      pick(payload);
      const targets = () => level === 'wall' ? [wall()] : level === 'run' ? [run()] : gridLeaves(run().grid).filter(({ kind }) => kind === 'cabinet');
      expect(targets().every((node) => node.drawerPullId === 'none')).toBe(true);
      expect(gridLeaves(run().grid).find(({ id }) => id === 'panel')).not.toHaveProperty('drawerPullId');
      pick({ ...payload, pullId: null });
      expect(targets().every((node) => !Object.hasOwn(node, 'drawerPullId'))).toBe(true);
    }
    const before = state;
    for (const invalid of [{ key: 'pullId' }, { level: 'room' }, { wallId: 'absent' }, { runId: 'absent' }, { pullId: undefined }, { pullId: 3 }]) {
      pick({ level: 'run', pullId: 'none', ...invalid });
      expect(state).toBe(before);
    }
    state = { ...state, cloud: { room: { readOnly: true } } };
    const readOnly = state;
    pick({ level: 'run', pullId: 'none' });
    expect(state).toBe(readOnly);
    state = { ...state, cloud: null, source: 'version' };
    const version = state;
    pick({ level: 'wall', pullId: 'none' });
    expect(state).toBe(version);
  });

  it('renders Pulls without custom door styles and wires wall, run and cabinet callers to their targets', () => {
    const resolvedWall = resolveWall(room(), wall());
    const scene = runScene(room(), resolvedWall, run(), settings());
    const faceLayout = { style: {}, reveals: { values: {}, sources: {} } };
    const props = { room: room(), wall: resolvedWall, run: run(), item: item(), settings: settings(), layout: scene.result, faceLayout };
    for (const [Component, level] of [[WallHeightProperties, 'wall'], [RunProperties, 'run'], [CabinetStyleProperties, 'cabinet']]) {
      const panel = Component(props);
      const tree = level === 'run' ? panel.props.children('hardware') : panel;
      const picks = nodes(tree).find(({ type }) => type === PullPicks);
      expect(picks).toBeDefined();
      const section = PullPicks(picks.props);
      if (level === 'run') expect(section.props.title).toBe('Pulls');
      else expect(nodes(section).some(({ props }) => props.children === 'Pulls')).toBe(true);
      picks.props.onChange('doorPullId', 'none');
      expect(dispatch).toHaveBeenLastCalledWith(setPullPick({ roomId: room().id, level,
        wallId: wall().id, ...(level !== 'wall' ? { runId: run().id } : {}),
        ...(level === 'cabinet' ? { itemIds: ['c1'] } : {}), key: 'doorPullId', pullId: 'none' }));
    }
  });
});
