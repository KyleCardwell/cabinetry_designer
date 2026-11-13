import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import SettingsPanel from '../SettingsPanel.jsx';

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

describe('shop report settings (RP1)', () => {
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

