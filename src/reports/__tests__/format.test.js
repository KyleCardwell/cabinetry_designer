import { describe, expect, it } from 'vitest';
import { formatInch, formatSize } from '../format.js';

describe('report fractions', () => {
  it('formats the two- and three-dimensional sizes and inch values (anchor 1)', () => {
    expect(formatSize(25.375, 30.5)).toBe('25 3/8 x 30 1/2');
    expect(formatSize(18, 30.5, 24)).toBe('18 x 30 1/2 x 24');
    expect(formatInch(1.875)).toBe('1 7/8"');
    expect(formatInch(0.8125)).toBe('13/16"');
  });

  it('retains thirty-seconds, rounds to the nearest one, and reduces fractions', () => {
    expect(formatInch(1 / 32)).toBe('1/32"');
    expect(formatSize(25 + 1 / 32, 30 + 31 / 32)).toBe('25 1/32 x 30 31/32');
    expect(formatInch(3.501)).toBe('3 1/2"');
    expect(formatInch(0.999)).toBe('1"');
    expect(formatInch(0)).toBe('0"');
  });
});
