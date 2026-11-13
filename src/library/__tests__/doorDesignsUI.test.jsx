import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../elevation/model/doorStyles.js';
import { isDoorDesign } from '../../elevation/model/doorDesigns.js';
import { deleteDoorDesign } from '../../elevation/store/elevationSlice.js';
import InchInput from '../../elevation/components/InchInput.jsx';
import DoorDesignEditor from '../DoorDesignEditor.jsx';
import DoorDesignsPage from '../DoorDesignsPage.jsx';
import { MICRO_SHAKER } from '../../elevation/model/__tests__/fixtures/microShakerDesign.js';

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

function library(settings, source) {
  const values = [];
  useSelector.mockImplementation((selector) => selector({ elevation: { settings, source } }));
  return () => {
    let index = 0;
    useState.mockImplementation((initial) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (value) => { values[slot] = value; }];
    });
    return DoorDesignsPage();
  };
}

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

