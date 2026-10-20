import { expect, it } from 'vitest';
import {
  ACCESSORY_EFFECT_KINDS, BUILT_IN_SLIDES, effectText, findEffect,
  isAccessory, isAccessoryEffect, isEffectList, newAccessory,
} from '../index.js';

it('IN12c a anchor 1: validates the exact effect vocabulary, keys and value limits', () => {
  expect(ACCESSORY_EFFECT_KINDS).toEqual([
    'clear_behind', 'max_depth', 'max_height', 'fixed_height', 'slide', 'probox_note',
  ]);
  for (const kind of ACCESSORY_EFFECT_KINDS.slice(0, 4)) {
    expect(isAccessoryEffect({ kind, inches: 2 })).toBe(true);
    for (const inches of [0, -1, Infinity, NaN, '2', null, undefined]) {
      expect(isAccessoryEffect({ kind, inches })).toBe(false);
    }
  }
  expect(isAccessoryEffect({ kind: 'slide', slideId: 'gone' })).toBe(true);
  expect(isAccessoryEffect({ kind: 'probox_note', text: 'x'.repeat(120) })).toBe(true);
  for (const effect of [
    { kind: 'slide', slideId: '' }, { kind: 'slide', slideId: 2 },
    ...[' x', 'x ', '', 'x'.repeat(121), null].map((text) => ({ kind: 'probox_note', text })),
    { kind: 'clear_behind', inches: 2, x: 1 }, { kind: 'notes', text: 'a' },
    { kind: 'max_depth' }, { inches: 2 }, { kind: 'slide', inches: 2 },
    { kind: 'slide', slideId: 'a', [Symbol('extra')]: true },
    Object.assign(Object.create({ kind: 'slide' }), { slideId: 'a' }),
    null, [], new Date(), 'slide',
  ]) expect(isAccessoryEffect(effect)).toBe(false);
});

it('IN12c a anchor 2: permits effects only on drawer boxes, without duplicates or conflicting heights', () => {
  const effects = [{ kind: 'clear_behind', inches: 2 }, { kind: 'slide', slideId: 'accuride-3832' }];
  const accessory = { ...newAccessory([], 'a'), attachesTo: 'drawer_box', effects };
  expect(isAccessory(accessory)).toBe(true);
  expect(isAccessory({ ...accessory, attachesTo: 'section' })).toBe(false);
  expect(isAccessory({ ...accessory, effects: [effects[0], effects[0]] })).toBe(false);
  expect(isAccessory({ ...accessory, effects: [
    { kind: 'max_height', inches: 4.25 }, { kind: 'fixed_height', inches: 3.25 },
  ] })).toBe(false);
  expect(isAccessory({ ...accessory, effects: [{ kind: 'slide', slideId: 'gone' }] })).toBe(true);
  const five = [...effects, { kind: 'max_depth', inches: 18 },
    { kind: 'max_height', inches: 4.25 }, { kind: 'probox_note', text: '1/2" bottom' }];
  expect(isEffectList(five, 'drawer_box')).toBe(true);
  expect(isEffectList([...five, { kind: 'fixed_height', inches: 3.25 }], 'drawer_box')).toBe(false);
  for (const place of ['section', 'drawer_box']) expect(isEffectList([], place)).toBe(true);
  expect(isEffectList([], 'shelf')).toBe(false);
  for (const list of [null, {}, Array(1), [null]]) expect(isEffectList(list, 'drawer_box')).toBe(false);
});

it('IN12c a anchor 3: formats each effect and finds one kind or null', () => {
  const examples = [
    [{ kind: 'clear_behind', inches: 2 }, '2" clear behind'],
    [{ kind: 'max_depth', inches: 18 }, 'max 18" deep'],
    [{ kind: 'max_height', inches: 4.25 }, 'max 4 1/4" tall'],
    [{ kind: 'fixed_height', inches: 3.25 }, '3 1/4" tall box'],
    [{ kind: 'slide', slideId: 'accuride-3832' }, 'Accuride 3832'],
    [{ kind: 'slide', slideId: 'gone' }, 'Missing slide'],
    [{ kind: 'probox_note', text: '1/2" bottom' }, 'ProBox: 1/2" bottom'],
  ];
  for (const [effect, text] of examples) expect(effectText(effect, BUILT_IN_SLIDES)).toBe(text);
  expect(effectText({ kind: 'slide', slideId: 'gone' })).toBe('Missing slide');
  expect(effectText(null)).toBe('');
  const effects = [examples[0][0], examples[4][0]];
  expect(findEffect({ effects }, 'slide')).toBe(effects[1]);
  for (const accessory of [null, {}, { effects: [] }, { effects }]) {
    expect(findEffect(accessory, 'max_height')).toBeNull();
  }
});
