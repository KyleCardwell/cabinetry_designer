import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { newAccessory, withAccessoryDefaults } from '../../elevation/model/accessories.js';
import { newShape, isShape } from '../../elevation/model/libraryShapes.js';
import elevationReducer, { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import AccessoryEditor from '../AccessoryEditor.jsx';
import AccessoryEffectsFields from '../AccessoryEffectsFields.jsx';
import AccessoriesPage from '../AccessoriesPage.jsx';
import PricingFields from '../PricingFields.jsx';
import ShapeEditor from '../shapeEditor/ShapeEditor.jsx';

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

function library(source = 'local', accessories = [], teamServices = [], slides, shapes = []) {
  let state = createInitialElevationState();
  state = { ...state, source, teamServices, settings: { ...state.settings, accessories, shapes, ...(slides ? { slides } : {}) } };
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
  const values = [];
  const onClose = vi.fn();
  const render = () => {
    let index = 0;
    useState.mockImplementation((initial) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
      return [values[slot], (update) => { values[slot] = typeof update === 'function' ? update(values[slot]) : update; }];
    });
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
  useSelector.mockImplementation((selector) => selector({ elevation: createInitialElevationState() }));
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

});

