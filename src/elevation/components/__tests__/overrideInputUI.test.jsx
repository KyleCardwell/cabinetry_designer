import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import InchInput from '../InchInput.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import { controlBorder, LEVEL_LABELS, overrideTitle, sourceLabel } from '../overrideHelpers.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, type) => nodes(tree).find((node) => node.type === type);
const render = (props) => OverrideField(OverrideInput({ kind: 'number', label: 'Reveal', inherited: 0.25, ...props }).props);
const input = (tree) => InchInput(find(tree, InchInput).props);
const reset = (tree) => find(tree, 'button');
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]);

beforeEach(() => {
  vi.clearAllMocks();
  let text;
  useState.mockImplementation((initial) => {
    if (text === undefined) text = typeof initial === 'function' ? initial() : initial;
    return [text, (next) => { text = next; }];
  });
});

describe('DB2 a override field and input', () => {
  it('anchor 1: names inherited sources, including future project and phase levels', () => {
    expect(sourceLabel({ level: 'team' })).toBe('Shop standard');
    expect(sourceLabel({ level: 'default' })).toBe('Built-in default');
    expect(sourceLabel({ level: 'room', id: 'r1' })).toBe('Room');
    expect(LEVEL_LABELS.project).toBe('Project');
    expect(LEVEL_LABELS.phase).toBe('Phase');
    expect(overrideTitle({ level: 'phase', overridden: true, source: { level: 'project' }, inheritedText: 'On' }))
      .toBe('Phase override · Project: On');
  });

  it('anchor 2: inherits a quarter inch through a blank grey input and placeholder', () => {
    const tree = render({ value: null });
    const control = input(tree);
    expect(control.props.value).toBe('');
    expect(control.props.placeholder).toBe('1/4');
    expect(control.props.className).toContain('border-gray-600');
    expect(control.props.className).not.toContain('border-teal-500');
    expect(reset(tree)).toBeUndefined();
    expect(tree.props.title).toBe('Shop standard: 1/4"');
  });

  it('anchor 3: shows a half-inch override with a teal border, reset, and source title', () => {
    const tree = render({ value: 0.5, onChange: vi.fn() });
    const control = input(tree);
    expect(control.props.value).toBe('1/2');
    expect(control.props.className).toContain('border-teal-500');
    expect(control.props.className).not.toContain('border-gray-600');
    expect(control.props.className).toContain('focus:border-blue-500');
    expect(reset(tree).props['aria-label']).toBe('Reset Reveal');
    expect(tree.props.title).toBe('Room override · Shop standard: 1/4"');
  });

  it('anchor 4: keeps an explicit value pinned even when it equals the inherited value', () => {
    const tree = render({ value: 0.25, onChange: vi.fn() });
    expect(input(tree).props.value).toBe('1/4');
    expect(input(tree).props.className).toContain('border-teal-500');
    expect(reset(tree)).toBeDefined();
  });

  it('anchor 5: commits fractional text, clears to inherit, and resets to inherit', () => {
    const onChange = vi.fn();
    const tree = render({ value: 0.5, onChange });
    input(tree).props.onChange({ target: { value: '3/8' } });
    input(tree).props.onBlur();
    expect(onChange).toHaveBeenNthCalledWith(1, 0.375);
    expect(input(tree).props.value).toBe('3/8');
    input(tree).props.onChange({ target: { value: '' } });
    input(tree).props.onBlur();
    expect(onChange).toHaveBeenNthCalledWith(2, null);
    expect(input(tree).props.value).toBe('');
    reset(tree).props.onClick();
    expect(onChange).toHaveBeenNthCalledWith(3, null);
  });

  it('anchor 6: renders bool inheritance and commits typed Off and null', () => {
    const onChange = vi.fn();
    const tree = render({ kind: 'bool', value: null, inherited: true, onChange });
    const select = find(tree, 'select');
    expect(select.props.value).toBe('');
    expect(options(tree)).toEqual([['', 'Inherit (On)'], ['true', 'On'], ['false', 'Off']]);
    select.props.onChange({ target: { value: 'false' } });
    expect(onChange).toHaveBeenNthCalledWith(1, false);
    select.props.onChange({ target: { value: '' } });
    expect(onChange).toHaveBeenNthCalledWith(2, null);
  });

  it('anchor 7: renders labelled choice options and selects the teal override', () => {
    const onChange = vi.fn();
    const tree = render({
      kind: 'choice', value: 'casing', inherited: 'jamb', onChange,
      choices: [{ value: 'jamb', label: 'Jamb' }, { value: 'casing', label: 'Outside casing' }],
    });
    expect(options(tree)).toEqual([['', 'Inherit (Jamb)'], ['jamb', 'Jamb'], ['casing', 'Outside casing']]);
    expect(find(tree, 'select').props.value).toBe('casing');
    expect(find(tree, 'select').props.className).toContain('border-teal-500');
    expect(tree.props.title).toBe('Room override · Shop standard: Jamb');
    find(tree, 'select').props.onChange({ target: { value: 'jamb' } });
    expect(onChange).toHaveBeenCalledWith('jamb');
  });

  it('anchor 8: reverts a rejected numeric or blank commit to the previous text', () => {
    const onChange = vi.fn(() => false);
    const tree = render({ value: 0.5, onChange });
    for (const [text, value] of [['3/8', 0.375], ['', null]]) {
      input(tree).props.onChange({ target: { value: text } });
      input(tree).props.onBlur();
      expect(onChange).toHaveBeenLastCalledWith(value);
      expect(input(tree).props.value).toBe('1/2');
    }
  });

  it('preserves numeric choice types and treats zero and false as overrides', () => {
    const onChange = vi.fn();
    const tree = render({
      kind: 'choice', value: 0, inherited: 1, onChange,
      choices: [{ value: 0, label: 'Zero' }, { value: 1, label: 'One' }],
    });
    expect(find(tree, 'select').props.value).toBe('0');
    expect(reset(tree)).toBeDefined();
    find(tree, 'select').props.onChange({ target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(1);
    const bool = render({ kind: 'bool', value: false, inherited: true, onChange });
    expect(find(bool, 'select').props.value).toBe('false');
    expect(reset(bool)).toBeDefined();
    find(bool, 'select').props.onChange({ target: { value: 'true' } });
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('uses a span label, optional grey note, and only offers reset with a callback', () => {
    const children = vi.fn(() => 'control');
    const tree = OverrideField({ label: 'Depth', overridden: true, inheritedText: '24"', note: 'Helpful note', children });
    expect(find(tree, 'span').props.children).toBe('Depth');
    expect(find(tree, 'label')).toBeUndefined();
    expect(reset(tree)).toBeUndefined();
    expect(children).toHaveBeenCalledWith('border-teal-500');
    expect(nodes(tree).find(({ props }) => props.children === 'Helpful note').props.className).toContain('text-gray-400');
    expect(controlBorder(false)).toBe('border-gray-600');
  });

  it('passes through aria labels, source, level, display precision, and read-only controls', () => {
    const tree = render({
      value: 0.125, inherited: 0.125, displayStep: 1 / 8, readOnly: true, onChange: vi.fn(),
      source: { level: 'default' }, level: 'project', 'aria-label': 'Room Reveal',
    });
    expect(input(tree).props['aria-label']).toBe('Room Reveal');
    expect(input(tree).props.placeholder).toBe('1/8');
    expect(input(tree).props.readOnly).toBe(true);
    expect(tree.props.title).toBe('Project override · Built-in default: 1/8"');
    expect(reset(tree)).toBeUndefined();
    const bool = render({ kind: 'bool', value: true, inherited: false, readOnly: true, 'aria-label': 'Room Casing' });
    expect(find(bool, 'select').props.disabled).toBe(true);
    expect(find(bool, 'select').props['aria-label']).toBe('Room Casing');
    expect(reset(bool)).toBeUndefined();
  });

  it('treats empty and missing values as inheritance and retains the default InchInput border', () => {
    for (const value of ['', undefined]) {
      const tree = render({ value, onChange: vi.fn() });
      expect(input(tree).props.value).toBe('');
      expect(reset(tree)).toBeUndefined();
      expect(tree.props.title).toBe('Shop standard: 1/4"');
      const bool = render({ kind: 'bool', value, inherited: false });
      expect(find(bool, 'select').props.value).toBe('');
      expect(options(bool)[0]).toEqual(['', 'Inherit (Off)']);
    }
    expect(InchInput({ value: null }).props.className).toContain('border-gray-600');
  });
});
