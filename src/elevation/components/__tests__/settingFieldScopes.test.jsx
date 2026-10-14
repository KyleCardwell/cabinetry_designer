import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState, setLayerSetting } from '../../store/elevationSlice.js';
import SettingField from '../SettingField.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
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
function render(Component = SettingField, props = {}) {
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

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState(null);
  state.settings.baseDepth = 24;
  state.layers = { project: { id: 42, values: {} }, phase: { id: 'p1', values: {} } };
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

function commit(scope, settingKey, value) {
  const props = { scope, settingKey };
  const label = `${scope[0].toUpperCase()}${scope.slice(1)} ${settingKey === 'baseDepth' ? 'Base depth' : settingKey === 'baseCutoutFoot' ? 'Cutout foot' : 'Square cutout height'}`;
  field(render(SettingField, props), label).props.onChange({ target: { value } });
  field(render(SettingField, props), label).props.onBlur();
  return render(SettingField, props);
}

describe('DB5 d setting field scopes', () => {
  it('inherits shop depth 24 with no teal border, then commits project depth 25 (anchor 1)', () => {
    const props = { scope: 'project', settingKey: 'baseDepth' };
    const initial = field(render(SettingField, props), 'Project Base depth');
    expect(initial.props).toMatchObject({ value: '', placeholder: '24' });
    expect(initial.props.className).not.toContain('teal');
    const tree = commit('project', 'baseDepth', '25');
    expect(dispatch).toHaveBeenLastCalledWith(setLayerSetting({ level: 'project', key: 'baseDepth', value: 25 }));
    expect(field(tree, 'Project Base depth').props.className).toContain('border-teal-500');
    expect(nodes(tree).some(({ props }) => props.title === 'Project override · Shop standard: 24"')).toBe(true);
  });

  it('inherits project depth 25 in a phase, labels its source, and supports Reset and nested choices (anchor 2)', () => {
    state.layers.project.values = { baseDepth: 25 };
    const props = { scope: 'phase', settingKey: 'baseDepth' };
    let tree = render(SettingField, props);
    expect(field(tree, 'Phase Base depth').props).toMatchObject({ value: '', placeholder: '25' });
    expect(nodes(tree).some(({ props }) => props.title === 'Project: 25"')).toBe(true);
    tree = commit('phase', 'baseDepth', '26');
    expect(nodes(tree).some(({ props }) => props.title === 'Phase override · Project: 25"')).toBe(true);
    field(tree, 'Reset Base depth').props.onClick();
    expect(state.layers.phase.values).not.toHaveProperty('baseDepth');
    expect(dispatch).toHaveBeenLastCalledWith(setLayerSetting({ level: 'phase', key: 'baseDepth', value: null }));
    hooks.clear();
    const choice = { scope: 'phase', settingKey: 'defaultEnds.left' };
    const select = field(render(SettingField, choice), 'Phase Default ends left');
    expect(options(select)[0][0]).toBe('');
    select.props.onChange({ target: { value: 'none' } });
    expect(state.layers.phase.values.defaultEnds).toEqual({ left: 'none' });
    hooks.clear();
    field(render(SettingField, { scope: 'project', settingKey: 'snapHeightsToDefaults' }), 'Project Snap run heights to defaults').props.onChange({ target: { value: 'false' } });
    expect(state.layers.project.values.snapHeightsToDefaults).toBe(false);
  });

  it('returns null until the requested layer is loaded', () => {
    state.layers = { project: null, phase: null };
    for (const scope of ['project', 'phase']) expect(render(SettingField, { scope, settingKey: 'baseDepth' })).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects negative cutout feet and nonpositive cutout heights in both layer scopes', () => {
    for (const scope of ['project', 'phase']) {
      for (const settingKey of ['baseCutoutFoot', 'baseCutoutHeight']) {
        hooks.clear();
        commit(scope, settingKey, '2');
        dispatch.mockClear();
        for (const invalid of settingKey === 'baseCutoutFoot' ? ['-1'] : ['0', '-1']) {
          commit(scope, settingKey, invalid);
          expect(state.layers[scope].values[settingKey]).toBe(2);
          expect(dispatch).not.toHaveBeenCalled();
        }
      }
    }
  });
});
