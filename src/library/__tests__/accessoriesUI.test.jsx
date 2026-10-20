import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { newAccessory } from '../../elevation/model/accessories.js';
import elevationReducer, { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import AccessoryEditor from '../AccessoryEditor.jsx';
import AccessoriesPage from '../AccessoriesPage.jsx';
import PricingFields from '../PricingFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: (callback) => callback,
  useRef: vi.fn(),
  useId: () => 'accessory-editor',
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

function library(source = 'local', accessories = [], teamServices = []) {
  let state = createInitialElevationState();
  state = { ...state, source, teamServices, settings: { ...state.settings, accessories } };
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
    return AccessoriesPage();
  };
  return { render, state: () => state };
}

function editor(accessory, accessories = [accessory], services = []) {
  let draft = structuredClone(accessory);
  const onClose = vi.fn();
  const render = () => {
    useState.mockImplementation(() => [draft, (update) => { draft = update(draft); }]);
    return AccessoryEditor({ accessory, accessories, services, onClose });
  };
  const enter = (label, typed) => {
    const field = control(render(), label);
    expect(field.type).toBe(InchInput);
    useState.mockImplementationOnce(() => [typed, vi.fn()]);
    InchInput(field.props).props.onBlur();
  };
  return { render, enter, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatch.mockReset();
  useRef.mockReturnValue({ current: null });
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
});

function pricing(tree) {
  return PricingFields(nodes(tree).find(({ type }) => type === PricingFields).props);
}
function money(tree, label) {
  const field = nodes(tree).find(({ type, props }) => typeof type === 'function' && props.label === label);
  useState.mockReturnValueOnce([false, vi.fn()]);
  return control(field.type(field.props), label);
}
const services = [{ id: 7, name: 'Shop', active: true }, { id: 9, name: 'Install', active: false }];

describe('IN12b step b Accessories page and editor', () => {
  it('shows a fresh sandbox empty state, opens uniquely named new accessories, and copies without an editor', () => {
    const page = library();
    expect(rows(page.render())).toEqual([]);
    expect(nodes(page.render()).filter(({ type }) => type === 'th').map(text)).toEqual(['Name', 'Goes in', 'Min opening', 'Report text', 'Price', 'Actions']);
    expect(text(page.render())).toContain('Organizers, inserts and other parts placed in cabinet interiors.');
    expect(text(page.render())).toContain('No accessories yet. Add the ones the shop uses with New accessory.');
    expect(button(page.render(), 'New accessory').props.disabled).toBeFalsy();
    button(page.render(), 'New accessory').props.onClick();
    let dialog = nodes(page.render()).find(({ type }) => type === AccessoryEditor);
    expect(page.state().settings.accessories).toHaveLength(1);
    expect(dialog.props.accessory.name).toBe('New accessory');
    dialog.props.onClose();
    button(page.render(), 'New accessory').props.onClick();
    dialog = nodes(page.render()).find(({ type }) => type === AccessoryEditor);
    expect(dialog.props.accessory.name).toBe('New accessory 2');
    dialog.props.onClose();
    button(rows(page.render())[0], 'Copy').props.onClick();
    expect(page.state().settings.accessories.map(({ name }) => name)).toEqual(['New accessory', 'New accessory 2', 'New accessory copy']);
    expect(nodes(page.render()).some(({ type }) => type === AccessoryEditor)).toBe(false);
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text)).toEqual(['New accessory', 'Section', '—', 'New accessory', '—', 'EditCopyDelete']);
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td')[3].props.className).toContain('text-gray-500');
    button(rows(page.render())[0], 'Edit').props.onClick();
    expect(nodes(page.render()).find(({ type }) => type === AccessoryEditor).props.accessory.id).toBe(page.state().settings.accessories[0].id);
  });

  it('validates names, clears whole section for drawer boxes, and saves trimmed text and positive optional dimensions', () => {
    const first = newAccessory([], 'first');
    const second = newAccessory([first], 'second');
    const { render, enter, onClose } = editor(first, [first, second]);
    control(render(), 'Name').props.onChange({ target: { value: ' NEW ACCESSORY 2 ' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name already used');
    control(render(), 'Name').props.onChange({ target: { value: ' ' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name is required');
    button(render(), 'Save').props.onClick();
    expect(dispatch).not.toHaveBeenCalled();
    control(render(), 'Name').props.onChange({ target: { value: ' Lazy susan 28 ' } });
    expect(control(render(), 'Report text').props.placeholder).toBe('Same as the name');
    for (const label of ['Brand', 'Model', 'Description']) {
      control(render(), label).props.onChange({ target: { value: ` Shop ${label} ` } });
    }
    control(render(), 'Takes the whole section').props.onChange({ target: { checked: true } });
    control(render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    expect(control(render(), 'Takes the whole section').props).toMatchObject({ checked: false, disabled: true });
    control(render(), 'Goes in').props.onChange({ target: { value: 'section' } });
    expect(control(render(), 'Takes the whole section').props).toMatchObject({ checked: false, disabled: false });
    control(render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    enter('Min width', '27');
    enter('Min depth', '22');
    enter('Min height', '1 1/2');
    expect(control(render(), 'Min height').props.value).toBe(1.5);
    enter('Min height', '');
    for (const invalid of ['0', '-1', 'nonsense']) enter('Min width', invalid);
    expect(control(render(), 'Min width').props.value).toBe(27);
    control(render(), 'Report text').props.onChange({ target: { value: ' 6472-28 lazy susan ' } });
    control(render(), 'Brings its own slides').props.onChange({ target: { checked: true } });
    button(render(), 'Save').props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.accessory;
    expect(saved).toMatchObject({ name: 'Lazy susan 28', brand: 'Shop Brand', model: 'Shop Model', description: 'Shop Description', reportText: '6472-28 lazy susan', attachesTo: 'drawer_box', wholeSection: false, ownSlides: true, minOpening: { width: 27, depth: 22, height: null }, effects: [] });
    expect(onClose).toHaveBeenCalledOnce();
    const page = library('local', [saved]);
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text)).toEqual(['Lazy susan 28', 'Drawer box', '27" W · 22" D', '6472-28 lazy susan', '—', 'EditCopyDelete']);
    const whole = library('local', [{ ...saved, attachesTo: 'section', wholeSection: true, minOpening: { width: 27, depth: 22, height: 5 } }]);
    expect(text(whole.render())).toContain('Section · whole section');
    expect(text(whole.render())).toContain('27" W · 22" D · 5" H');
    const invalid = editor({ ...first, price: -1 });
    expect(text(invalid.render())).toContain('Not a valid accessory');
    expect(button(invalid.render(), 'Save').props.disabled).toBe(true);
  });

  it('saves square-foot pricing and active service minutes with matching labels and formatted price', () => {
    const accessory = newAccessory([], 'priced');
    const edit = editor(accessory, [accessory], services);
    let fields = pricing(edit.render());
    expect(money(fields, 'Price each').props.value).toBe('');
    control(fields, 'Priced by').props.onChange({ target: { value: 'area' } });
    fields = pricing(edit.render());
    expect(text(fields)).toContain('Labour (minutes per sq ft)');
    money(fields, 'Price per sq ft').props.onChange({ target: { value: '4.5' } });
    expect(money(pricing(edit.render()), 'Price per sq ft').props.value).toBe('4.50');
    money(pricing(edit.render()), 'Actual cost per sq ft').props.onChange({ target: { value: '' } });
    fields = pricing(edit.render());
    expect(nodes(control(fields, 'Add service')).filter(({ type }) => type === 'option').map(text)).toEqual(['Add service', 'Shop']);
    control(fields, 'Add service').props.onChange({ target: { value: '7' } });
    fields = pricing(edit.render());
    expect(control(fields, 'Minutes for Shop').props.value).toBe(0);
    control(fields, 'Minutes for Shop').props.onChange({ target: { value: '12' } });
    expect(control(pricing(edit.render()), 'Add service').props.disabled).toBe(true);
    button(edit.render(), 'Save').props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.accessory;
    expect(saved).toMatchObject({ pricing: 'area', price: 4.5, actualCost: null, labor: { '7': 12 } });
    expect(text(library('local', [saved]).render())).toContain('$4.50 / sq ft');
    const page = library('cloud', [saved], services);
    button(page.render(), 'Edit').props.onClick();
    expect(nodes(page.render()).find(({ type }) => type === AccessoryEditor).props.services).toEqual(services);
    money(pricing(edit.render()), 'Price per sq ft').props.onChange({ target: { value: '-1' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(true);
    expect(text(edit.render())).toContain('Not a valid accessory');
  });

  it('preserves unknown and inactive labour, removes blank minutes, and supports fixed units and read-only pricing', () => {
    const accessory = { ...newAccessory([], 'labor'), labor: { '7': 12, '42': 3 } };
    const edit = editor(accessory, [accessory], services);
    let fields = pricing(edit.render());
    expect(control(fields, 'Minutes for Shop').props.value).toBe(12);
    expect(control(fields, 'Minutes for Unknown service 42').props.value).toBe(3);
    control(fields, 'Minutes for Shop').props.onChange({ target: { value: '' } });
    expect(control(pricing(edit.render()), 'Minutes for Shop')).toBeUndefined();
    expect(control(pricing(edit.render()), 'Add service').props.disabled).toBe(false);
    control(pricing(edit.render()), 'Remove Unknown service 42').props.onClick();
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.accessory.labor).toEqual({});
    fields = PricingFields({ value: { price: 4.5, actualCost: 0, labor: { '42': 3, '9': 8 } }, onChange: vi.fn(), unitLabel: 'pair', services, readOnly: true });
    expect(control(fields, 'Priced by')).toBeUndefined();
    expect(control(fields, 'Minutes for Install (inactive)').props).toMatchObject({ value: 8, disabled: true });
    expect(text(fields)).toContain('Labour (minutes per pair)');
    expect(money(fields, 'Price per pair').props).toMatchObject({ disabled: true, value: '4.50' });
    expect(money(fields, 'Actual cost per pair').props.value).toBe('0.00');
    for (const label of ['Minutes for Unknown service 42', 'Remove Unknown service 42', 'Add service']) expect(control(fields, label).props.disabled).toBe(true);
    const noServices = PricingFields({ value: { price: null, actualCost: null, labor: {} }, onChange: vi.fn(), unitLabel: 'each' });
    expect(control(noServices, 'Add service').props.disabled).toBe(true);
    expect(text(noServices)).toContain("Services load with the shop's data.");
    const labor = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), 0]));
    const limited = PricingFields({ value: { price: null, actualCost: null, labor }, onChange: vi.fn(), unitLabel: 'each', services: [{ id: 21, name: 'Extra', active: true }] });
    expect(control(limited, 'Add service').props.disabled).toBe(true);
  });

  it('requires confirmation for Delete and Archive, and lets the user cancel', () => {
    const accessory = newAccessory([], 'delete');
    for (const [source, label, confirm] of [['local', 'Delete', 'Confirm delete'], ['cloud', 'Archive', 'Confirm archive']]) {
      const page = library(source, [accessory]);
      dispatch.mockClear();
      button(page.render(), label).props.onClick();
      expect(dispatch).not.toHaveBeenCalled();
      expect(text(page.render())).toContain('Rooms that use it will ask for a replacement when opened.');
      button(page.render(), 'Cancel').props.onClick();
      expect(button(page.render(), confirm)).toBeUndefined();
      button(page.render(), label).props.onClick();
      button(page.render(), confirm).props.onClick();
      expect(page.state().settings.accessories).toEqual([]);
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
      const { render, onClose } = editor(newAccessory([], 'focus'));
      const tree = render();
      expect(nodes(tree).find(({ props }) => props.role === 'dialog').props).toMatchObject({ 'aria-modal': 'true', 'aria-labelledby': 'accessory-editor' });
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
