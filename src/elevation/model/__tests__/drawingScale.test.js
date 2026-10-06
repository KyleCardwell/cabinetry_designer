import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { PLOT_SCALES, plotScale } from '../drawingScale.js';

describe('SPEC-43 drawing scale', () => {
  it('defaults to 1/2" = 1\'-0" and offers the usual scales', () => {
    expect(DEFAULT_SETTINGS.plotScale).toBe(24);
    expect(plotScale({ plotScale: 48 })).toBe(48);
    expect(plotScale({})).toBe(24);
    expect(plotScale(undefined)).toBe(24);
    expect(PLOT_SCALES.map(([value]) => value)).toEqual([12, 16, 24, 32, 48]);
    expect(PLOT_SCALES.find(([value]) => value === 24)[1]).toBe('1/2" = 1\'-0"');
  });
});
