import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { isMidLayout } from '../../model/midLayout.js';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import MidLayoutFields from '../properties/MidLayoutFields.jsx';
import PartStyleFields from '../properties/PartStyleFields.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);

function editor({ sizes, slab = false, style = {}, width = 30, height = 39 } = {}) {
  let part = sizes ? { sizes } : {};
  const hooks = [];
  let cursor;
  useState.mockImplementation((initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value) => { hooks[index] = value; }];
  });
  const onChange = vi.fn((patch) => {
    part = { ...part, ...patch };
    if (part.sizes === null) delete part.sizes;
    if (part.sizes?.layout) expect(isMidLayout(part.sizes.layout)).toBe(true);
  });
  const render = () => {
    const tree = PartStyleFields({
      room: {}, settings: {
        teamDoorStyle: {
          ...DEFAULT_DOOR_STYLE,
          ...(slab ? { designId: 'slab', appliedMoldings: [{ profileId: null, offset: 2 }] } : {}),
          ...style,
        },
        doorDesigns: DOOR_DESIGNS, sectionProfiles: [],
      },
      partType: 'door', levels: [], part, width, height, label: 'Door', onChange,
    });
    const component = nodes(tree).find(({ type }) => type === MidLayoutFields);
    cursor = 0;
    return MidLayoutFields(component.props);
  };
  const field = (label) => nodes(render()).find(({ props }) => props['aria-label'] === `Door ${label}`);
  const click = (label) => {
    const button = nodes(render()).find(({ type, props }) => type === 'button'
      && (text(props.children) === label || props['aria-label'] === `Door ${label}`));
    return button.props.onClick();
  };
  const sections = (value) => field('Sections').props.onChange({ target: { value: String(value) } });
  const select = (path) => field(`Select ${path}`).props.onClick();
  const commit = (label, value) => field(label).props.onCommit(value);
  const splitRows = () => { sections(3); click('Mid rails'); };
  return { render, field, click, sections, select, commit, splitRows, onChange, part: () => part };
}

beforeEach(() => vi.clearAllMocks());

describe('panels editor (MR3b)', () => {
  it('splits the 24 × 33 opening into three 9-inch panels, listed top first', () => {
    const ui = editor();
    expect(text(ui.render())).toContain('Panels24 × 33');
    expect(ui.field('Sections').props.value).toBe(2);
    ui.splitRows();
    const fields = nodes(ui.render()).filter(({ type }) => type === InchInput);
    expect(fields.map(({ props }) => props['aria-label'])).toEqual([
      'Door Panel size root.2', 'Door MR2 At', 'Door MR2 Width',
      'Door Panel size root.1', 'Door MR1 At', 'Door MR1 Width', 'Door Panel size root.0',
    ]);
    expect(fields.filter(({ props }) => props['aria-label'].includes('Panel size'))
      .map(({ props }) => props.placeholder)).toEqual(['9', '9', '9']);
    expect(ui.field('MR2 At').props.value).toBe(25.5);
    expect(ui.field('MR1 At').props.value).toBe(13.5);
    expect(ui.field('Select root.2').props.style.paddingLeft).toBe(12);
  });

  it('moves MR1 to 16, stores 11.5 on child 0 and re-shares the upper panels', () => {
    const ui = editor();
    ui.splitRows();
    expect(ui.commit('MR1 At', 16)).toBe(true);
    expect(ui.part().sizes.layout.children[0]).toEqual({ size: 11.5 });
    expect(ui.field('MR2 At').props.value).toBe(26.75);
    expect(ui.commit('MR1 At', 16)).toBe(false);
    expect(ui.commit('MR1 At', 4.5)).toBe(false);
    expect(ui.onChange).toHaveBeenCalledTimes(2);
  });

});

describe('copy / paste layout (MR5)', () => {
  const CASE_3 = { split: 'rows', children: [
    { split: 'cols', children: [{}, { size: 8 }, {}] }, { split: 'cols', children: [{}, {}] }, {},
  ] };
  let elevation;
  beforeEach(() => {
    elevation = elevationReducer(undefined, { type: '@@init' });
    useSelector.mockImplementation((selector) => selector({ elevation }));
    useDispatch.mockReturnValue((action) => { elevation = elevationReducer(elevation, action); });
  });
  const button = (ui, name) => nodes(ui.render()).find(({ type, props }) => type === 'button'
    && props['aria-label'] === `Door ${name}`);

  it('on a 26 × 39 door the typed 8" holds and the auto panels re-share', () => {
    editor({ sizes: { layout: CASE_3 } }).click('Copy layout');
    const ui = editor({ width: 26 });
    ui.click('Paste layout');
    const resolved = nodes(PartStyleFields({
      room: {}, settings: { teamDoorStyle: DEFAULT_DOOR_STYLE, doorDesigns: DOOR_DESIGNS, sectionProfiles: [] },
      partType: 'door', levels: [], part: ui.part(), width: 26, height: 39, label: 'Door', onChange: () => {},
    })).find(({ type }) => type === MidLayoutFields).props.resolved;
    const width = (path) => resolved.nodes.find((node) => node.path === path).width;
    expect([width('root.0.0'), width('root.0.1'), width('root.0.2')]).toEqual([3, 8, 3]);
    expect([width('root.1.0'), width('root.1.1')]).toEqual([8.5, 8.5]);
    expect(resolved.panels).toHaveLength(6);
  });

});
