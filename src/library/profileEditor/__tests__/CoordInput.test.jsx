import { expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import CoordInput from '../CoordInput.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() }));

it('clears to undefined only with allowBlank, retains fraction parsing and rejects invalid text', () => {
  for (const allowBlank of [true, false]) {
    const slots = [];
    const refs = [];
    let cursor;
    let refCursor;
    useState.mockImplementation((initial) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (next) => { slots[slot] = next; }];
    });
    useRef.mockImplementation((initial) => refs[refCursor++] ??= { current: initial });
    const onCommit = vi.fn();
    const render = () => {
      cursor = 0;
      refCursor = 0;
      return CoordInput({ value: 0.75, onCommit, ...(allowBlank ? { allowBlank } : {}), placeholder: '13/16' });
    };
    const type = (value) => {
      render().props.onChange({ target: { value } });
      render().props.onBlur();
    };
    expect(render().props.placeholder).toBe('13/16');
    expect(render().props).not.toHaveProperty('allowBlank');
    type('   ');
    if (allowBlank) {
      expect(onCommit).toHaveBeenLastCalledWith(undefined);
      expect(render().props.value).toBe('');
    } else {
      expect(onCommit).not.toHaveBeenCalled();
      expect(render().props.value).toBe('3/4');
    }
    type('1/2');
    expect(onCommit).toHaveBeenLastCalledWith(0.5);
    expect(render().props.value).toBe('1/2');
    onCommit.mockClear();
    type('invalid');
    expect(onCommit).not.toHaveBeenCalled();
    expect(render().props.value).toBe('3/4');
  }
});
