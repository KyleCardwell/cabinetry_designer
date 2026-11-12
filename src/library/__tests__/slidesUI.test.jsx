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

});
