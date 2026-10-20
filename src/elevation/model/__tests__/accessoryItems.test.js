import { expect, it } from 'vitest';
import {
  addAccessoryItem, isAccessoryItems, mergeAccessoryItems, removeAccessoryItem, setAccessoryItem,
} from '../index.js';

const a = { accessoryId: 'a' };
const full = Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i), qty: 20 }));

it('IN12c a: shared items retain the IN12b storage shape and limits', () => {
  for (const items of [[a], [{ ...a, qty: 2 }], full]) expect(isAccessoryItems(items)).toBe(true);
  for (const items of [[], [a, a], [...full, a], [{ accessoryId: '' }], [{ qty: 2 }],
    ...[1, 21, 2.5, null, undefined, '2'].map((qty) => [{ ...a, qty }]),
    [{ ...a, extra: true }], [{ ...a, [Symbol('extra')]: true }], Array(1), [null], null, {}]) {
    expect(isAccessoryItems(items)).toBe(false);
  }
});

it('IN12c a anchor 4: adds, increments, resets, merges renamed ids and removes without mutation', () => {
  const once = addAccessoryItem(undefined, 'a');
  expect(addAccessoryItem(once, 'a')).toEqual([{ accessoryId: 'a', qty: 2 }]);
  expect(once).toEqual([a]);
  const items = [a, { accessoryId: 'b', qty: 3 }];
  expect(setAccessoryItem(items, 1, { accessoryId: 'a' })).toEqual([{ accessoryId: 'a', qty: 4 }]);
  expect(items).toEqual([a, { accessoryId: 'b', qty: 3 }]);
  for (const qty of [1, null]) expect(setAccessoryItem(items, 1, { qty })).toEqual([a, { accessoryId: 'b' }]);
  expect(removeAccessoryItem([a], 0)).toBeUndefined();
  expect(removeAccessoryItem(items, 0)).toEqual([{ accessoryId: 'b', qty: 3 }]);
  expect(setAccessoryItem([a, { accessoryId: 'b' }, { accessoryId: 'c', qty: 19 }], 0,
    { accessoryId: 'c', qty: 3 })).toEqual([{ accessoryId: 'b' }, { accessoryId: 'c', qty: 20 }]);
  expect(addAccessoryItem(full, 'extra')).toBe(full);
  expect(addAccessoryItem(full, '0')).toEqual(full);
  expect(addAccessoryItem(full, '0')).not.toBe(full);
  expect(addAccessoryItem(items, '')).toBe(items);
  for (const patch of [null, { qty: 0 }, { qty: 21 }, { qty: 2.1 }, { qty: undefined },
    { accessoryId: '' }, { accessoryId: null }, { other: 1 }, { [Symbol('bad')]: 1 }]) {
    expect(setAccessoryItem(items, 0, patch)).toBe(items);
  }
  for (const index of [-1, 2, 0.5, null]) {
    expect(setAccessoryItem(items, index, { qty: 3 })).toBe(items);
    expect(removeAccessoryItem(items, index)).toBe(items);
  }
  for (const invalid of [null, {}, [a, a], Array(1)]) {
    expect(addAccessoryItem(invalid, 'b')).toBe(invalid);
    expect(setAccessoryItem(invalid, 0, { qty: 3 })).toBe(invalid);
    expect(removeAccessoryItem(invalid, 0)).toBe(invalid);
  }
});

it('IN12c a: merging keeps first occurrence order, caps quantities and rejects bad arguments or overflow', () => {
  const first = [a, { accessoryId: 'b', qty: 19 }];
  const second = [{ accessoryId: 'b', qty: 3 }, a, { accessoryId: 'c' }];
  const before = structuredClone([first, second]);
  const merged = mergeAccessoryItems(first, second);
  expect(merged).toEqual([{ accessoryId: 'a', qty: 2 }, { accessoryId: 'b', qty: 20 }, { accessoryId: 'c' }]);
  expect([first, second]).toEqual(before);
  expect(merged[2]).not.toBe(second[2]);
  expect(mergeAccessoryItems(full, [a])).toBe(full);
  expect(mergeAccessoryItems(full, [{ accessoryId: '0' }])).toEqual(full);
  expect(mergeAccessoryItems(first, undefined)).toEqual(first);
  expect(mergeAccessoryItems(first, undefined)).not.toBe(first);
  expect(mergeAccessoryItems(undefined, second)).toEqual(second);
  expect(mergeAccessoryItems([], [])).toBeUndefined();
  expect(mergeAccessoryItems(undefined, undefined)).toBeUndefined();
  for (const invalid of [null, {}, [a, a], Array(1)]) {
    expect(mergeAccessoryItems(first, invalid)).toBe(first);
    expect(mergeAccessoryItems(invalid, first)).toBe(invalid);
  }
});
