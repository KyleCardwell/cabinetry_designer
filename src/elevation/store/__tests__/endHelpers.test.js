import { describe, expect, it } from 'vitest';
import { cleanEndValue, writeLeafEnd } from '../slices/helpers.js';

describe('cleanEndValue', () => {
  it('keeps valid return widths and strips unrelated fields from a fresh value', () => {
    expect(cleanEndValue({ type: 'return', width: 3 }, ['return']))
      .toEqual({ type: 'return', width: 3 });
    const value = { type: 'return', width: 3, extra: true };
    expect(cleanEndValue(value, ['return'])).toEqual({ type: 'return', width: 3 });
    expect(cleanEndValue(value, ['return'])).not.toBe(value);
    expect(cleanEndValue({ type: 'return' }, ['return'])).toEqual({ type: 'return' });
  });

  it('ignores panel widths', () => {
    expect(cleanEndValue({ type: 'panel', width: 3 }, ['panel', 'return']))
      .toEqual({ type: 'panel' });
    expect(cleanEndValue({ type: 'panel', width: NaN }, ['panel', 'return']))
      .toEqual({ type: 'panel' });
  });

  it('rejects unsupported types and other invalid values', () => {
    for (const value of [{ type: 'panel' }, 'x', undefined, false, 3, {}, { type: 'other' }]) {
      expect(cleanEndValue(value, ['return'])).toBeUndefined();
    }
  });

  it('rejects return widths unless they are finite positive numbers', () => {
    for (const width of [0, -1, NaN, Infinity, -Infinity, null, '3']) {
      expect(cleanEndValue({ type: 'return', width }, ['return'])).toBeUndefined();
    }
  });

  it('preserves clear and none values', () => {
    expect(cleanEndValue(null, ['return'])).toBeNull();
    expect(cleanEndValue('none', ['return'])).toBe('none');
  });
});

describe('writeLeafEnd', () => {
  it('does not create a key when clearing a missing side', () => {
    const leaf = {};
    expect(writeLeafEnd(leaf, 'stepEnds', 'left', null)).toBe(false);
    expect(leaf).toEqual({});
  });

  it('removes the key when clearing its last side', () => {
    const leaf = { stepEnds: { left: 'none' } };
    expect(writeLeafEnd(leaf, 'stepEnds', 'left', null)).toBe(true);
    expect(leaf).toEqual({});
  });

  it('writes one side while preserving the other', () => {
    const leaf = { insideEnds: { left: 'none' } };
    expect(writeLeafEnd(leaf, 'insideEnds', 'right', { type: 'return' })).toBe(true);
    expect(leaf).toEqual({ insideEnds: { left: 'none', right: { type: 'return' } } });
  });

  it('creates the key and replaces an existing value', () => {
    const leaf = {};
    expect(writeLeafEnd(leaf, 'stepEnds', 'right', { type: 'panel' })).toBe(true);
    expect(leaf).toEqual({ stepEnds: { right: { type: 'panel' } } });
    expect(writeLeafEnd(leaf, 'stepEnds', 'right', 'none')).toBe(true);
    expect(leaf).toEqual({ stepEnds: { right: 'none' } });
  });

  it('clears only an own side and retains the other side', () => {
    const leaf = { insideEnds: { left: 'none' } };
    expect(writeLeafEnd(leaf, 'insideEnds', 'right', null)).toBe(false);
    expect(leaf).toEqual({ insideEnds: { left: 'none' } });
    leaf.insideEnds = Object.assign(Object.create({ right: 'none' }), leaf.insideEnds);
    expect(writeLeafEnd(leaf, 'insideEnds', 'right', null)).toBe(false);
    leaf.insideEnds.right = { type: 'return' };
    expect(writeLeafEnd(leaf, 'insideEnds', 'right', null)).toBe(true);
    expect(leaf.insideEnds.left).toBe('none');
    expect(Object.hasOwn(leaf.insideEnds, 'right')).toBe(false);
  });
});
