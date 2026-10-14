import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DOOR_DESIGNS } from '../../elevation/model/doorStyles.js';
import { isDoorDesign } from '../../elevation/model/doorDesigns.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import DoorDesignEditor from '../DoorDesignEditor.jsx';
import DoorDesignsPage from '../DoorDesignsPage.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useEffect: vi.fn(),
  useCallback: (callback) => callback,
  useRef: () => ({ current: null }),
  useId: () => 'design-editor',
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
const save = (tree) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === 'Save');
const dispatch = vi.fn();

function editor(design) {
  let draft = structuredClone(design);
  const designs = DOOR_DESIGNS.some(({ id }) => id === design.id) ? DOOR_DESIGNS : [...DOOR_DESIGNS, design];
  const render = () => {
    useState.mockImplementation(() => [draft, (update) => { draft = update(draft); }]);
    return DoorDesignEditor({ design, designs, onClose: vi.fn() });
  };
  // Exercise the real fraction parser and blank-input commit before the editor saves.
  const enter = (label, typed) => {
    const field = control(render(), label);
    expect(field.type).toBe(InchInput);
    useState.mockImplementationOnce(() => [typed, vi.fn()]);
    InchInput(field.props).props.onBlur();
  };
  return { render, enter };
}

beforeEach(() => {
  vi.clearAllMocks();
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({
    elevation: { settings: { doorDesigns: DOOR_DESIGNS }, rooms: [], source: 'local' },
  }));
});

describe('Step 529 Library door design cores and defaults', () => {
  it('lists 5PC, hardwood Slab, Slab - MDF Core and Micro Shaker without Slab AM', () => {
    const tree = DoorDesignsPage();
    const rows = nodes(tree).filter(({ type }) => type === 'tr');
    const contents = rows.map((row) => nodes(row).filter(({ type }) => type === 'td').map(text));
    expect(contents.slice(1).map((cells) => [cells[0], cells[3]])).toEqual([
      ['5PCbuilt-in', '5-piece'],
      ['Slabbuilt-in', 'Slab · Hardwood'],
      ['Slab - MDF Corebuilt-in', 'Slab · MDF core'],
      ['Micro Shakerbuilt-in', '5-piece'],
    ]);
    expect(text(tree)).not.toContain('Slab AM');
  });

  it('locks built-in cores and lets custom designs switch construction and save an MDF core', () => {
    for (const design of DOOR_DESIGNS) {
      const { render } = editor(design);
      expect(control(render(), 'Construction').props.disabled).toBe(true);
      if (design.construction === 'slab') {
        expect(control(render(), 'Core').props).toMatchObject({ value: design.slabCore, disabled: true });
        expect(control(render(), 'Core').props.children.map(text)).toEqual(['Hardwood', 'MDF core']);
      } else expect(control(render(), 'Core')).toBeUndefined();
    }
    const custom = { ...DOOR_DESIGNS[0], id: 'custom', code: 'Custom', panelJoint: 'square' };
    const { render } = editor(custom);
    expect(control(render(), 'Construction').props.disabled).toBe(false);
    expect(control(render(), 'Panel joint').props.value).toBe('square');
    control(render(), 'Construction').props.onChange({ target: { value: 'slab' } });
    expect(control(render(), 'Panel joint')).toBeUndefined();
    expect(control(render(), 'Core').props).toMatchObject({ value: 'hardwood', disabled: false });
    control(render(), 'Core').props.onChange({ target: { value: 'mdf' } });
    expect(save(render()).props.disabled).toBe(false);
    save(render()).props.onClick();
    const saved = dispatch.mock.lastCall[0].payload.design;
    expect(saved).toMatchObject({ construction: 'slab', slabCore: 'mdf', panelJoint: null, slots: ['outside', 'applied'] });
    expect(isDoorDesign(saved)).toBe(true);
    control(render(), 'Construction').props.onChange({ target: { value: 'five_piece' } });
    expect(control(render(), 'Core')).toBeUndefined();
    save(render()).props.onClick();
    expect(dispatch.mock.lastCall[0].payload.design).toMatchObject({ slabCore: null, panelJoint: 'curved' });
    expect(isDoorDesign(dispatch.mock.lastCall[0].payload.design)).toBe(true);
  });

  it('edits positive fractional defaults, clears blanks, and shows frame defaults only on 5-piece', () => {
    const { render, enter } = editor(DOOR_DESIGNS[0]);
    expect(text(render())).toContain('Defaults');
    expect(control(render(), 'Thickness').props.value).toBe(13 / 16);
    enter('Thickness', '1 1/8');
    enter('Stile & rail width', '2 3/4');
    enter('Panel thickness', '5/8');
    enter('Slab below', '4 13/16');
    for (const typed of ['0', '-1', 'not inches']) enter('Thickness', typed);
    expect(control(render(), 'Thickness').props.value).toBe(1.125);
    enter('Slab below', '');
    save(render()).props.onClick();
    expect(dispatch.mock.lastCall[0].payload.design.defaults).toEqual({
      thickness: 1.125, stileWidth: 2.75, panelThickness: 0.625,
    });
    for (const design of DOOR_DESIGNS.filter(({ construction }) => construction === 'slab')) {
      const slab = editor(design);
      expect(control(slab.render(), 'Stile & rail width')).toBeUndefined();
      expect(control(slab.render(), 'Panel thickness')).toBeUndefined();
      expect(control(slab.render(), 'Slab below').props.value).toBeNull();
      slab.enter('Thickness', '');
      slab.enter('Slab below', '5 1/4');
      save(slab.render()).props.onClick();
      expect(dispatch.mock.lastCall[0].payload.design.defaults).toEqual({ slabBelow: 5.25 });
    }
  });
});

it('530. locks built-in panel joints and lets a custom 5-piece save either joint', () => {
  for (const design of DOOR_DESIGNS.filter(({ construction }) => construction === 'five_piece')) {
    const { render } = editor(design);
    expect(control(render(), 'Panel joint').props).toMatchObject({ value: design.panelJoint, disabled: true });
    save(render()).props.onClick();
    expect(dispatch.mock.lastCall[0].payload.design.panelJoint).toBe(design.panelJoint);
  }
  const custom = { ...DOOR_DESIGNS[3], id: 'custom', code: 'Micro copy' };
  const { render } = editor(custom);
  const joint = control(render(), 'Panel joint');
  expect(joint.props).toMatchObject({ value: 'square', disabled: false });
  expect(joint.props.children.map(({ props }) => [props.value, text(props.children)]))
    .toEqual([['curved', 'Standard (tongue + curve)'], ['square', 'Square shoulder (micro)']]);
  for (const panelJoint of ['curved', 'square']) {
    control(render(), 'Panel joint').props.onChange({ target: { value: panelJoint } });
    expect(save(render()).props.disabled).toBe(false);
    save(render()).props.onClick();
    expect(dispatch.mock.lastCall[0].payload.design).toMatchObject({ construction: 'five_piece', panelJoint });
    expect(isDoorDesign(dispatch.mock.lastCall[0].payload.design)).toBe(true);
  }
});
