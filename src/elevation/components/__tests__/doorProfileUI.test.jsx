import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Rect } from 'react-konva';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import DoorProfilePickers from '../DoorProfilePickers.jsx';
import DoorStyleFields from '../DoorStyleFields.jsx';
import InchInput from '../InchInput.jsx';
import TextInput from '../TextInput.jsx';

// Inspect component output and invoke its UI callbacks without a browser or canvas runtime.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(),
  useState: vi.fn(),
  useReducer: vi.fn(),
  useEffect: vi.fn(),
  useImperativeHandle: vi.fn(),
  useCallback: (callback) => callback,
  useRef: (current) => ({ current }),
  useId: () => 'test-mask',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({ Rect: 'rect', Text: 'text' }));

const line = (from, to) => ({ type: 'line', from, to });
const bead = {
  id: 'bead', name: 'Bead', kind: 'door_outside', version: 1, archived: false,
  drawnPoints: { elevation: ['a'] },
  geometry: {
    units: 'in', points: { a: [-0.3125, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
    loops: [{ id: 'L1', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
  },
};
const { profiles: moldingFixtures } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const tm3 = moldingFixtures.find(({ id }) => id === 'tm3');
const dispatch = vi.fn();
let settings;

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const text = (tree) => {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
};
const checkbox = (tree) => find(tree, ({ props }) => props.type === 'checkbox');

beforeEach(() => {
  vi.clearAllMocks();
  settings = { sectionProfiles: [bead] };
  useSelector.mockImplementation((selector) => selector({ elevation: { settings } }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useReducer.mockImplementation((reducer, initial, init) => [init(initial), vi.fn()]);
});

describe('RP1 b door style material', () => {
  it('trims material on blur, removes blanks and rejects overlong text in room and team styles (anchor 3)', () => {
    for (const base of [DEFAULT_DOOR_STYLE, { ...DEFAULT_DOOR_STYLE, id: 'a', label: 'A' }]) {
      let draft = structuredClone(base);
      let typed = '';
      const setDraft = (update) => { draft = update(draft); };
      const input = () => {
        const tree = DoorStyleFields({ draft, setDraft, designs: DOOR_DESIGNS });
        const fields = nodes(tree);
        const material = find(tree, ({ props }) => props['aria-label'] === 'Material');
        expect(material.type).toBe(TextInput);
        expect(fields.indexOf(material)).toBeGreaterThan(fields.indexOf(find(tree, ({ props }) => props['aria-label'] === 'Design')));
        expect(fields.indexOf(material)).toBeLessThan(fields.indexOf(find(tree, ({ props }) => props.label === 'Thickness')));
        useState.mockReturnValueOnce([typed, (value) => { typed = value; }]);
        return TextInput(material.props);
      };
      const commit = (value) => {
        input().props.onChange({ target: { value } });
        input().props.onBlur();
      };
      expect(input().props).toMatchObject({ type: 'text', value: '', placeholder: 'Room wood' });
      input().props.onChange({ target: { value: '  MAPLE/MDF ' } });
      expect(input().props.value).toBe('  MAPLE/MDF ');
      expect(draft).not.toHaveProperty('material');
      input().props.onBlur();
      expect(draft.material).toBe('MAPLE/MDF');
      expect(input().props.value).toBe('MAPLE/MDF');
      commit('x'.repeat(121));
      expect(draft.material).toBe('MAPLE/MDF');
      expect(input().props.value).toBe('MAPLE/MDF');
      commit(` ${'x'.repeat(120)} `);
      expect(draft.material).toBe('x'.repeat(120));
      commit('   ');
      expect(draft).not.toHaveProperty('material');
      expect(input().props.value).toBe('');
    }
  });
});

describe('MR1c mid width fields', () => {
  const field = (tree, label) => {
    const component = find(tree, ({ props }) => props.label === label);
    return find(component.type(component.props), ({ type }) => type === InchInput);
  };

  it('anchor 4: commits positive mid widths and removes cleared keys in team and room styles', () => {
    for (const base of [DEFAULT_DOOR_STYLE, { ...DEFAULT_DOOR_STYLE, id: 'a', label: 'A' }]) {
      let draft = structuredClone(base);
      let typed = '';
      const setDraft = (update) => { draft = update(draft); };
      const input = (label) => {
        const tree = DoorStyleFields({ draft, setDraft, designs: DOOR_DESIGNS });
        const mid = field(tree, label);
        useState.mockReturnValueOnce([typed, (value) => { typed = value; }]);
        return InchInput(mid.props);
      };
      const commit = (label, value) => {
        input(label).props.onChange({ target: { value } });
        input(label).props.onBlur();
      };
      commit('Mid stile', '4');
      expect(draft.mid).toEqual({ stile: 4 });
      commit('Mid stile', '');
      expect(draft.mid).toEqual({});
      commit('Mid rail', '3 1/2');
      commit('Mid stile', '4');
      expect(draft.mid).toEqual({ rail: 3.5, stile: 4 });
      for (const invalid of ['0', '-1', 'invalid']) {
        commit('Mid stile', invalid);
        expect(draft.mid).toEqual({ rail: 3.5, stile: 4 });
      }
      commit('Mid stile', '');
      expect(draft.mid).toEqual({ rail: 3.5 });
      commit('Mid rail', '');
      expect(draft.mid).toEqual({});
    }
  });
});

describe('Step 484 applied moldings editor', () => {
  const control = (tree, label) => find(tree, ({ props }) => props['aria-label'] === label);
  const add = (tree) => find(tree, ({ type, props }) => type === 'button' && props.children === 'Add molding');
  const offsetInput = (tree, index) => {
    const field = control(tree, `Applied molding ${index + 1} offset`);
    return field.type(field.props);
  };

  it('retains partial text while typing, accepts signed finite inches, and restores invalid input on blur', () => {
    let draft = { ...DEFAULT_DOOR_STYLE, appliedMoldings: [{ profileId: null, offset: 0 }] };
    let typed = '0';
    let effectValue;
    useState.mockImplementation(() => [typed, (next) => { typed = typeof next === 'function' ? next(typed) : next; }]);
    const render = () => {
      const tree = DoorProfilePickers({ draft, design: DOOR_DESIGNS[0], setDraft: (update) => { draft = update(draft); } });
      useEffect.mockClear();
      const input = offsetInput(tree, 0);
      if (effectValue !== draft.appliedMoldings[0].offset) {
        effectValue = draft.appliedMoldings[0].offset;
        useEffect.mock.lastCall[0]();
      }
      return input;
    };
    for (const [entry, expected] of [['1 ', 1], ['1 1/', 1], ['1 1/2', 1.5], ['+1/4', 0.25], ['-1 1/2', -1.5], ['0', 0], ['0.123', 0.123]]) {
      render().props.onChange({ target: { value: entry } });
      expect(draft.appliedMoldings[0].offset).toBe(expected);
      // A value-driven effect must not reformat text and disrupt fraction entry.
      render();
      expect(typed).toBe(entry);
    }
    for (const entry of ['', '-', 'garbage', 'Infinity', '1/0']) {
      render().props.onChange({ target: { value: entry } });
      expect(typed).toBe(entry);
      expect(draft.appliedMoldings[0].offset).toBe(0.123);
      render().props.onBlur();
      expect(typed).toBe('0.123');
    }
  });
});

