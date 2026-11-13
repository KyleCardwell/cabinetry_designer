import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { addWall, createInitialElevationState, setActiveRoom, setTool, updateSettings } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import ElevationToolbar from '../ElevationToolbar.jsx';

vi.mock('../AddToolMenu.jsx', () => ({ default: () => null }));
vi.mock('../ExportDxfButton.jsx', () => ({ default: () => null }));
const { profiles } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
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
function render(Component = RoomHeightsPanel, props = {}) {
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

function commit(label, value, Component = RoomHeightsPanel, props = {}) {
  field(render(Component, props), label).props.onChange({ target: { value } });
  field(render(Component, props), label).props.onBlur();
  return render(Component, props);
}

beforeEach(() => {
  vi.clearAllMocks();
  state = structuredClone(elevationReducer(createInitialElevationState(null), addWall()));
  state.settings.defaultProfile.wallHeight = 96;
  state.settings.defaultSoffitMolding = 'crown';
  state.settings.sectionProfiles = profiles;
  state.tool = 'soffit';
  state.view = 'elevation';
  state.rooms = [state.rooms[0], { ...cloneRoom(state.rooms[0]), id: 'room-b' }];
  for (const room of state.rooms) { room.profile = {}; delete room.settingsOverrides; }
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

const room = () => state.rooms.find(({ id }) => id === state.activeRoomId);
const soffitGroup = () => field(render(ElevationToolbar), 'Default soffit molding');
const soffitButton = (label) => nodes(soffitGroup()).find(({ type, props }) => type === 'button' && props.children === label);

describe('room heights and soffit overrides (DB2)', () => {

  it('stores typed wall height 100, with teal, Reset and the inherited title', () => {
    const tree = commit('Room Wall height', '100');
    expect(room().profile).toEqual({ wallHeight: 100 });
    expect(field(tree, 'Room Wall height').props.value).toBe('100');
    expect(field(tree, 'Room Wall height').props.className).toContain('border-teal-500');
    expect(field(tree, 'Reset Wall height')).toBeDefined();
    expect(nodes(tree).find(({ props }) => props.title === 'Room override · Shop standard: 96"')).toBeDefined();
  });

  it('keeps equal-value pins, clears blank commits and follows inheritance across rooms', () => {
    commit('Room Wall height', '96');
    expect(room().profile.wallHeight).toBe(96);
    dispatch(updateSettings({ defaultProfile: { wallHeight: 108 } }));
    expect(field(render(), 'Room Wall height').props).toMatchObject({ value: '96', placeholder: '108' });
    dispatch(setActiveRoom('room-b'));
    expect(field(render(), 'Room Wall height').props).toMatchObject({ value: '', placeholder: '108' });
    dispatch(setActiveRoom(state.rooms[0].id));
    commit('Room Wall height', '');
    expect(room().profile).toEqual({});
    dispatch(setTool('soffit'));
    soffitButton('Crown').props.onClick();
    expect(room().settingsOverrides.defaultSoffitMolding).toBe('crown');
    expect(soffitButton('Crown').props.className).toContain('ring-1 ring-teal-500');
  });

  it('treats all editable numbers and Base proud as own values and keeps negative proud rejected', () => {
    for (const label of ['Wall height', 'Toe kick / base height', 'Base box height', 'Countertop thickness',
      'Upper clearance', 'Top of crown', 'Top mold', 'Crown', 'Crown total', 'Top mold overhang']) {
      expect(field(render(), `Room ${label}`).props.value).toBe('');
      expect(field(render(), `Reset ${label}`)).toBeUndefined();
      commit(`Room ${label}`, '0');
      expect(field(render(), `Room ${label}`).props.className).toContain('border-teal-500');
      field(render(), `Reset ${label}`).props.onClick();
    }
    dispatch(updateSettings({ defaultProfile: { baseKind: 'furniture_base', furnitureBaseProud: 0.5 } }));
    expect(field(render(), 'Room Base proud').props).toMatchObject({ value: '', placeholder: '1/2' });
    commit('Room Base proud', '0');
    commit('Room Base proud', '-1');
    expect(room().profile.furnitureBaseProud).toBe(0);
    expect(field(render(), 'Room Base proud').props.value).toBe('0');
    field(render(), 'Reset Base proud').props.onClick();
    expect(room().profile).not.toHaveProperty('furnitureBaseProud');
  });

});

const band = (tree, id) => nodes(tree).find(({ props }) => props['data-height-band'] === id);

