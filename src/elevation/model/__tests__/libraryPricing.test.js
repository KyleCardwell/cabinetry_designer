import { expect, it } from 'vitest';
import { PRICING_UNITS, PRICING_UNIT_LABELS, formatPrice, isLabor, isMoney } from '../index.js';

it('IN12b anchor 5b: shares pricing units and formats each, pair, size and unpriced amounts', () => {
  expect(PRICING_UNITS).toEqual(['unit', 'area', 'length', 'perimeter', 'volume']);
  expect(PRICING_UNIT_LABELS).toEqual({
    unit: 'each', area: 'sq ft', length: 'ft', perimeter: 'ft of perimeter', volume: 'cu ft',
  });
  expect(formatPrice(185, 'each')).toBe('$185.00 each');
  expect(formatPrice(4.5, 'sq ft')).toBe('$4.50 / sq ft');
  expect(formatPrice(12, 'pair')).toBe('$12.00 a pair');
  expect(formatPrice(null, 'each')).toBe('—');
  for (const label of ['ft', 'ft of perimeter', 'cu ft']) {
    expect(formatPrice(0, label)).toBe(`$0.00 / ${label}`);
  }
});

it('IN12b validates finite nonnegative money and up to twenty service minute entries', () => {
  for (const value of [null, 0, 112.4]) expect(isMoney(value)).toBe(true);
  for (const value of [undefined, -1, Infinity, NaN, '15', true, {}]) expect(isMoney(value)).toBe(false);
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), i / 2]));
  for (const labor of [{}, { '7': 15 }, { '7': 0 }, twenty, Object.create(null)]) {
    expect(isLabor(labor)).toBe(true);
  }
  for (const labor of [null, [], new Date(), 1, 'labor', { ...twenty, '21': 0 },
    ...['abc', '07', '0', '-1', '1.5', ' 7'].map((key) => ({ [key]: 1 })),
    ...[-1, Infinity, NaN, null, undefined, '15'].map((value) => ({ '7': value })),
    { [Symbol('7')]: 15 }]) expect(isLabor(labor)).toBe(false);
});
