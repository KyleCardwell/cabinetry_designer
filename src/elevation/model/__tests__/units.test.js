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
    ['30-1/2', 29.5, '29 1/2"'],
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

describe('SPEC-21 inch math', () => {
  it('180. evaluates inch expressions', () => {
    const cases = [
      ['30 1/2 + 3/4', 31.25],
      ['30-1/2', 29.5],
      ['55 - 4.5 / 2', 52.75],
      ['(55 - 4.5)/2', 25.25],
      ['30 - 1/2', 29.5],
      ['12-3', 9],
      ['(36 - 1 1/2) / 2', 17.25],
      ['2 * 15 3/8', 30.75],
      ['-1/2', -0.5],
      ['-(2 1/2 + 1)', -3.5],
      ['24" + 3/4"', 24.75],
      ["8'", 96],
      ["8'6\"", 102],
      ["8' 6 1/2", 102.5],
      ["8'-6", 90],
      ["8' - 6", 90],
      ['.5 + 1.25', 1.75],
    ];

    for (const [input, expected] of cases) {
      expect(parseInches(input), input).toBe(expected);
    }
  });

  it('181. rejects invalid inch expressions', () => {
    for (const input of ['', 'abc', '1/0', '2 2/2', '3 feet', '30 +', '(30', '30)', '2(3)', '1..5', "8''", '5 5']) {
      expect(parseInches(input), input).toBeNull();
    }
  });
});
