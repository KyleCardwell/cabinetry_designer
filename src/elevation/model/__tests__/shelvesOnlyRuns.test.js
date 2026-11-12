import { describe, expect, it } from 'vitest';
import { auto, run } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { faceFrontOffset, frontDepth } from '../corners.js';
import { isPanelOnlyRun, isShelvesOnlyRun } from '../wallEndPanels.js';

describe('shelves-only run model (FS1)', () => {
  it('requires shelves and allows panels and voids, including a nested top panel', () => {
    for (const [kinds, expected] of [
      [['shelves'], true], [['shelves', 'panel'], true], [['shelves', 'void'], true],
      [['shelves', 'cabinet'], false], [['panel'], false], [['void'], false],
      [['shelves', 'filler'], false], [[], false],
    ]) {
      const candidate = run({ items: kinds.map((kind, i) => ({ ...auto(`cell-${i}`), kind,
        ...(kind === 'panel' ? { panelType: 'top', depth: 0.75 } : {}) })) });
      expect(isShelvesOnlyRun(candidate)).toBe(expected);
      if (expected) expect(isPanelOnlyRun(candidate)).toBe(false);
    }
    const nested = run({ id: 'nested', items: [
      { ...auto('shelves'), kind: 'shelves' }, { ...auto('top'), kind: 'panel', panelType: 'top', depth: 0.75 },
      { ...auto('gap'), kind: 'void' },
    ] }).grid;
    expect(isShelvesOnlyRun(run({ items: [{ ...auto('column'), grid: nested }] }))).toBe(true);
    expect(isShelvesOnlyRun({})).toBe(false);
  });

  it('uses box depth plus back offset without faces or a face frame', () => {
    const shelves = run({ depth: 12, items: [{ ...auto('a'), kind: 'shelves' }] });
    const cabinet = run({ depth: 12, items: [auto('a')] });
    expect(frontDepth(shelves, DEFAULT_SETTINGS)).toBe(12);
    expect(frontDepth(cabinet, DEFAULT_SETTINGS)).toBe(12 + faceFrontOffset(cabinet, DEFAULT_SETTINGS));
    for (const offset of [3, -4]) {
      expect(frontDepth({ ...shelves, _plane: { offset }, outset: 2, _frame: { thickness: 0.75 } }, DEFAULT_SETTINGS))
        .toBe(offset + 2 + 12);
    }
  });
});
