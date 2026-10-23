import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { isMidLayout } from '../../model/midLayout.js';
import InchInput from '../InchInput.jsx';
import MidLayoutFields from '../properties/MidLayoutFields.jsx';
import PartStyleFields from '../properties/PartStyleFields.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));

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

describe('MR3b panels editor', () => {
  it('anchor 1: splits the 24 × 33 opening into three 9-inch panels, listed top first', () => {
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

  it('anchor 2: moves MR1 to 16, stores 11.5 on child 0 and re-shares the upper panels', () => {
    const ui = editor();
    ui.splitRows();
    expect(ui.commit('MR1 At', 16)).toBe(true);
    expect(ui.part().sizes.layout.children[0]).toEqual({ size: 11.5 });
    expect(ui.field('MR2 At').props.value).toBe(26.75);
    expect(ui.commit('MR1 At', 16)).toBe(false);
    expect(ui.commit('MR1 At', 4.5)).toBe(false);
    expect(ui.onChange).toHaveBeenCalledTimes(2);
  });

  it('anchor 3: splits the bottom panel into columns, edits its middle size and shows bounded mids', () => {
    const ui = editor();
    ui.splitRows();
    ui.select('root.0');
    ui.sections(3);
    ui.click('Split ↔');
    expect(ui.commit('Panel size root.0.1', 8)).toBe(true);
    expect(ui.part().sizes.layout.children[0]).toEqual({ split: 'cols', children: [{}, { size: 8 }, {}] });
    const fields = nodes(ui.render()).filter(({ props }) => props['aria-label']?.includes('Panel size root.0.'));
    expect(fields.map(({ props }) => props['aria-label'])).toEqual([
      'Door Panel size root.0.0', 'Door Panel size root.0.1', 'Door Panel size root.0.2',
    ]);
    expect(ui.field('Select root.0.1').props.style.paddingLeft).toBe(24);
    expect(text(ui.render())).toContain('Columns (3)');
    expect(text(ui.render()).match(/BR to MR1/g)).toHaveLength(2);
  });

  it('anchor 4: removes mids, dropping empty sizes and preserving unrelated size overrides', () => {
    for (const sizes of [undefined, { rails: { top: 4 }, notes: { top: 'keep' } }]) {
      const ui = editor({ sizes });
      ui.splitRows();
      ui.click('Remove mids');
      expect(ui.part()).toEqual(sizes ? { sizes } : {});
      expect(text(ui.render())).toContain('Mid rails');
      expect(ui.field('Sections').props.value).toBe(2);
    }
  });

  it('anchor 5: gives a slab with molding the same editor with no Width inputs or stored width effect', () => {
    const ui = editor({ slab: true, sizes: { layout: {
      split: 'rows', children: [{ split: 'cols', children: [{}, {}] }, {}], mids: [{ width: 5 }],
    } } });
    expect(nodes(ui.render()).filter(({ props }) => props['aria-label']?.endsWith(' Width'))).toEqual([]);
    expect(ui.field('MR1 At').props.value).toBe(19.5);
    expect(ui.commit('MR1 At', 20)).toBe(true);
    expect(ui.part().sizes.layout.children[0].size).toBe(20);
    expect(ui.field('MR1 At').props.value).toBe(20);
    ui.select('root.1');
    ui.click('Split ↕');
    expect(ui.part().sizes.layout.children).toHaveLength(3);
  });

  it('edits counts, widths and auto sizes, equalizes a node, removes children and starts with stiles', () => {
    const ui = editor();
    ui.sections(99);
    ui.field('Sections').props.onBlur();
    expect(ui.field('Sections').props.value).toBe(8);
    ui.sections(3);
    ui.click('Mid stiles');
    expect(ui.part().sizes.layout.split).toBe('cols');
    expect(ui.field('MS1 Width').props).toMatchObject({ value: null, placeholder: '3', allowBlank: true });
    expect(ui.commit('MS1 Width', 4)).toBe(true);
    expect(ui.part().sizes.layout.mids).toEqual([{ width: 4 }, {}]);
    expect(ui.commit('MS1 Width', 4)).toBe(false);
    expect(ui.commit('MS1 Width', 0)).toBe(false);
    expect(ui.commit('MS1 Width', null)).toBe(true);
    expect(ui.part().sizes.layout).not.toHaveProperty('mids');
    expect(ui.field('Panel size root.0').props).toMatchObject({ allowBlank: true, allowAuto: true, value: null });
    expect(ui.commit('Panel size root.0', null)).toBe(false);
    expect(ui.commit('Panel size root.0', -1)).toBe(false);
    expect(ui.commit('Panel size root.0', 5)).toBe(true);
    expect(ui.commit('Panel size root.0', null)).toBe(true);
    ui.commit('Panel size root.0', 5);
    ui.click('Equal');
    expect(ui.part().sizes.layout.children).toEqual([{}, {}, {}]);
    ui.sections(4);
    expect(ui.part().sizes.layout.children).toHaveLength(4);
    ui.select('root.3');
    ui.click('Remove');
    expect(ui.part().sizes.layout.children).toHaveLength(3);
    expect(ui.field('Select root').props['aria-pressed']).toBe(true);
    ui.sections(2);
    ui.select('root.0');
    ui.click('Remove');
    expect(ui.part()).not.toHaveProperty('sizes');
    ui.click('Mid rails');
    ui.sections(1);
    expect(ui.part()).not.toHaveProperty('sizes');
  });
});
