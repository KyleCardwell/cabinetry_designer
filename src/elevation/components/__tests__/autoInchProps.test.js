import { describe, expect, it, vi } from 'vitest';
import { autoInchProps } from '../autoInchProps.js';

describe('AU10 shared auto inch props', () => {
  it('returns the default props and preserves the commit without adding displayStep', () => {
    const onCommit = vi.fn();
    expect(autoInchProps({ auto: 30, onCommit })).toEqual({
      allowBlank: true, allowAuto: true, placeholder: '30', onCommit,
    });
  });

  it('formats zero and leaves missing or null automatic values undefined', () => {
    for (const [auto, placeholder] of [[0, '0'], [undefined, undefined], [null, undefined]]) {
      expect(autoInchProps({ auto }).placeholder).toBe(placeholder);
    }
  });

  it('keeps the inch mark when quoted', () => {
    expect(autoInchProps({ auto: 13 / 16, quoted: true }).placeholder).toBe('13/16"');
  });

  it('uses literal text before an automatic value', () => {
    expect(autoInchProps({ text: '0"', auto: 5 }).placeholder).toBe('0"');
  });

  it('wraps a quoted automatic value and its note', () => {
    expect(autoInchProps({
      auto: 4.25, labelled: true, quoted: true, note: ', DRW-003',
    }).placeholder).toBe('Auto (4 1/4", DRW-003)');
  });

  it('uses the supplied step for the placeholder and input display', () => {
    expect(autoInchProps({ auto: 14.78125, labelled: true, step: 1 / 64 })).toMatchObject({
      placeholder: 'Auto (14 25/32)', displayStep: 1 / 64,
    });
  });

  it('labels literal fallback text when no automatic size fits', () => {
    expect(autoInchProps({
      auto: null, text: 'none fits', labelled: true, quoted: true,
    }).placeholder).toBe('Auto (none fits)');
  });

  it('rejects negative values before the site and forwards zero and null', () => {
    const onCommit = vi.fn();
    const props = autoInchProps({ min: 'nonNegative', onCommit });
    expect(props.onCommit(-1)).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    props.onCommit(0);
    props.onCommit(null);
    expect(onCommit.mock.calls).toEqual([[0], [null]]);
  });

  it('requires positive numbers while allowing a blank', () => {
    const onCommit = vi.fn();
    const props = autoInchProps({ min: 'positive', onCommit });
    expect(props.onCommit(0)).toBe(false);
    expect(props.onCommit(-1)).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    props.onCommit(0.25);
    props.onCommit(null);
    expect(onCommit.mock.calls).toEqual([[0.25], [null]]);
  });

  it('preserves undefined, object and false commit results with or without a minimum', () => {
    for (const min of [undefined, 'nonNegative', 'positive']) {
      for (const result of [undefined, { saved: true }, false]) {
        const onCommit = vi.fn(() => result);
        expect(autoInchProps({ min, onCommit }).onCommit(2)).toBe(result);
        expect(onCommit.mock.calls).toEqual([[2]]);
      }
    }
  });

  it('omits the placeholder core for nonfinite dimensions even with a label and note', () => {
    for (const auto of [NaN, Infinity, -Infinity]) {
      expect(autoInchProps({ auto, labelled: true, note: ', matched' }).placeholder).toBeUndefined();
    }
  });

  it('keeps empty literal text and allows negative dimensions without a minimum', () => {
    const onCommit = vi.fn();
    const props = autoInchProps({ auto: 5, text: '', onCommit });
    expect(props.placeholder).toBe('');
    props.onCommit(-2);
    expect(onCommit).toHaveBeenCalledWith(-2);
  });
});
