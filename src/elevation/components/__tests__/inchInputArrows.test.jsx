import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import InchInput from '../InchInput.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));

function render(props, text) {
  const setText = vi.fn();
  useState.mockReturnValue([text, setText]);
  const input = InchInput(props);
  const press = (key) => {
    const event = { key, preventDefault: vi.fn(), currentTarget: { blur: vi.fn() } };
    input.props.onKeyDown(event);
    return event;
  };
  return { setText, press };
}

describe('InchInput arrow keys', () => {
  it('steps a typed value, including math, and commits', () => {
    const onCommit = vi.fn();
    const { setText, press } = render({ value: 3, onCommit, arrowStep: 1 }, '1+2');
    expect(press('ArrowUp').preventDefault).toHaveBeenCalled();
    expect(onCommit).toHaveBeenLastCalledWith(4);
    expect(setText).toHaveBeenLastCalledWith('4');
    press('ArrowDown');
    expect(onCommit).toHaveBeenLastCalledWith(2);
  });

  it('steps a blank field from its base and keeps the text when the commit is refused', () => {
    const onCommit = vi.fn(() => false);
    const { setText, press } = render({ onCommit, arrowStep: 1, arrowBase: 3, allowBlank: true }, '');
    press('ArrowDown');
    expect(onCommit).toHaveBeenLastCalledWith(2);
    expect(setText).not.toHaveBeenCalled();
  });

  it('ignores arrows without arrowStep', () => {
    const onCommit = vi.fn();
    const { press } = render({ value: 3, onCommit }, '3');
    expect(press('ArrowUp').preventDefault).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
