import SettingGroups from '../SettingGroups.jsx';
import ProjectSettingsPanel from '../../../projects/ProjectSettingsPanel.jsx';
import { BAND_SETTING_KEYS } from '../../model/heightBands.js';
import { groupsFor } from '../../model/settingGroups.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState, setActiveRoom, setRoomSetting, setSetting } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import SettingsPanel from '../SettingsPanel.jsx';
import SettingsDrawer from '../SettingsDrawer.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: () => ({ current: null }) }));
vi.mock('../panel/usePanelState.js', () => ({ default: function usePanelStateMock(key, initial) { return useState(key === 'settingsDrawer' ? true : initial); } }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', () => ({ Link: 'a' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const header = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button'
  && ([props.children].flat().includes(label) || nodes(props.children).some(({ props }) => props.children === label)));
const section = (tree, label) => nodes(tree).find(({ type, props }) => type === 'section'
  && header([props.children].flat()[0], label));
const controls = (tree) => nodes(tree).filter(({ type }) => type === 'input' || type === 'select');
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]);
let state;
let dispatch;
let hooks;
let currentHooks;
let hookIndex;
let effects;
let dirty;

// Keep hook state per component while walking the JSX, including InchInput's
// draft text and effects. This exercises blur/reset and room switches together
// with the real Redux reducer without requiring a browser DOM.
function render(Component = SettingsPanel, props = {}) {
  let result;
  do {
    dirty = false;
    effects = [];
    const mounted = new Set();
    const walk = (element, path) => {
      if (Array.isArray(element)) return element.map((child, index) => walk(child, `${path}/${child?.key ?? index}`));
      if (!element || typeof element !== 'object') return element;
      if (typeof element.type === 'function') {
        const id = `${path}/${element.type.name}`;
        mounted.add(id);
        if (!hooks.has(id)) hooks.set(id, []);
        currentHooks = hooks.get(id);
        hookIndex = 0;
        return walk(element.type(element.props), id);
      }
      return { ...element, props: { ...element.props, children: walk(element.props.children, `${path}/children`) } };
    };
    result = walk({ type: Component, props }, 'root');
    for (const id of hooks.keys()) if (!mounted.has(id)) hooks.delete(id);
    effects.forEach((effect) => effect());
  } while (dirty);
  return result;
}

function openGroup(label, Component = SettingsPanel, sectionLabel = 'Settings') {
  const root = sectionLabel === 'Room settings' ? section(render(Component), sectionLabel) : render(Component);
  const button = header(root, label);
  if (!button.props['aria-expanded']) button.props.onClick();
  return render(Component);
}

function commit(label, value, Component = SettingsPanel) {
  field(render(Component), label).props.onChange({ target: { value } });
  field(render(Component), label).props.onBlur();
  return render(Component);
}

function Panels() {
  return [<SettingsPanel key="shop" />, <SettingsDrawer key="room" shopStandards={false} />];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  state = createInitialElevationState(null);
  state.settings.defaultInteriorFillerWidth = 3;
  state.settings.defaultEnds.left = 'filler';
  state.rooms = [state.rooms[0], { ...cloneRoom(state.rooms[0]), id: 'room-b' }];
  for (const room of state.rooms) delete room.settingsOverrides;
  state.activeRoomId = state.rooms[0].id;
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  hooks = new Map();
  useState.mockImplementation((initial) => {
    const slots = currentHooks;
    const index = hookIndex++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, (next) => {
      const value = typeof next === 'function' ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) dirty = true;
      slots[index].value = value;
    }];
  });
  useEffect.mockImplementation((effect, deps) => {
    const index = hookIndex++;
    const previous = currentHooks[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      currentHooks[index] = { deps };
      effects.push(effect);
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('DB2 f shop settings panel', () => {
  it('anchor 1: starts twelve groups collapsed and retains the note, view controls and height profile', () => {
    const initial = state;
    expect(header(render(), 'Settings')).toBeUndefined();
    const tree = render();
    const groups = [
      ['Cabinets & depths', 11], ['Runs & ends', 9], ['Fillers & corners', 11],
      ['Reveals', 9], ['Inset face frame', 6], ['Bases, tops & bands', 7],
      ['Walls', 1], ['Openings & soffits', 14], ['Pulls', 7], ['Drawer boxes', 17], ['Shelves', 9], ['Reports', 13],
    ];
    const collapsed = nodes(tree).filter(({ type, props }) => type === 'button' && props['aria-expanded'] === false);
    expect(collapsed.map(text)).toEqual(groups.map(([label]) => `${label}+`));
    expect(text(tree)).toContain('Door thickness is on the team door style');
    expect(nodes(tree).find(({ type, props }) => type === 'a' && props.to === '/library/door-style')).toBeDefined();
    expect(text(tree)).toContain('View (not saved)');
    expect(text(tree)).toContain('Default height profile');
    for (const label of ['Drawing scale', 'PDF paper', 'Orthogonal plan walls', 'Plan grid', 'Opening snap', 'Corner snap distance', 'Default Wall height', 'Default Base', 'Default Crown profile']) {
      expect(field(tree, label)).toBeDefined();
    }
    const unchangedControls = controls(tree).length;
    for (const [label, count] of groups) {
      expect(controls(openGroup(label))).toHaveLength(unchangedControls + count);
      header(render(), label).props.onClick();
    }
    expect(state).toBe(initial);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('anchor 2: opens nine plain reveal inputs without overrides, resets or inherit choices', () => {
    const tree = openGroup('Reveals');
    const group = section(tree, 'Reveals');
    expect(controls(group)).toHaveLength(9);
    for (const control of controls(group)) {
      expect(control.type).toBe('input');
      expect(control.props.type).toBe('text');
      expect(control.props.className).toContain('border-gray-600');
      expect(control.props.className).not.toContain('teal');
      expect(control.props.placeholder).toBeUndefined();
    }
    expect(text(group)).not.toMatch(/Reset|Inherit|overridden/);
    expect(nodes(group).filter(({ type }) => type === 'option')).toHaveLength(0);
  });

  it('anchor 3: changes inset stile to 1 and preserves rail 1.5 and every other leaf', () => {
    openGroup('Inset face frame');
    const previous = { ...state.settings.insetFrame };
    expect(previous.rail).toBe(1.5);
    const tree = commit('Inset frame stile', '1');
    expect(state.settings.insetFrame).toEqual({ ...previous, stile: 1, rail: 1.5 });
    expect(field(tree, 'Inset frame stile').props.value).toBe('1');
    expect(dispatch).toHaveBeenLastCalledWith(setSetting({ key: 'insetFrame.stile', value: 1 }));
  });

  it('anchor 4: opens fourteen opening fields including shop-only defaults and a casing checkbox', () => {
    const tree = openGroup('Openings & soffits');
    const group = section(tree, 'Openings & soffits');
    expect(controls(group)).toHaveLength(14);
    for (const label of ['Door width', 'Door height', 'Window width', 'Window height', 'Window sill height', 'Door panel thickness', 'Minimum opening width']) {
      expect(field(group, label)).toBeDefined();
    }
    const checkbox = field(group, 'New openings include casing');
    expect(checkbox.type).toBe('input');
    expect(checkbox.props.type).toBe('checkbox');
    checkbox.props.onChange({ target: { checked: false } });
    expect(state.settings.openingsHaveCasing).toBe(false);
    expect(options(field(group, 'Default measured to'))).toEqual([['jamb', 'Jamb'], ['casing', 'Outside casing']]);
    field(group, 'Default measured to').props.onChange({ target: { value: 'casing' } });
    expect(state.settings.defaultOpeningMeasureMode).toBe('casing');
    commit('Door width', '36');
    expect(state.settings.defaultDoorWidth).toBe(36);
  });

  it('anchor 5: exposes Max cabinet width and saves 30, with labelled shop checkboxes and end selects', () => {
    openGroup('Cabinets & depths');
    const tree = commit('Max cabinet width', '30');
    expect(state.settings.maxCabinetWidth).toBe(30);
    expect(field(tree, 'Max cabinet width').props.value).toBe('30');
    field(tree, 'Snap run heights to defaults').props.onChange({ target: { checked: false } });
    expect(state.settings.snapHeightsToDefaults).toBe(false);
    const ends = openGroup('Runs & ends');
    const previous = { ...state.settings.defaultEnds };
    expect(options(field(ends, 'Default ends left'))).toEqual([['filler', 'Filler'], ['end_panel', 'End panel'], ['none', 'None']]);
    field(ends, 'Default ends left').props.onChange({ target: { value: 'none' } });
    expect(state.settings.defaultEnds).toEqual({ ...previous, left: 'none' });
    field(render(), 'Default ends right').props.onChange({ target: { value: 'end_panel' } });
    expect(state.settings.defaultEnds).toEqual({ left: 'none', right: 'end_panel' });
    field(render(), 'Add end panels to free run ends').props.onChange({ target: { checked: false } });
    expect(state.settings.autoEndPanelOnFreeEnd).toBe(false);
  });

  it('anchor 6: a shop filler edit to 4 updates inherited placeholders while a room pinned at 2 stays at 2', () => {
    const roomA = state.rooms[0].id;
    dispatch(setRoomSetting({ roomId: roomA, key: 'defaultInteriorFillerWidth', value: 2 }));
    openGroup('Fillers & corners', Panels);
    openGroup('Fillers & corners', Panels, 'Room settings');
    const tree = commit('Interior filler width', '4', Panels);
    expect(state.settings.defaultInteriorFillerWidth).toBe(4);
    expect(field(tree, 'Room Interior filler width').props).toMatchObject({ value: '2', placeholder: '4' });
    dispatch(setActiveRoom('room-b'));
    expect(field(render(Panels), 'Room Interior filler width').props).toMatchObject({ value: '', placeholder: '4' });
    expect(state.rooms[1]).not.toHaveProperty('settingsOverrides');
    dispatch(setActiveRoom(roomA));
    expect(field(render(Panels), 'Room Interior filler width').props.value).toBe('2');
    expect(state.rooms[0].settingsOverrides.defaultInteriorFillerWidth).toBe(2);
  });
});


describe('RP1 a shop report settings', () => {
  it('shows thirteen shop fields, trims text without interrupting typing, rejects overlong values and clears blanks', () => {
    const group = section(openGroup('Reports'), 'Reports');
    expect(controls(group)).toHaveLength(13);
    expect(field(group, 'Job #')).toBeUndefined();
    const input = field(group, 'Company name');
    expect(input.props).toMatchObject({ type: 'text', value: '' });
    input.props.onChange({ target: { value: ' FOREVER ' } });
    expect(field(render(), 'Company name').props.value).toBe(' FOREVER ');
    field(render(), 'Company name').props.onChange({ target: { value: ' FOREVER FURNITURE, INC. ' } });
    field(render(), 'Company name').props.onBlur();
    expect(state.settings.report.companyName).toBe('FOREVER FURNITURE, INC.');
    commit('Company name', 'x'.repeat(121));
    expect(field(render(), 'Company name').props.value).toBe('FOREVER FURNITURE, INC.');
    commit('Company name', '   ');
    expect(state.settings.report).not.toHaveProperty('companyName');
    expect(field(render(), 'Company name').props.value).toBe('');
    field(render(), 'Wire brushed').props.onChange({ target: { checked: true } });
    expect(state.settings.report.wireBrushed).toBe(true);
  });
});


describe('UI1 step a settings exclusions', () => {
  it('keeps only the seven remaining band settings in shop/room and all sixteen at project (anchor 4)', () => {
    const expected = ['Bottom part height light rail', 'Bottom part height light trough', 'Bottom part height panel',
      'Bottom part height bottom cap', 'Bottom part height corbels', 'Below run overhang', 'Below run flush reveal'];
    expect(controls(section(openGroup('Bases, tops & bands'), 'Bases, tops & bands'))
      .map(({ props }) => props['aria-label'])).toEqual(expected);
    hooks.clear();
    expect(controls(section(openGroup('Bases, tops & bands', SettingsDrawer, 'Room settings'), 'Bases, tops & bands'))
      .map(({ props }) => props['aria-label'])).toEqual(expected.map((label) => `Room ${label}`));
    state.layers = { project: { id: 'project', values: {} } };
    hooks.clear();
    header(render(ProjectSettingsPanel, { level: 'project' }), 'Project settings').props.onClick();
    header(render(ProjectSettingsPanel, { level: 'project' }), 'Bases, tops & bands').props.onClick();
    expect(controls(section(render(ProjectSettingsPanel, { level: 'project' }), 'Bases, tops & bands'))).toHaveLength(16);
    hooks.clear();
    const exclude = groupsFor('room').flatMap(({ keys }) => keys);
    expect(header(render(SettingGroups, { scope: 'room', exclude }), 'Bases, tops & bands')).toBeUndefined();
    state.rooms[0].settingsOverrides = { baseCutoutFoot: 2 };
    hooks.clear();
    expect(text(header(render(SettingsDrawer), 'Room settings'))).not.toContain('overridden');
    expect(BAND_SETTING_KEYS).toHaveLength(9);
  });
});
