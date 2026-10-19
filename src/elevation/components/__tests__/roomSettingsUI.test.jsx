import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState, setActiveRoom, setLayerSetting, setRoomSetting, setSetting } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import RoomSettingsPanel from '../RoomSettingsPanel.jsx';
import SettingField from '../SettingField.jsx';
import SettingGroups from '../SettingGroups.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const header = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button'
  && nodes(props.children).some(({ props }) => props.children === label));
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
function render(Component = RoomSettingsPanel, props = {}) {
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

function openGroup(label) {
  if (!header(render(), 'Room settings').props['aria-expanded']) header(render(), 'Room settings').props.onClick();
  if (!header(render(), label).props['aria-expanded']) header(render(), label).props.onClick();
  return render();
}

function commit(label, value, Component = RoomSettingsPanel, props = {}) {
  field(render(Component, props), label).props.onChange({ target: { value } });
  field(render(Component, props), label).props.onBlur();
  return render(Component, props);
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe('DB2 d room settings panel', () => {
  it('IN4b d offers slide names, inherits Blum, saves the room pick and shows missing IDs (anchor 3)', () => {
    const tree = openGroup('Drawer boxes');
    expect(controls(tree)).toHaveLength(8);
    const select = field(tree, 'Room Drawer slide');
    expect(select.props.value).toBe('');
    expect(options(select)).toEqual([
      ['', 'Inherit (Blum Tandem 562H)'], ['blum-562h', 'Blum Tandem 562H'],
      ['accuride-3832', 'Accuride 3832'], ['accuride-4034', 'Accuride 4034'],
    ]);
    select.props.onChange({ target: { value: 'accuride-3832' } });
    expect(dispatch).toHaveBeenLastCalledWith(setRoomSetting({
      roomId: state.activeRoomId, key: 'drawerSlideId', value: 'accuride-3832',
    }));
    expect(state.rooms[0].settingsOverrides.drawerSlideId).toBe('accuride-3832');
    dispatch(setRoomSetting({ roomId: state.activeRoomId, key: 'drawerSlideId', value: 'gone' }));
    expect(options(field(render(), 'Room Drawer slide'))).toContainEqual(['gone', 'Missing (gone)']);
    expect(field(render(), 'Room Drawer slide').props.value).toBe('gone');
    field(render(), 'Reset Drawer slide').props.onClick();
    dispatch(setSetting({ key: 'drawerSlideId', value: 'gone' }));
    const inherited = field(render(), 'Room Drawer slide');
    expect(options(inherited)).toContainEqual(['', 'Inherit (Missing (gone))']);
    expect(options(inherited)).toContainEqual(['gone', 'Missing (gone)']);
  });

  it('IN4b d supports slide picks at team, project and phase levels with shop names', () => {
    state.settings.slides[0].name = 'Shop Blum';
    state.settings.slides.push({ ...state.settings.slides[1], id: 'custom', name: 'Shop custom' });
    state.layers = { project: { id: 'project', values: {} }, phase: { id: 'phase', values: {} } };
    for (const scope of ['team', 'project', 'phase']) {
      const props = { settingKey: 'drawerSlideId', scope };
      const label = scope === 'team' ? 'Drawer slide' : `${scope[0].toUpperCase()}${scope.slice(1)} Drawer slide`;
      const select = field(render(SettingField, props), label);
      expect(options(select)).toContainEqual(['blum-562h', 'Shop Blum']);
      expect(options(select)).toContainEqual(['custom', 'Shop custom']);
      expect(options(select).some(([value]) => value === 'none')).toBe(false);
      select.props.onChange({ target: { value: 'custom' } });
      expect(dispatch).toHaveBeenLastCalledWith(scope === 'team'
        ? setSetting({ key: 'drawerSlideId', value: 'custom' })
        : setLayerSetting({ level: scope, key: 'drawerSlideId', value: 'custom' }));
      expect(field(render(SettingField, props), label).props.value).toBe('custom');
      dispatch(scope === 'team'
        ? setSetting({ key: 'drawerSlideId', value: 'gone' })
        : setLayerSetting({ level: scope, key: 'drawerSlideId', value: 'gone' }));
      expect(options(field(render(SettingField, props), label))).toContainEqual(['gone', 'Missing (gone)']);
    }
  });

  it('shows FL1 face thickness and return tongue after return thickness with fractional defaults (A4)', () => {
    const tree = openGroup('Fillers & corners');
    const labels = controls(tree).map(({ props }) => props['aria-label']);
    const index = labels.indexOf('Room Filler return thickness');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(labels.slice(index, index + 3)).toEqual([
      'Room Filler return thickness', 'Room Filler face thickness', 'Room Filler return tongue',
    ]);
    expect(text(tree)).toContain('Filler face thickness');
    expect(text(tree)).toContain('Filler return tongue');
    expect(field(tree, 'Room Filler face thickness').props.placeholder).toBe('13/16');
    expect(field(tree, 'Room Filler return tongue').props.placeholder).toBe('1/8');
    commit('Room Filler face thickness', '3/4');
    commit('Room Filler return tongue', '1/4');
    expect(state.rooms[0].settingsOverrides).toMatchObject({ fillerThickness: 0.75, fillerReturnTongue: 0.25 });
  });

  it('starts the section and every group closed and keeps expansion out of saved state', () => {
    const initial = state;
    expect(header(render(), 'Room settings').props['aria-expanded']).toBe(false);
    expect(controls(render())).toHaveLength(0);
    header(render(), 'Room settings').props.onClick();
    const groups = nodes(render()).filter(({ type, props }) => type === 'button' && props['aria-expanded'] === false);
    expect(groups).toHaveLength(10);
    groups[0].props.onClick();
    expect(header(render(), 'Cabinets & depths').props['aria-expanded']).toBe(true);
    expect(controls(render())).toHaveLength(10);
    header(render(), 'Cabinets & depths').props.onClick();
    expect(controls(render())).toHaveLength(0);
    expect(state).toBe(initial);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('anchor 1: opens eleven filler fields with an empty inherited width of 3 and no Reset', () => {
    const tree = openGroup('Fillers & corners');
    expect(controls(tree)).toHaveLength(11);
    expect(field(tree, 'Room Interior filler width').props).toMatchObject({ value: '', placeholder: '3' });
    expect(field(tree, 'Room Interior filler width').props.className).toContain('border-gray-600');
    expect(field(tree, 'Reset Interior filler width')).toBeUndefined();
    expect(nodes(tree).find(({ props }) => props.title === 'Shop standard: 3"')).toBeDefined();
    expect(nodes(tree).find(({ props }) => props.className === 'mt-3 grid grid-cols-2 gap-2')).toBeDefined();
  });

  it('anchor 2: commits 2 in room A and shows teal input, Reset and both override counts', () => {
    openGroup('Fillers & corners');
    const tree = commit('Room Interior filler width', '2');
    expect(state.rooms[0].settingsOverrides).toEqual({ defaultInteriorFillerWidth: 2 });
    expect(field(tree, 'Room Interior filler width').props.value).toBe('2');
    expect(field(tree, 'Room Interior filler width').props.className).toContain('border-teal-500');
    expect(field(tree, 'Reset Interior filler width')).toBeDefined();
    for (const label of ['Room settings', 'Fillers & corners']) {
      expect(text(header(tree, label))).toContain('1 overridden');
      expect(nodes(header(tree, label)).find(({ props }) => props.className === 'text-teal-400')).toBeDefined();
    }
  });

  it('anchor 3: Reset removes the last override and clears the field and both counts', () => {
    openGroup('Fillers & corners');
    field(commit('Room Interior filler width', '2'), 'Reset Interior filler width').props.onClick();
    const tree = render();
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
    expect(field(tree, 'Room Interior filler width').props.value).toBe('');
    expect(field(tree, 'Reset Interior filler width')).toBeUndefined();
    expect(text(tree)).not.toContain('overridden');
  });

  it('anchor 4: keeps A at 2 while B follows a shop change to 4 and switches input state correctly', () => {
    openGroup('Fillers & corners');
    commit('Room Interior filler width', '2');
    dispatch(setSetting({ key: 'defaultInteriorFillerWidth', value: 4 }));
    expect(field(render(), 'Room Interior filler width').props).toMatchObject({ value: '2', placeholder: '4' });
    dispatch(setActiveRoom('room-b'));
    expect(field(render(), 'Room Interior filler width').props).toMatchObject({ value: '', placeholder: '4' });
    expect(text(render())).not.toContain('overridden');
    dispatch(setActiveRoom(state.rooms[0].id));
    expect(field(render(), 'Room Interior filler width').props.value).toBe('2');
  });

  it('anchor 5: offers Inherit (Filler) and writes a nested None override', () => {
    const tree = openGroup('Runs & ends');
    expect(options(field(tree, 'Room Default ends left'))).toEqual([
      ['', 'Inherit (Filler)'], ['filler', 'Filler'], ['end_panel', 'End panel'], ['none', 'None'],
    ]);
    field(tree, 'Room Default ends left').props.onChange({ target: { value: 'none' } });
    expect(state.rooms[0].settingsOverrides).toEqual({ defaultEnds: { left: 'none' } });
    expect(field(render(), 'Room Default ends left').props.className).toContain('border-teal-500');
  });

  it('anchor 6: shows seven opening fields and ten cabinet fields without team-only settings', () => {
    const tree = openGroup('Openings & soffits');
    expect(controls(tree)).toHaveLength(7);
    expect(field(tree, 'Room Door width')).toBeUndefined();
    expect(field(tree, 'Room Door panel thickness')).toBeUndefined();
    header(tree, 'Openings & soffits').props.onClick();
    const cabinets = openGroup('Cabinets & depths');
    expect(controls(cabinets)).toHaveLength(10);
    expect(field(cabinets, 'Room Max cabinet width')).toBeUndefined();
  });

  it('anchor 7: rejects negative Cutout foot, reverts the box and leaves no override', () => {
    openGroup('Bases, tops & bands');
    const tree = commit('Room Cutout foot', '-1');
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
    expect(field(tree, 'Room Cutout foot').props.value).toBe('');
    expect(field(tree, 'Reset Cutout foot')).toBeUndefined();
    commit('Room Cutout foot', '0');
    expect(state.rooms[0].settingsOverrides.baseCutoutFoot).toBe(0);
  });

  it('anchor 8: renders nothing with no active room', () => {
    state.activeRoomId = null;
    expect(render()).toBeNull();
  });

  it('pins equal values, counts nested leaves, false and zero, and clears a blank blur', () => {
    state.rooms[0].settingsOverrides = {
      defaultInteriorFillerWidth: 3, defaultEnds: { left: 'filler', right: 'none' },
      openingsHaveCasing: false, baseCutoutFoot: 0,
      defaultProfile: { wallHeight: 100 }, doorPanelDefault: 1, baseDepth: null, upperDepth: '',
    };
    const tree = openGroup('Fillers & corners');
    expect(text(header(tree, 'Room settings'))).toContain('5 overridden');
    expect(text(header(tree, 'Runs & ends'))).toContain('2 overridden');
    expect(field(tree, 'Room Interior filler width').props.className).toContain('border-teal-500');
    commit('Room Interior filler width', '');
    expect(state.rooms[0].settingsOverrides).not.toHaveProperty('defaultInteriorFillerWidth');
    expect(text(header(render(), 'Room settings'))).toContain('4 overridden');
    commit('Room Interior filler width', '3');
    expect(state.rooms[0].settingsOverrides.defaultInteriorFillerWidth).toBe(3);
    expect(text(header(render(), 'Fillers & corners'))).toContain('1 overridden');
  });

  it('uses a tri-state boolean select and a built-in source when the shop leaf is absent', () => {
    delete state.settings.openingsHaveCasing;
    const tree = openGroup('Openings & soffits');
    const control = field(tree, 'Room New openings include casing');
    expect(control.type).toBe('select');
    expect(options(control)).toEqual([['', 'Inherit (On)'], ['true', 'On'], ['false', 'Off']]);
    expect(nodes(tree).find(({ props }) => props.title === 'Built-in default: On')).toBeDefined();
    control.props.onChange({ target: { value: 'false' } });
    expect(state.rooms[0].settingsOverrides.openingsHaveCasing).toBe(false);
    field(render(), 'Room New openings include casing').props.onChange({ target: { value: '' } });
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
  });

  it('rejects nonpositive cutout heights at both scopes, reverting to the last valid value', () => {
    openGroup('Bases, tops & bands');
    commit('Room Square cutout height', '2');
    for (const value of ['0', '-1']) {
      expect(field(commit('Room Square cutout height', value), 'Room Square cutout height').props.value).toBe('2');
      expect(state.rooms[0].settingsOverrides.baseCutoutHeight).toBe(2);
    }
    hooks.clear();
    const props = { settingKey: 'baseCutoutHeight', scope: 'team' };
    const previous = state.settings.baseCutoutHeight;
    const initialText = field(render(SettingField, props), 'Square cutout height').props.value;
    for (const value of ['0', '-1']) {
      expect(field(commit('Square cutout height', value, SettingField, props), 'Square cutout height').props.value).toBe(initialText);
      expect(state.settings.baseCutoutHeight).toBe(previous);
    }
  });

  it('provides plain shop numbers, checkboxes and choices with nested setSetting dispatch', () => {
    const numeric = { scope: 'team', settingKey: 'baseCutoutFoot' };
    const original = state.settings.baseCutoutFoot;
    commit('Cutout foot', '-1', SettingField, numeric);
    expect(state.settings.baseCutoutFoot).toBe(original);
    const tree = commit('Cutout foot', '0', SettingField, numeric);
    expect(state.settings.baseCutoutFoot).toBe(0);
    expect(field(tree, 'Cutout foot').props.className).toContain('border-gray-600');
    expect(text(tree)).not.toContain('Reset');
    const checkbox = field(render(SettingField, { scope: 'team', settingKey: 'openingsHaveCasing' }), 'New openings include casing');
    expect(checkbox.props.type).toBe('checkbox');
    checkbox.props.onChange({ target: { checked: false } });
    expect(state.settings.openingsHaveCasing).toBe(false);
    const select = field(render(SettingField, { scope: 'team', settingKey: 'defaultEnds.left' }), 'Default ends left');
    const previousEnds = state.settings.defaultEnds;
    expect(options(select)).toEqual([['filler', 'Filler'], ['end_panel', 'End panel'], ['none', 'None']]);
    select.props.onChange({ target: { value: 'none' } });
    expect(state.settings.defaultEnds).toEqual({ ...previousEnds, left: 'none' });
    expect(dispatch).toHaveBeenLastCalledWith(setSetting({ key: 'defaultEnds.left', value: 'none' }));
    const groups = render(SettingGroups, { scope: 'team' });
    expect(nodes(groups).filter(({ type, props }) => type === 'button' && props['aria-expanded'] === false)).toHaveLength(10);
    expect(text(groups)).not.toContain('overridden');
  });
});
