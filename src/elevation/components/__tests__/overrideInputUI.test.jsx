import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import InchInput from '../InchInput.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, type) => nodes(tree).find((node) => node.type === type);
const render = (props) => OverrideField(OverrideInput({ kind: 'number', label: 'Reveal', inherited: 0.25, ...props }).props);
const input = (tree) => InchInput(find(tree, InchInput).props);
const reset = (tree) => find(tree, 'button');

beforeEach(() => {
  vi.clearAllMocks();
  let text;
  useState.mockImplementation((initial) => {
    if (text === undefined) text = typeof initial === 'function' ? initial() : initial;
    return [text, (next) => { text = next; }];
  });
});

describe('override field and input (DB2)', () => {

  it('commits fractional text, clears to inherit, and resets to inherit', () => {
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

  it('reverts a rejected numeric or blank commit to the previous text', () => {
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

});
