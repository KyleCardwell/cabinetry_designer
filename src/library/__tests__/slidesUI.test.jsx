import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BUILT_IN_SLIDES, isSlideList, newSlide } from '../../elevation/model/slides.js';
import elevationReducer, { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import SlideEditor from '../SlideEditor.jsx';
import SlidesPage from '../SlidesPage.jsx';
import PricingFields from '../PricingFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: (callback) => callback,
  useRef: vi.fn(),
  useId: () => 'slide-editor',
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

function library(source = 'local', slides = BUILT_IN_SLIDES, teamServices = []) {
  let state = createInitialElevationState();
  state = { ...state, source, teamServices, settings: { ...state.settings, slides } };
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
    return SlidesPage();
  };
  return { render, state: () => state };
}

function editor(slide, slides = [...BUILT_IN_SLIDES, slide], services = []) {
  let draft = structuredClone(slide);
  const onClose = vi.fn();
  const render = () => {
    useState.mockImplementation(() => [draft, (update) => { draft = update(draft); }]);
    return SlideEditor({ slide, slides, services, onClose });
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

describe('IN4b step b Slides page and editor', () => {
  it('IN4c a: edits fractional back clearance, permits zero and rejects negatives', () => {
    const edit = editor(BUILT_IN_SLIDES[0], BUILT_IN_SLIDES);
    const label = 'Back clearance (behind box)';
    expect(control(edit.render(), label).props.value).toBe(0.75);
    edit.enter(label, '1 1/4');
    expect(control(edit.render(), label).props.value).toBe(1.25);
    edit.enter(label, '-1/4');
    expect(control(edit.render(), label).props.value).toBe(1.25);
    edit.enter(label, '0');
    expect(control(edit.render(), label).props.value).toBe(0);
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
    button(edit.render(), 'Save').props.onClick();
    const saved = elevationReducer(createInitialElevationState(), dispatch.mock.lastCall[0]);
    expect(saved.settings.slides[0].backClearance).toBe(0);
  });

  it('saves built-in Blum price and cost per pair with Shop minutes and formats the row price', () => {
    const services = [{ id: 7, name: 'Shop', active: true }];
    const page = library('cloud', BUILT_IN_SLIDES, services);
    button(rows(page.render())[0], 'Edit').props.onClick();
    const dialog = nodes(page.render()).find(({ type }) => type === SlideEditor);
    expect(dialog.props.services).toEqual(services);
    const edit = editor(dialog.props.slide, dialog.props.slides, dialog.props.services);
    let fields = pricing(edit.render());
    expect(control(fields, 'Priced by')).toBeUndefined();
    expect(money(fields, 'Price per pair').props.disabled).toBe(false);
    expect(money(fields, 'Actual cost per pair').props.disabled).toBe(false);
    expect(text(fields)).toContain('Labour (minutes per pair)');
    money(fields, 'Price per pair').props.onChange({ target: { value: '38' } });
    money(pricing(edit.render()), 'Actual cost per pair').props.onChange({ target: { value: '24.5' } });
    control(pricing(edit.render()), 'Add service').props.onChange({ target: { value: '7' } });
    fields = pricing(edit.render());
    expect(control(fields, 'Minutes for Shop').props.value).toBe(0);
    control(fields, 'Minutes for Shop').props.onChange({ target: { value: '3' } });
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.slides[0]).toEqual({ ...BUILT_IN_SLIDES[0], price: 38, actualCost: 24.5, labor: { '7': 3 } });
    expect(nodes(rows(page.render())[0]).filter(({ type }) => type === 'td').map(text).at(-2)).toBe('$38.00 a pair');
    expect(page.state().settings.slides[0]).not.toHaveProperty('pricing');
    money(pricing(edit.render()), 'Actual cost per pair').props.onChange({ target: { value: '-1' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(true);
    money(pricing(edit.render()), 'Actual cost per pair').props.onChange({ target: { value: '' } });
    expect(button(edit.render(), 'Save').props.disabled).toBe(false);
  });

  it('disables adding labour without sandbox services while allowing slide prices and costs', () => {
    const page = library();
    button(rows(page.render())[0], 'Edit').props.onClick();
    const dialog = nodes(page.render()).find(({ type }) => type === SlideEditor);
    const edit = editor(dialog.props.slide, dialog.props.slides, dialog.props.services);
    const fields = pricing(edit.render());
    expect(control(fields, 'Add service').props.disabled).toBe(true);
    expect(text(fields)).toContain("Services load with the shop's data.");
    expect(money(fields, 'Price per pair').props.disabled).toBe(false);
    expect(money(fields, 'Actual cost per pair').props.disabled).toBe(false);
    money(fields, 'Price per pair').props.onChange({ target: { value: '38' } });
    money(pricing(edit.render()), 'Actual cost per pair').props.onChange({ target: { value: '24.5' } });
    button(edit.render(), 'Save').props.onClick();
    expect(page.state().settings.slides[0]).toMatchObject({ price: 38, actualCost: 24.5, labor: {} });
  });

  it('shows three protected built-ins with exact mounts, lengths and clearances, and formats a single length', () => {
    const { render } = library();
    expect(nodes(render()).filter(({ type }) => type === 'th').map(text)).toEqual(['Name', 'Mount', 'Lengths', 'Clearances', 'Price', 'Actions']);
    expect(text(render())).toContain('Drawer slides for drawer boxes and roll-outs. Sizes come from the slide.');
    expect(rows(render()).map((row) => nodes(row).filter(({ type }) => type === 'td').map(text))).toEqual([
      ['Blum Tandem 562Hbuilt-in', 'Undermount', '9"–36" (10)', '1/4" per side · 9/16" below · 1/4" above', '—', 'EditCopy'],
      ['Accuride 3832built-in', 'Side mount', '8"–36" (15)', '1/2" per side · 9/16" below · 1/4" above', '—', 'EditCopy'],
      ['Accuride 4034built-in', 'Side mount', '8"–36" (15)', '1/2" per side · 9/16" below · 1/4" above', '—', 'EditCopy'],
    ]);
    const custom = { ...newSlide(BUILT_IN_SLIDES, BUILT_IN_SLIDES[0], 'custom'), lengths: [{ nominal: 15 }] };
    const single = library('local', [...BUILT_IN_SLIDES, custom]);
    expect(nodes(rows(single.render())[3]).filter(({ type }) => type === 'td').map(text)[2]).toBe('15"');
  });

  it('opens New slide on the Blum copy and copies the 4034 row without opening an editor', () => {
    const page = library();
    button(page.render(), 'New slide').props.onClick();
    expect(page.state().settings.slides).toHaveLength(4);
    const dialog = nodes(page.render()).find(({ type }) => type === SlideEditor);
    expect(dialog.props.slide.name).toBe('Blum Tandem 562H copy');
    dialog.props.onClose();
    button(rows(page.render())[2], 'Copy').props.onClick();
    expect(page.state().settings.slides[4].name).toBe('Accuride 4034 copy');
    expect(nodes(page.render()).some(({ type }) => type === SlideEditor)).toBe(false);
    button(rows(page.render())[0], 'Edit').props.onClick();
    expect(nodes(page.render()).find(({ type }) => type === SlideEditor).props.slide.id).toBe('blum-562h');
  });

  it('validates names and duplicate lengths, adds the last gap, and edits text, flags and fractional dimensions', () => {
    const custom = { ...newSlide(BUILT_IN_SLIDES, BUILT_IN_SLIDES[0], 'custom'), hardwareSlideId: 42 };
    const { render, enter, onClose } = editor(custom);
    control(render(), 'Name').props.onChange({ target: { value: '  ' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name is required');
    control(render(), 'Name').props.onChange({ target: { value: 'ACCURIDE 3832' } });
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Name already used');
    button(render(), 'Save').props.onClick();
    expect(dispatch).not.toHaveBeenCalled();
    control(render(), 'Name').props.onChange({ target: { value: ' Shop slide ' } });
    button(render(), 'Add length').props.onClick();
    expect(control(render(), 'Nominal 11').props.value).toBe(39);
    enter('Nominal 11', '36');
    expect(button(render(), 'Save').props.disabled).toBe(true);
    expect(text(render())).toContain('Each length can only be listed once');
    control(render(), 'Remove length 11').props.onClick();
    expect(button(render(), 'Save').props.disabled).toBe(false);
    for (const label of ['Brand', 'Model', 'Description']) {
      control(render(), label).props.onChange({ target: { value: ` Shop ${label} ` } });
    }
    expect(control(render(), 'Mount').props.disabled).toBe(false);
    control(render(), 'Mount').props.onChange({ target: { value: 'side' } });
    for (const label of ['Clips', 'Soft close']) control(render(), label).props.onChange({ target: { checked: false } });
    control(render(), 'Heavy duty').props.onChange({ target: { checked: true } });
    for (const label of ['Side clearance (per side)', 'Min below', 'Min above']) enter(label, '0');
    for (const typed of ['0', '-1', 'nonsense', '']) enter('Slide height', typed);
    expect(control(render(), 'Slide height').props.value).toBe(1);
    enter('Slide height', '1 51/64');
    expect(control(render(), 'Slide height').props.value).toBe(1.796875);
    expect(control(render(), 'Slide height').props.displayStep).toBe(1 / 64);
    enter('Length 3', '');
    enter('Extension 3', '');
    enter('Length 1', '9 33/64');
    enter('Extension 1', '8 61/64');
    for (const typed of ['0', '-1', 'nonsense', '']) enter('Nominal 1', typed);
    expect(control(render(), 'Nominal 1').props.value).toBe(9);
    button(render(), 'Save').props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.slide;
    expect(saved).toMatchObject({
      id: 'custom', name: 'Shop slide', brand: 'Shop Brand', model: 'Shop Model', description: 'Shop Description',
      mount: 'side', sideClearance: 0, minBelow: 0, minAbove: 0, height: 1.796875,
      clips: false, softClose: false, heavyDuty: true, hardwareSlideId: 42,
    });
    expect(saved.lengths[0]).toEqual({ nominal: 9, length: 9.515625, extension: 8.953125 });
    expect(saved.lengths[2]).toEqual({ nominal: 15 });
    expect(isSlideList([...BUILT_IN_SLIDES, saved])).toBe(true);
    expect(onClose).toHaveBeenCalled();
    const invalid = editor({ ...custom, height: 0 });
    expect(button(invalid.render(), 'Save').props.disabled).toBe(true);
    expect(text(invalid.render())).toContain('Not a valid slide');
    const one = editor({ ...custom, lengths: [{ nominal: 15 }] });
    expect(control(one.render(), 'Remove length 1').props.disabled).toBe(true);
    control(one.render(), 'Remove length 1').props.onClick();
    expect(control(one.render(), 'Nominal 1').props.value).toBe(15);
    button(one.render(), 'Add length').props.onClick();
    expect(control(one.render(), 'Nominal 2').props.value).toBe(16);
    const forty = editor({ ...custom, lengths: Array.from({ length: 40 }, (_, i) => ({ nominal: i + 1 })) });
    expect(button(forty.render(), 'Add length').props.disabled).toBe(true);
  });

  it('sorts edited built-in lengths with the mount locked, and confirms or cancels custom Delete/Archive', () => {
    const builtIn = editor(BUILT_IN_SLIDES[0], BUILT_IN_SLIDES);
    expect(control(builtIn.render(), 'Mount').props.disabled).toBe(true);
    for (let index = 10; index > 3; index -= 1) control(builtIn.render(), `Remove length ${index}`).props.onClick();
    builtIn.enter('Nominal 1', '12');
    builtIn.enter('Nominal 2', '9');
    builtIn.enter('Nominal 3', '15');
    button(builtIn.render(), 'Save').props.onClick();
    const resized = elevationReducer(createInitialElevationState(), dispatch.mock.lastCall[0]);
    expect(resized.settings.slides[0].lengths.map(({ nominal }) => nominal)).toEqual([9, 12, 15]);
    expect(resized.settings.slides[0]).toMatchObject({ id: 'blum-562h', mount: 'undermount' });
    const custom = newSlide(BUILT_IN_SLIDES, BUILT_IN_SLIDES[0], 'custom');
    for (const [source, label, confirm] of [['local', 'Delete', 'Confirm delete'], ['cloud', 'Archive', 'Confirm archive']]) {
      const page = library(source, [...BUILT_IN_SLIDES, custom]);
      dispatch.mockClear();
      for (const row of rows(page.render()).slice(0, 3)) expect(button(row, label)).toBeUndefined();
      button(page.render(), label).props.onClick();
      expect(dispatch).not.toHaveBeenCalled();
      expect(text(page.render())).toContain('Rooms that use it will ask for a replacement when opened.');
      button(page.render(), 'Cancel').props.onClick();
      expect(button(page.render(), confirm)).toBeUndefined();
      button(page.render(), label).props.onClick();
      button(page.render(), confirm).props.onClick();
      expect(page.state().settings.slides).toEqual(BUILT_IN_SLIDES);
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
      const { render, onClose } = editor(BUILT_IN_SLIDES[0], BUILT_IN_SLIDES);
      const tree = render();
      expect(nodes(tree).find(({ props }) => props.role === 'dialog').props).toMatchObject({ 'aria-modal': 'true', 'aria-labelledby': 'slide-editor' });
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
