import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { PAPER_SIZES, PLOT_SCALES, paperSize, plotScale } from '../drawingScale.js';

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

describe('SPEC-50.15 PDF paper setting', () => {
  it('offers Letter, Ledger and Arch D and defaults missing or unknown values to Letter', () => {
    expect(DEFAULT_SETTINGS.paperSize).toBe('letter');
    expect(PAPER_SIZES).toEqual([
      ['letter', 'Letter (8.5 × 11)'],
      ['ledger', 'Ledger (11 × 17)'],
      ['archD', 'Arch D (24 × 36)'],
    ]);
    for (const [value] of PAPER_SIZES) expect(paperSize({ paperSize: value })).toBe(value);
    for (const settings of [undefined, {}, { paperSize: 'a4' }, { paperSize: null }]) {
      expect(paperSize(settings)).toBe('letter');
    }
  });
});
