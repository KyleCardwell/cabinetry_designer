import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BUILT_IN_PULLS, isPullList, newPull } from '../../elevation/model/pulls.js';
import elevationReducer, { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import PullEditor from '../PullEditor.jsx';
import PullsPage from '../PullsPage.jsx';
import PricingFields from '../PricingFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: (callback) => callback,
  useRef: vi.fn(),
  useId: () => 'pull-editor',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
}
const control = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === label);
const rows = (tree) => nodes(tree).filter(({ type }) => type === 'tr').slice(1);
const dispatch = vi.fn();

function library(source = 'local', pulls = BUILT_IN_PULLS, teamServices = []) {
  let state = createInitialElevationState();
  state = { ...state, source, teamServices, settings: { ...state.settings, pulls } };
  const values = [];
  dispatch.mockImplementation((action) => { state = elevationReducer(state, action); });
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  const render = () => {
    let index = 0;
    useState.mockImplementation((initial) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (value) => { values[slot] = value; }];
    });
    return PullsPage();
  };
  return { render, state: () => state };
}

function editor(pull, pulls = [...BUILT_IN_PULLS, pull], services = []) {
  let draft = structuredClone(pull);
  const onClose = vi.fn();
  const render = () => {
    useState.mockImplementation(() => [draft, (update) => { draft = update(draft); }]);
    return PullEditor({ pull, pulls, services, onClose });
  };
  const enter = (label, typed) => {
    const field = control(render(), label);
    expect(field.type).toBe(InchInput);
    useState.mockImplementationOnce(() => [typed, vi.fn()]);
    InchInput(field.props).props.onBlur();
  };
  return { render, enter, onClose };
}

function pricing(tree) {
  return PricingFields(nodes(tree).find(({ type }) => type === PricingFields).props);
}
function money(tree, label) {
  const field = nodes(tree).find(({ type, props }) => typeof type === 'function' && props.label === label);
  useState.mockReturnValueOnce([false, vi.fn()]);
  return control(field.type(field.props), label);
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatch.mockReset();
  useRef.mockReturnValue({ current: null });
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
});

describe('Pulls page and editor (HP3b)', () => {

  it('validates names and centers, switches kind with clean defaults, and edits positive fractional sizes', () => {
    const custom = { ...newPull(BUILT_IN_PULLS, BUILT_IN_PULLS[0], 'custom'), hardwarePullId: 42,
      price: 12, actualCost: 8, labor: { '7': 4 } };
    const { render, enter, onClose } = editor(custom);
    control(render(), 'Name').props.onChange({ target: { value: '  ' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name is required');
    control(render(), 'Name').props.onChange({ target: { value: '1 1/4" KNOB' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name already used');
    button(render(), 'Save').props.onClick();
    expect(dispatch).not.toHaveBeenCalled();
    control(render(), 'Name').props.onChange({ target: { value: ' Shop tab ' } });
    enter('Centers', '6');
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain("Centers can't be longer than the pull");
    enter('Centers', '');
    expect(button(render(), 'Save').props.disabled).toBe(false);
    button(render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.pull).not.toHaveProperty('centers');
    control(render(), 'Kind').props.onChange({ target: { value: 'tab' } });
    expect(control(render(), 'Length').props.value).toBe(3);
    expect(control(render(), 'Height').props.value).toBe(0.5);
    expect(control(render(), 'Projection').props.value).toBe(1.25);
    expect(control(render(), 'Centers')).toBeUndefined();
    expect(control(render(), 'Width')).toBeUndefined();
    for (const typed of ['0', '-1', 'nonsense', '']) enter('Length', typed);
    expect(control(render(), 'Length').props.value).toBe(3);
    enter('Projection', '1 3/8');
    button(render(), 'Save').props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.pull;
    expect(saved).toEqual({ id: 'custom', name: 'Shop tab', kind: 'tab', length: 3, height: 0.5, projection: 1.375, hardwarePullId: 42,
      price: 12, actualCost: 8, labor: { '7': 4 } });
    expect(isPullList([...BUILT_IN_PULLS, saved])).toBe(true);
    expect(onClose).toHaveBeenCalled();
    control(render(), 'Kind').props.onChange({ target: { value: 'knob' } });
    expect(control(render(), 'Diameter').props.value).toBe(1.25);
    expect(control(render(), 'Length')).toBeUndefined();
    control(render(), 'Kind').props.onChange({ target: { value: 'pull' } });
    expect(control(render(), 'Width').props.value).toBe(0.375);
    const invalid = editor({ ...custom, projection: 0 });
    expect(button(invalid.render(), 'Save').props.disabled).toBe(true);
    expect(text(invalid.render())).toContain('Not a valid pull');
  });

});
