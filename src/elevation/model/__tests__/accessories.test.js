import { expect, it } from 'vitest';
import {
  ACCESSORY_PLACES, DEFAULT_SETTINGS, LIBRARY_KEYS, accessoryText, allowedAt, copyAccessory,
  findAccessory, isAccessory, isAccessoryList, newAccessory, registryEntry, withAccessoryDefaults,
} from '../index.js';
import { copySettings } from '../../store/slices/helpers.js';

const susan = {
  ...newAccessory([], 'susan'),
  name: 'Lazy susan 28', brand: 'Rev-A-Shelf', model: '6472-28',
  description: '28" kidney lazy susan', reportText: '6472-28 lazy susan',
  wholeSection: true, minOpening: { width: 27, depth: 22, height: null },
  price: 185, actualCost: 112.4, labor: { '7': 15, '9': 5 },
};

it('IN12b anchor 1: validates the exact accessory shape and field limits', () => {
  const blank = newAccessory([], 'x');
  expect(blank).toEqual({
    id: 'x', name: 'New accessory', brand: '', model: '', description: '', reportText: '',
    attachesTo: 'section', wholeSection: false, minOpening: { width: null, depth: null, height: null },
    size: { width: null, height: null, depth: null }, lengthDeduction: null,
    ownSlides: false, effects: [], pricing: 'unit', price: null, actualCost: null, labor: {},
  });
  expect(isAccessory(blank)).toBe(true);
  expect(isAccessory(susan)).toBe(true);
  expect(ACCESSORY_PLACES).toEqual(['section', 'drawer_box']);
  for (const change of [
    { minOpening: { ...blank.minOpening, width: 0 } }, { minOpening: { width: 12 } },
    { effects: [{}] }, { attachesTo: 'shelf' }, { attachesTo: 'drawer_box', wholeSection: true },
    { seedId: 'a' }, { accessoryCatalogId: 3 }, { price: -1 }, { pricing: 'each' },
    { labor: { '7': -1 } }, { labor: { abc: 1 } }, { labor: { '07': 1 } },
    { name: ' Susan' }, { reportText: 'a'.repeat(121) }, { id: '' }, { name: '' },
    { wholeSection: 1 }, { ownSlides: 'false' }, { effects: null }, { minOpening: null },
    { minOpening: { ...blank.minOpening, extra: null } },
    { [Symbol('extra')]: true },
    ...['brand', 'model', 'description', 'reportText'].flatMap((key) => [
      { [key]: ' text' }, { [key]: 'text ' }, { [key]: 'a'.repeat(121) }, { [key]: 1 },
    ]),
    ...['width', 'depth', 'height'].flatMap((key) => [-1, Infinity, NaN, '12'].map((value) => (
      { minOpening: { ...blank.minOpening, [key]: value } }
    ))),
    ...['price', 'actualCost'].flatMap((key) => [-1, Infinity, NaN, '12', undefined].map((value) => ({ [key]: value }))),
  ]) expect(isAccessory({ ...blank, ...change }), JSON.stringify(change)).toBe(false);
  for (const key of Object.keys(blank)) {
    const missing = { ...blank };
    delete missing[key];
    expect(isAccessory(missing), key).toBe(false);
  }
  for (const invalid of [null, [], new Date(), 'accessory']) expect(isAccessory(invalid)).toBe(false);
  expect(isAccessory({ ...blank, price: 0 })).toBe(true);
  expect(isAccessory({ ...blank, labor: { '7': 15 } })).toBe(true);
  expect(isAccessory({ ...blank, attachesTo: 'drawer_box', ownSlides: true })).toBe(true);
  expect(isAccessory({ ...blank, reportText: 'a'.repeat(120) })).toBe(true);
});

it('IN13a a anchors 1–2: validates size and ordered-length deduction for each place and deep copies size', () => {
  const blank = newAccessory([], 'x');
  expect(isAccessory(blank)).toBe(true);
  expect(blank.size).toEqual({ width: null, height: null, depth: null });
  expect(blank.lengthDeduction).toBeNull();
  expect(newAccessory([], 'y').size).not.toBe(blank.size);
  const rod = { ...blank, size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 };
  expect(isAccessory(rod)).toBe(true);
  expect(isAccessory({ ...blank, lengthDeduction: 0 })).toBe(true);
  for (const size of [
    { width: 3 }, null, [], { ...blank.size, extra: null }, { ...blank.size, [Symbol('extra')]: 1 },
    ...['width', 'height', 'depth'].flatMap((key) => [0, -1, Infinity, NaN, '3', undefined]
      .map((value) => ({ ...blank.size, [key]: value }))),
    { ...blank.size, height: 'section' }, { ...blank.size, depth: 'section' },
  ]) expect(isAccessory({ ...blank, size })).toBe(false);
  for (const lengthDeduction of [-1 / 8, Infinity, NaN, '0.25', undefined]) {
    expect(isAccessory({ ...blank, lengthDeduction })).toBe(false);
  }
  const box = { ...blank, attachesTo: 'drawer_box' };
  expect(isAccessory({ ...box, size: { ...box.size, width: 'section' } })).toBe(false);
  expect(isAccessory({ ...box, lengthDeduction: 0.25 })).toBe(false);
  expect(isAccessory({ ...box, lengthDeduction: 0 })).toBe(false);
  expect(isAccessory({ ...box, size: { width: 3, height: 2, depth: 1 } })).toBe(true);
  const copy = copyAccessory([rod], rod, 'copy');
  expect(copy.size).toEqual(rod.size);
  expect(copy.size).not.toBe(rod.size);
  expect(copy.lengthDeduction).toBe(0.25);
  copy.size.height = 2;
  expect(rod.size.height).toBe(1.25);
});

it('IN13a a anchor 4: defaults only missing accessory keys without changing old fields or invalid values', () => {
  const legacy = structuredClone(susan);
  delete legacy.size;
  delete legacy.lengthDeduction;
  const before = structuredClone(legacy);
  const loaded = withAccessoryDefaults(legacy);
  expect(loaded).toEqual({ ...before, size: { width: null, height: null, depth: null }, lengthDeduction: null });
  expect(isAccessory(loaded)).toBe(true);
  expect(legacy).toEqual(before);
  expect(withAccessoryDefaults(legacy).size).not.toBe(loaded.size);
  const rod = { ...susan, size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 };
  expect(withAccessoryDefaults(rod)).toEqual(rod);
  expect(withAccessoryDefaults({ ...legacy, size: rod.size })).toEqual({ ...legacy, size: rod.size, lengthDeduction: null });
  expect(withAccessoryDefaults({ ...legacy, lengthDeduction: 0 })).toEqual({ ...legacy, size: loaded.size, lengthDeduction: 0 });
  for (const change of [{ size: null }, { size: undefined }, { size: { width: 3 } }, { lengthDeduction: undefined }]) {
    const invalid = { ...legacy, ...change };
    expect(isAccessory(withAccessoryDefaults(invalid))).toBe(false);
  }
  for (const value of [null, undefined, 'x', 3, false, []]) expect(withAccessoryDefaults(value)).toBe(value);
});

it('IN12b anchor 2: picks the first unused new accessory name ignoring case', () => {
  const first = newAccessory([], 'x');
  expect(newAccessory([first], 'y').name).toBe('New accessory 2');
  const second = { ...newAccessory([], 'y'), name: 'new accessory 2' };
  expect(newAccessory([first, second], 'z').name).toBe('New accessory 3');
  expect(newAccessory([second], 'z').name).toBe('New accessory');
  expect(newAccessory([], 'y').minOpening).not.toBe(first.minOpening);
});

it('IN12b anchor 3: deep copies pricing and labor and picks a unique copy name', () => {
  const base = { ...susan, labor: { '7': 15 } };
  const before = structuredClone(base);
  const copy = copyAccessory([base], base, 'z');
  expect(copy).toEqual({ ...base, id: 'z', name: 'Lazy susan 28 copy' });
  for (const key of ['minOpening', 'labor', 'effects']) {
    expect(copy[key]).toEqual(base[key]);
    expect(copy[key]).not.toBe(base[key]);
  }
  const list = [base, { ...copy, name: 'lazy SUSAN 28 COPY' }];
  expect(copyAccessory(list, base, 'y').name).toBe('Lazy susan 28 copy 2');
  list.push({ ...copy, id: 'y', name: 'Lazy susan 28 copy 2' });
  expect(copyAccessory(list, base, 'w').name).toBe('Lazy susan 28 copy 3');
  copy.minOpening.width = 1;
  copy.labor['7'] = 0;
  expect(base).toEqual(before);
});

it('IN12b anchor 4: requires valid entries and unique ids and names ignoring case', () => {
  const first = { ...susan, id: 'a', name: 'Susan' };
  expect(isAccessoryList([])).toBe(true);
  expect(isAccessoryList([first, newAccessory([], 'b')])).toBe(true);
  for (const list of [
    [first, { ...first, id: 'b', name: 'susan' }],
    [first, { ...first, name: 'Other' }], [first, { ...first, id: 'b', effects: [{}] }],
    [null], null, {}, 'accessories',
  ]) expect(isAccessoryList(list)).toBe(false);
});

it('IN12b anchor 5: looks up accessories and uses report text or the name', () => {
  expect(findAccessory('susan', [susan])).toBe(susan);
  expect(findAccessory('missing', [susan])).toBeNull();
  expect(findAccessory('susan', [])).toBeNull();
  expect(accessoryText({ ...susan, reportText: '' })).toBe('Lazy susan 28');
  expect(accessoryText(susan)).toBe('6472-28 lazy susan');
});

it('IN12b keeps accessories in an independent settings library with empty defaults', () => {
  expect(DEFAULT_SETTINGS.accessories).toEqual([]);
  expect(LIBRARY_KEYS).toContain('accessories');
  expect(registryEntry('accessories')).toBeUndefined();
  for (const level of ['team', 'project', 'phase', 'room', 'wall', 'run', 'cabinet', 'face']) {
    expect(allowedAt('accessories', level)).toBe(false);
  }
  for (const settings of [undefined, { ...DEFAULT_SETTINGS, accessories: undefined },
    { ...DEFAULT_SETTINGS, accessories: [susan] }]) {
    const expected = settings?.accessories ?? [];
    const copy = copySettings(settings);
    expect(copy.accessories).toEqual(expected);
    expect(copy.accessories).not.toBe(expected);
    if (expected.length) {
      expect(copy.accessories[0]).not.toBe(susan);
      expect(copy.accessories[0].minOpening).not.toBe(susan.minOpening);
      expect(copy.accessories[0].labor).not.toBe(susan.labor);
      expect(copy.accessories[0].effects).not.toBe(susan.effects);
    }
  }
});
