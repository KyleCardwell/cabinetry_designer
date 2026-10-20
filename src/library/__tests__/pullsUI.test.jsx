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

describe('HP3b step b Pulls page and editor', () => {
  it('prices the built-in 4" pull each, with shop services passed through to the editor', () => {
    const services = [{ id: 7, name: 'Shop', active: true }];
    const page = library('cloud', BUILT_IN_PULLS, services);
    button(rows(page.render())[0], 'Edit').props.onClick();
    const dialog = nodes(page.render()).find(({ type }) => type === PullEditor);
    expect(dialog.props.services).toEqual(services);
    const edit = editor(dialog.props.pull, dialog.props.pulls, dialog.props.services);
    let fields = pricing(edit.render());
    expect(control(fields, 'Priced by')).toBeUndefined();
    expect(money(fields, 'Price each').props).toMatchObject({ value: '', disabled: false });
    expect(money(fields, 'Actual cost each').props.value).toBe('');
    expect(text(fields)).toContain('Labour (minutes each)');
    money(fields, 'Price each').props.onChange({ target: { value: '6.25' } });
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.pulls[0]).toEqual({ ...BUILT_IN_PULLS[0], price: 6.25 });
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text).at(-2)).toBe('$6.25 each');
    expect(page.state().settings.pulls[0]).not.toHaveProperty('pricing');
    fields = pricing(edit.render());
    money(fields, 'Price each').props.onChange({ target: { value: '-1' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(true);
    money(pricing(edit.render()), 'Price each').props.onChange({ target: { value: '' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
  });

  it('shows an em dash for an unpriced pull and keeps sandbox pricing usable without services', () => {
    const page = library();
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text).at(-2)).toBe('—');
    button(rows(page.render())[0], 'Edit').props.onClick();
    const dialog = nodes(page.render()).find(({ type }) => type === PullEditor);
    const edit = editor(dialog.props.pull, dialog.props.pulls, dialog.props.services);
    const fields = pricing(edit.render());
    expect(control(fields, 'Add service').props.disabled).toBe(true);
    expect(text(fields)).toContain("Services load with the shop's data.");
    expect(money(fields, 'Price each').props.disabled).toBe(false);
    money(fields, 'Price each').props.onChange({ target: { value: '6.25' } });
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.pulls[0].price).toBe(6.25);
  });

  it('shows the two built-ins with exact sizes and badges, and formats tabs and pulls without centers', () => {
    const { render } = library();
    expect(nodes(render()).filter(({ type }) => type === 'th').map(text)).toEqual(['Name', 'Kind', 'Size', 'Projection', 'Price', 'Actions']);
    expect(text(render())).toContain('Pulls, knobs and tab pulls drawn on doors and drawer fronts. Never on reports.');
    expect(rows(render()).map((row) => nodes(row).filter(({ type }) => type === 'td').map(text))).toEqual([
      ['4" pullbuilt-in', 'Pull', '4 3/4" long · 4" centers', '1 1/4"', '—', 'EditCopy'],
      ['1 1/4" knobbuilt-in', 'Knob', '1 1/4" dia.', '1"', '—', 'EditCopy'],
    ]);
    const noCenters = newPull(BUILT_IN_PULLS, BUILT_IN_PULLS[0], 'custom');
    delete noCenters.centers;
    const tab = { id: 'tab', name: 'Tab', kind: 'tab', length: 3, height: 0.5, projection: 1, hardwarePullId: null, price: null, actualCost: null, labor: {} };
    const custom = library('local', [...BUILT_IN_PULLS, noCenters, tab]);
    expect(rows(custom.render()).slice(2).map((row) => nodes(row).filter(({ type }) => type === 'td').map(text)[2]))
      .toEqual(['4 3/4" long', '3" long · 1/2" tall']);
  });

  it('opens New pull in the editor and copies the knob row without opening an editor', () => {
    const page = library();
    button(page.render(), 'New pull').props.onClick();
    expect(page.state().settings.pulls).toHaveLength(3);
    const dialog = nodes(page.render()).find(({ type }) => type === PullEditor);
    expect(dialog.props.pull.name).toBe('4" pull copy');
    dialog.props.onClose();
    button(rows(page.render())[1], 'Copy').props.onClick();
    expect(page.state().settings.pulls[3].name).toBe('1 1/4" knob copy');
    expect(nodes(page.render()).some(({ type }) => type === PullEditor)).toBe(false);
    button(rows(page.render())[1], 'Edit').props.onClick();
    expect(nodes(page.render()).find(({ type }) => type === PullEditor).props.pull.id).toBe('knob-1-25');
  });

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

  it('resizes a built-in with kind locked, and confirms or cancels Delete/Archive for custom pulls', () => {
    const builtIn = editor(BUILT_IN_PULLS[0], BUILT_IN_PULLS);
    expect(control(builtIn.render(), 'Kind').props.disabled).toBe(true);
    builtIn.enter('Length', '5');
    button(builtIn.render(), 'Save').props.onClick();
    const resized = elevationReducer(createInitialElevationState(), dispatch.mock.lastCall[0]);
    expect(resized.settings.pulls[0]).toEqual({ ...BUILT_IN_PULLS[0], length: 5 });
    const custom = newPull(BUILT_IN_PULLS, BUILT_IN_PULLS[0], 'custom');
    for (const [source, label, confirm] of [['local', 'Delete', 'Confirm delete'], ['cloud', 'Archive', 'Confirm archive']]) {
      const page = library(source, [...BUILT_IN_PULLS, custom]);
      dispatch.mockClear();
      expect(button(rows(page.render())[0], label)).toBeUndefined();
      expect(button(rows(page.render())[1], label)).toBeUndefined();
      button(page.render(), label).props.onClick();
      expect(dispatch).not.toHaveBeenCalled();
      expect(text(page.render())).toContain('Rooms that use it will ask for a replacement when opened.');
      button(page.render(), 'Cancel').props.onClick();
      expect(button(page.render(), confirm)).toBeUndefined();
      button(page.render(), label).props.onClick();
      button(page.render(), confirm).props.onClick();
      expect(page.state().settings.pulls).toEqual(BUILT_IN_PULLS);
    }
  });

  it('focuses the name, traps Tab in both directions, closes on Escape and Cancel, and restores focus', () => {
    const doc = { activeElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const first = { focus: vi.fn() };
    const last = { focus: vi.fn() };
    const previous = { focus: vi.fn() };
    doc.activeElement = previous;
    vi.stubGlobal('document', doc);
    try {
      useRef.mockReturnValue({ current: { querySelector: () => first, querySelectorAll: () => [first, last] } });
      const { render, onClose } = editor(BUILT_IN_PULLS[0], BUILT_IN_PULLS);
      const tree = render();
      expect(nodes(tree).find(({ props }) => props.role === 'dialog').props).toMatchObject({ 'aria-modal': 'true', 'aria-labelledby': 'pull-editor' });
      const cleanup = useEffect.mock.lastCall[0]();
      expect(first.focus).toHaveBeenCalledOnce();
      const handler = doc.addEventListener.mock.lastCall[1];
      const preventDefault = vi.fn();
      doc.activeElement = last;
      handler({ key: 'Tab', preventDefault });
      expect(first.focus).toHaveBeenCalledTimes(2);
      doc.activeElement = first;
      handler({ key: 'Tab', shiftKey: true, preventDefault });
      expect(last.focus).toHaveBeenCalledOnce();
      handler({ key: 'Escape', preventDefault });
      expect(onClose).toHaveBeenCalledOnce();
      button(tree, 'Cancel').props.onClick();
      expect(onClose).toHaveBeenCalledTimes(2);
      cleanup();
      expect(doc.removeEventListener).toHaveBeenCalledWith('keydown', handler);
      expect(previous.focus).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
