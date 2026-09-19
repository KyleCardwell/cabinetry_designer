import { describe, expect, it } from 'vitest';
import {
  floorTo,
  formatInches,
  formatInchesInput,
  parseInches,
  roundTo,
} from '../units.js';

describe('parseInches and formatInches', () => {
  it.each([
    ['30 1/2', 30.5, '30 1/2"'],
    ['30-1/2', 30.5, '30 1/2"'],
    ['30.5', 30.5, '30 1/2"'],
    ['3/4', 0.75, '3/4"'],
    ['2 1/16"', 2.0625, '2 1/16"'],
  ])('round-trips %s', (input, expected, formatted) => {
    const parsed = parseInches(input);
    expect(parsed).toBe(expected);
    expect(formatInches(parsed)).toBe(formatted);
    expect(parseInches(formatInches(parsed))).toBe(expected);
  });

  it.each(['', 'abc', '1/0', '2 2/2', '3 feet'])('returns null for invalid input %j', (input) => {
    expect(parseInches(input)).toBeNull();
  });

  it('handles negative mixed fractions and display carry', () => {
    expect(parseInches('-2 1/2')).toBe(-2.5);
    expect(formatInches(-2.5)).toBe('-2 1/2"');
    expect(formatInches(1.999)).toBe('2"');
  });

  it('formats input values as fractions without an inch mark', () => {
    expect(formatInchesInput(24.875)).toBe('24 7/8');
    expect(formatInchesInput(0.75)).toBe('3/4');
    expect(formatInchesInput(-2.5)).toBe('-2 1/2');
  });
});

describe('step rounding', () => {
  it('floors and rounds using epsilon-safe arithmetic', () => {
    expect(floorTo(29.999999999999, 0.5)).toBe(30);
    expect(floorTo(29.99, 0.5)).toBe(29.5);
    expect(roundTo(30.249999999999, 0.5)).toBe(30.5);
    expect(roundTo(30.24, 0.5)).toBe(30);
  });

  it('returns NaN for invalid steps', () => {
    expect(floorTo(10, 0)).toBeNaN();
    expect(roundTo(10, -1)).toBeNaN();
  });
});

describe('formatInches with a finer step', () => {
  it('50. formats thirty-seconds when asked', () => {
    expect(formatInches(0.09375, 1 / 32)).toBe('3/32"');
    expect(formatInches(1.09375, 1 / 32)).toBe('1 3/32"');
    expect(formatInches(-0.125, 1 / 32)).toBe('-1/8"');
    expect(formatInches(0.09375)).toBe('1/8"');
    expect(formatInchesInput(0.84375, 1 / 32)).toBe('27/32');
  });
});
