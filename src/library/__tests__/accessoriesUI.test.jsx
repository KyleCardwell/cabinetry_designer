import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { newAccessory, withAccessoryDefaults } from '../../elevation/model/accessories.js';
import elevationReducer, { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import AccessoryEditor from '../AccessoryEditor.jsx';
import AccessoryEffectsFields from '../AccessoryEffectsFields.jsx';
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
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.type === AccessoryEffectsFields
    ? AccessoryEffectsFields(tree.props) : tree.props?.children)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.type === AccessoryEffectsFields ? AccessoryEffectsFields(tree.props) : tree.props.children) : '';
}
const control = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === label);
const rows = (tree) => nodes(tree).filter(({ type }) => type === 'tr').slice(1);
const dispatch = vi.fn();

function library(source = 'local', accessories = [], teamServices = [], slides) {
  let state = createInitialElevationState();
  state = { ...state, source, teamServices, settings: { ...state.settings, accessories, ...(slides ? { slides } : {}) } };
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

function editor(accessory, accessories = [accessory], services = [], slides = []) {
  let draft = structuredClone(accessory);
  const onClose = vi.fn();
  const render = () => {
    useState.mockImplementation(() => [draft, (update) => { draft = update(draft); }]);
    return AccessoryEditor({ accessory, accessories, services, slides, onClose });
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
    expect(nodes(page.render()).filter(({ type }) => type === 'th').map(text)).toEqual(['Name', 'Goes in', 'Min opening', 'Size', 'Report text', 'Price', 'Actions']);
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
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text)).toEqual(['New accessory', 'Section', '—', '—', 'New accessory', '—', 'EditCopyDelete']);
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td')[4].props.className).toContain('text-gray-500');
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
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text)).toEqual(['Lazy susan 28', 'Drawer box', '27" W · 22" D', '—', '6472-28 lazy susan', '—', 'EditCopyDelete']);
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

describe('IN13a step b accessory size and ordered length', () => {
  const orderedLength = 'Ordered length = section width −';
  const lineBoreRow = 'Needs a 3rd row of line bore with shelves (3rd row lb)';
  const cells = (page) => nodes(rows(page.render())[0]).filter(({ type }) => type === 'td');
  const fixedRod = () => ({ ...newAccessory([], 'rod'), name: 'Fixed rod',
    size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25,
    effects: [{ kind: 'line_bore_row' }] });

  it('creates Fixed rod with section width, fractional size, ordered length and a third line bore row', () => {
    const page = library();
    button(page.render(), 'New accessory').props.onClick();
    const props = nodes(page.render()).find(({ type }) => type === AccessoryEditor).props;
    const edit = editor(props.accessory, props.accessories);
    control(edit.render(), 'Name').props.onChange({ target: { value: 'Fixed rod' } });
    control(edit.render(), 'Section width').props.onChange({ target: { checked: true } });
    expect(control(edit.render(), 'Width').props).toMatchObject({ value: null, disabled: true, placeholder: 'Section width' });
    edit.enter('Height', '1 1/4');
    edit.enter('Depth', '1 1/4');
    edit.enter(orderedLength, '1/4');
    control(edit.render(), lineBoreRow).props.onChange({ target: { checked: true } });
    expect(text(edit.render())).toContain('For rods and other parts cut to the section. Leave blank if not cut to size.');
    expect(text(edit.render())).toContain('Used to draw the accessory. Min opening is still the smallest space it fits in.');
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0]).toMatchObject({
      name: 'Fixed rod', size: { width: 'section', height: 1.25, depth: 1.25 },
      lengthDeduction: 0.25, effects: [{ kind: 'line_bore_row' }],
    });
    const rowCells = cells(page);
    expect(text(rowCells[3])).toBe('section W · 1 1/4" H · 1 1/4" Dordered at section − 1/4"');
    expect(nodes(rowCells[3]).find(({ type }) => type === 'div').props.className).toContain('text-gray-400');
    expect(text(rowCells[1])).toBe('Section3rd row lb');
  });

  it('clears section-only values when switching Fixed rod to Drawer box and retains height and depth', () => {
    const edit = editor(fixedRod());
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    for (const label of ['Section width', orderedLength, lineBoreRow]) expect(control(edit.render(), label)).toBeUndefined();
    expect(control(edit.render(), 'Width').props).toMatchObject({ value: null, disabled: false });
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.accessory).toMatchObject({
      attachesTo: 'drawer_box', size: { width: null, height: 1.25, depth: 1.25 }, lengthDeduction: null, effects: [],
    });
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'section' } });
    expect(control(edit.render(), 'Section width').props.checked).toBe(false);
    expect(control(edit.render(), orderedLength).props.value).toBeNull();
    expect(control(edit.render(), lineBoreRow).props.checked).toBe(false);
  });

  it('saves Robe hook fixed dimensions in W, H, D order without an ordered-length line', () => {
    const accessory = { ...newAccessory([], 'hook'), name: 'Robe hook' };
    const page = library('local', [accessory]);
    const edit = editor(accessory);
    edit.enter('Width', '3');
    edit.enter('Height', '2');
    edit.enter('Depth', '3');
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0].size).toEqual({ width: 3, height: 2, depth: 3 });
    expect(text(cells(page)[3])).toBe('3" W · 2" H · 3" D');
    expect(nodes(cells(page)[3]).some(({ type }) => type === 'div')).toBe(false);
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0].size.width).toBe(3);
  });

  it('accepts zero ordered-length deduction as the full section width and clears a blank deduction', () => {
    const accessory = newAccessory([], 'full-length');
    const page = library('local', [accessory]);
    const edit = editor(accessory);
    edit.enter(orderedLength, '0');
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0].lengthDeduction).toBe(0);
    expect(text(cells(page)[3])).toBe('—ordered at section width');
    edit.enter(orderedLength, '');
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0].lengthDeduction).toBeNull();
    expect(text(cells(page)[3])).toBe('—');
  });

  it('shows blank size fields for a legacy accessory loaded with defaults and saves it unchanged', () => {
    const legacy = { ...newAccessory([], 'old'), name: 'Old accessory' };
    delete legacy.size;
    delete legacy.lengthDeduction;
    const accessory = withAccessoryDefaults(legacy);
    const page = library('local', [accessory]);
    const edit = editor(accessory);
    expect(text(cells(page)[3])).toBe('—');
    for (const label of ['Width', 'Height', 'Depth', orderedLength]) {
      const field = control(edit.render(), label);
      expect(field.props.value).toBeNull();
      useState.mockImplementationOnce((initial) => [initial(), vi.fn()]);
      expect(InchInput(field.props).props.value).toBe('');
    }
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0]).toEqual(accessory);
  });

  it('rejects invalid dimensions and deductions, clears blank sizes, and unticks section options', () => {
    const edit = editor(fixedRod());
    control(edit.render(), 'Section width').props.onChange({ target: { checked: false } });
    expect(control(edit.render(), 'Width').props).toMatchObject({ value: null, disabled: false });
    for (const label of ['Width', 'Height', 'Depth']) {
      edit.enter(label, '2 1/2');
      for (const invalid of ['0', '-1', 'nonsense', 'Infinity']) edit.enter(label, invalid);
      expect(control(edit.render(), label).props.value).toBe(2.5);
      for (const invalid of [NaN, Infinity, -Infinity]) expect(control(edit.render(), label).props.onCommit(invalid)).toBe(false);
      edit.enter(label, '');
      expect(control(edit.render(), label).props.value).toBeNull();
    }
    for (const invalid of ['-1', 'nonsense', 'Infinity']) edit.enter(orderedLength, invalid);
    for (const invalid of [NaN, Infinity, -Infinity]) expect(control(edit.render(), orderedLength).props.onCommit(invalid)).toBe(false);
    expect(control(edit.render(), orderedLength).props.value).toBe(0.25);
    control(edit.render(), lineBoreRow).props.onChange({ target: { checked: false } });
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.accessory).toMatchObject({
      size: { width: null, height: null, depth: null }, effects: [], lengthDeduction: 0.25,
    });
    expect(text(library('local', [{ ...fixedRod(), size: { width: null, height: 2, depth: null } }]).render())).toContain('2" Hordered at section − 1/4"');
  });
});

describe('IN12c step b drawer box effects editor', () => {
  const options = (tree, label) => nodes(control(tree, label)).filter(({ type }) => type === 'option');
  const add = (edit, kind) => control(edit.render(), 'Add effect').props.onChange({ target: { value: kind } });
  const boxAccessory = (effects = []) => ({ ...newAccessory([], 'box'), attachesTo: 'drawer_box', effects });
  const slides = [{ id: 'blum', name: 'Blum' }, { id: 'accuride-4034', name: 'Accuride 4034' }];

  it('adds and saves Clear behind on a new drawer-box accessory and shows its summary in Goes in', () => {
    const page = library();
    button(page.render(), 'New accessory').props.onClick();
    const props = nodes(page.render()).find(({ type }) => type === AccessoryEditor).props;
    const edit = editor(props.accessory, props.accessories);
    expect(control(edit.render(), 'Drawer box effects')).toBeUndefined();
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    const tree = edit.render();
    expect(text(tree)).toContain('The drawer box sizes from these. A typed size on a box still wins, with a warning.');
    expect(options(tree, 'Add effect').map(text)).toEqual(['Add effect…', 'Clear behind', 'Max depth', 'Max height', 'Fixed height', 'Slide', 'ProBox note']);
    expect(options(tree, 'Add effect').find(({ props }) => props.value === 'slide').props.disabled).toBe(true);
    add(edit, 'slide');
    expect(control(edit.render(), 'Slide')).toBeUndefined();
    add(edit, 'clear_behind');
    expect(control(edit.render(), 'Clear behind').props.value).toBe(2);
    expect(text(edit.render())).toContain('2" clear behind');
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0].effects).toEqual([{ kind: 'clear_behind', inches: 2 }]);
    const cell = nodes(rows(page.render())[0]).filter(({ type }) => type === 'td')[1];
    expect(text(cell)).toBe('Drawer box2" clear behind');
    expect(nodes(cell).find(({ type }) => type === 'div').props.className).toContain('text-gray-400');
  });

  it('excludes both height kinds while one is present, restores them on removal, and saves positive fractional sizes in order', () => {
    const edit = editor(boxAccessory());
    add(edit, 'fixed_height');
    expect(control(edit.render(), 'Fixed height').props.value).toBe(4.25);
    expect(options(edit.render(), 'Add effect').map(text)).not.toContain('Max height');
    expect(options(edit.render(), 'Add effect').map(text)).not.toContain('Fixed height');
    control(edit.render(), 'Remove Fixed height').props.onClick();
    expect(options(edit.render(), 'Add effect').map(text)).toEqual(expect.arrayContaining(['Max height', 'Fixed height']));
    add(edit, 'max_depth');
    add(edit, 'max_height');
    add(edit, 'clear_behind');
    expect(control(edit.render(), 'Max depth').props.value).toBe(18);
    expect(control(edit.render(), 'Max height').props.value).toBe(4.25);
    expect(options(edit.render(), 'Add effect').map(text)).not.toContain('Fixed height');
    edit.enter('Max height', '3 1/4');
    for (const invalid of ['0', '-2', 'nonsense', '']) edit.enter('Max height', invalid);
    expect(control(edit.render(), 'Max height').props.value).toBe(3.25);
    expect(nodes(edit.render()).filter(({ type }) => type === InchInput).slice(6).map(({ props }) => props['aria-label']))
      .toEqual(['Max depth', 'Max height', 'Clear behind']);
    button(edit.render(), 'Save').props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.accessory;
    expect(saved.effects).toEqual([{ kind: 'max_depth', inches: 18 }, { kind: 'max_height', inches: 3.25 }, { kind: 'clear_behind', inches: 2 }]);
    expect(text(library('local', [saved]).render())).toContain('max 18" deep · max 3 1/4" tall · 2" clear behind');
  });

  it('requires a ProBox note to be filled or removed, trims it on save, and limits the text input to 120 characters', () => {
    const edit = editor(boxAccessory());
    add(edit, 'probox_note');
    expect(button(edit.render(), 'Save').props.disabled).toBe(true);
    expect(text(edit.render())).toContain('Fill in or remove the ProBox note');
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch).not.toHaveBeenCalled();
    expect(control(edit.render(), 'ProBox note').props.maxLength).toBe(120);
    control(edit.render(), 'ProBox note').props.onChange({ target: { value: '   ' } });
    expect(text(edit.render())).toContain('Fill in or remove the ProBox note');
    control(edit.render(), 'ProBox note').props.onChange({ target: { value: '1/2" bottom' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    control(edit.render(), 'ProBox note').props.onChange({ target: { value: ' 1/2" bottom ' } });
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.accessory.effects).toEqual([{ kind: 'probox_note', text: '1/2" bottom' }]);
    control(edit.render(), 'Remove ProBox note').props.onClick();
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    expect(options(edit.render(), 'Add effect').map(text)).toContain('ProBox note');
  });

  it('uses Library slide names, defaults to the first slide, and clears effects when switching to Section', () => {
    const accessory = boxAccessory();
    const page = library('local', [accessory], [], slides);
    button(page.render(), 'Edit').props.onClick();
    expect(nodes(page.render()).find(({ type }) => type === AccessoryEditor).props.slides).toEqual(slides);
    const edit = editor(accessory, [accessory], [], slides);
    add(edit, 'slide');
    expect(control(edit.render(), 'Slide').props.value).toBe('blum');
    expect(options(edit.render(), 'Slide').map(text)).toEqual(['Blum', 'Accuride 4034']);
    control(edit.render(), 'Slide').props.onChange({ target: { value: 'accuride-4034' } });
    expect(control(edit.render(), 'Slide').props.value).toBe('accuride-4034');
    expect(text(edit.render())).toContain('Accuride 4034');
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'section' } });
    expect(nodes(edit.render()).some(({ type }) => type === AccessoryEffectsFields)).toBe(false);
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.accessories[0]).toMatchObject({ attachesTo: 'section', effects: [] });
    control(edit.render(), 'Goes in').props.onChange({ target: { value: 'drawer_box' } });
    expect(control(edit.render(), 'Slide')).toBeUndefined();
  });

  it('shows a stored missing slide first in the select and in the page summary, retaining it until replaced', () => {
    const accessory = boxAccessory([{ kind: 'slide', slideId: 'gone' }]);
    const edit = editor(accessory, [accessory], [], slides);
    expect(control(edit.render(), 'Slide').props.value).toBe('gone');
    expect(options(edit.render(), 'Slide').map(text)).toEqual(['Missing slide', 'Blum', 'Accuride 4034']);
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    button(edit.render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.accessory.effects).toEqual(accessory.effects);
    const page = library('local', [accessory], [], slides);
    expect(text(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td')[1])).toBe('Drawer boxMissing slide');
    control(edit.render(), 'Slide').props.onChange({ target: { value: 'accuride-4034' } });
    expect(options(edit.render(), 'Slide').map(text)).toEqual(['Blum', 'Accuride 4034']);
  });
});
