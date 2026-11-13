import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import SettingsDrawer from '../SettingsDrawer.jsx';
import SettingField from '../SettingField.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: () => ({ current: null }) }));
vi.mock('../panel/usePanelState.js', () => ({ default: function usePanelStateMock(key, initial) { return useState(key === 'settingsDrawer' ? true : initial); } }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const header = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button'
  && nodes(props.children).some(({ props }) => props.children === label));
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
function render(Component = SettingsDrawer, props = { shopStandards: false }) {
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

function commit(label, value, Component = SettingsDrawer, props = { shopStandards: false }) {
  field(render(Component, props), label).props.onChange({ target: { value } });
  field(render(Component, props), label).props.onBlur();
  return render(Component, props);
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

describe('room settings panel (DB2)', () => {

  it('rejects negative Cutout foot, reverts the box and leaves no override', () => {
    state.rooms[0].profile.baseKind = 'furniture_base';
    const tree = commit('Room Cutout foot', '-1', RoomHeightsPanel);
    expect(state.rooms[0]).not.toHaveProperty('settingsOverrides');
    expect(field(tree, 'Room Cutout foot').props.value).toBe('');
    expect(field(tree, 'Reset Cutout foot')).toBeUndefined();
    commit('Room Cutout foot', '0', RoomHeightsPanel);
    expect(state.rooms[0].settingsOverrides.baseCutoutFoot).toBe(0);
  });

  it('pins equal values, counts nested leaves, false and zero, and clears a blank blur', () => {
    state.rooms[0].settingsOverrides = {
      defaultInteriorFillerWidth: 3, defaultEnds: { left: 'filler', right: 'none' },
      openingsHaveCasing: false, baseCutoutFoot: 0,
      defaultProfile: { wallHeight: 100 }, doorPanelDefault: 1, baseDepth: null, upperDepth: '',
    };
    const tree = openGroup('Fillers & corners');
    expect(text(header(tree, 'Fillers & corners'))).toContain('1 overridden');
    expect(text(header(tree, 'Runs & ends'))).toContain('2 overridden');
    expect(field(tree, 'Room Interior filler width').props.className).toContain('border-teal-500');
    commit('Room Interior filler width', '');
    expect(state.rooms[0].settingsOverrides).not.toHaveProperty('defaultInteriorFillerWidth');
    expect(text(header(render(), 'Fillers & corners'))).not.toContain('overridden');
    commit('Room Interior filler width', '3');
    expect(state.rooms[0].settingsOverrides.defaultInteriorFillerWidth).toBe(3);
    expect(text(header(render(), 'Fillers & corners'))).toContain('1 overridden');
  });

  it('rejects nonpositive cutout heights at both scopes, reverting to the last valid value', () => {
    state.rooms[0].profile.baseKind = 'furniture_base';
    commit('Room Square cutout height', '2', RoomHeightsPanel);
    for (const value of ['0', '-1']) {
      expect(field(commit('Room Square cutout height', value, RoomHeightsPanel), 'Room Square cutout height').props.value).toBe('2');
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

});
