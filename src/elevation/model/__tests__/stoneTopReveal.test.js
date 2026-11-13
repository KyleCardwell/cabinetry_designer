import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetReveals, REVEAL_SOURCE_LABELS } from '../styles.js';
import { isStoneTop } from '../tops.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25 };

function reveals(run, options = {}) {
  return cabinetReveals({
    style: EURO, cabinetTypeId: run.cabinetTypeId, run,
    face: { type: 'door', size: null }, settings: DEFAULT_SETTINGS, ...options,
  });
}

describe('Step 468 stone-top reveal', () => {
  it('gives an unstacked base its default stone reveal at the run top only', () => {
    const run = { cabinetTypeId: BASE };
    expect(isStoneTop(run)).toBe(true);
    expect(isStoneTop({ ...run, top: null })).toBe(true);
    expect(reveals(run)).toMatchObject({ values: { top: 0.25 }, sources: { top: 'rule:stone-top' } });
    expect(reveals(run, { runEdges: { top: false, bottom: true } }))
      .toMatchObject({ values: { top: 0.125 }, sources: { top: 'style' } });
    expect(REVEAL_SOURCE_LABELS['rule:stone-top']).toBe('rule: stone top');
  });

  it('keeps the standard reveal under other tops and under a held run', () => {
    for (const top of ['crown', 'none', 'wood', 'topMold']) {
      const run = { cabinetTypeId: BASE, top };
      expect(isStoneTop(run)).toBe(false);
      expect(reveals(run)).toMatchObject({
        values: { top: 0.125 }, sources: { top: top === 'wood' ? 'rule:wood-top' : 'style' },
      });
    }
    const held = { cabinetTypeId: BASE, stack: { above: { runId: 'upper' } } };
    expect(isStoneTop(held)).toBe(false);
    expect(reveals(held)).toMatchObject({ values: { top: 0.125 }, sources: { top: 'style' } });
    for (const cabinetTypeId of [UPPER, TALL]) {
      expect(isStoneTop({ cabinetTypeId })).toBe(false);
      expect(reveals({ cabinetTypeId })).toMatchObject({ values: { top: 0.125 }, sources: { top: 'style' } });
    }
  });

  it('takes explicit stone on any type and honors the setting and later overrides', () => {
    for (const cabinetTypeId of [BASE, UPPER, TALL]) {
      const run = { cabinetTypeId, top: 'stone', stack: { above: { runId: 'above' } } };
      expect(isStoneTop(run)).toBe(true);
      expect(reveals(run)).toMatchObject({ values: { top: 0.25 }, sources: { top: 'rule:stone-top' } });
      expect(reveals(run, { settings: { ...DEFAULT_SETTINGS, stoneTopReveal: 0.375 } }).values.top).toBe(0.375);
      expect(reveals(run, { manual: { top: 0.1875 } }))
        .toMatchObject({ values: { top: 0.1875 }, sources: { top: 'manual' } });
      expect(reveals(run, { stacked: { top: true, bottom: false } }))
        .toMatchObject({ values: { top: 0.125 }, sources: { top: 'rule:stacked-seam' } });
    }
    const { stoneTopReveal, ...legacySettings } = DEFAULT_SETTINGS;
    expect(stoneTopReveal).toBe(0.25);
    expect(reveals({ cabinetTypeId: BASE }, { settings: legacySettings }).values.top).toBe(0.25);
  });

  it('keeps the stacked seam on a lower cabinet in a stone run', () => {
    expect(reveals({ cabinetTypeId: BASE, top: 'stone' }, {
      runEdges: { top: false, bottom: true }, stacked: { top: true, bottom: false },
    })).toMatchObject({ values: { top: 0.125 }, sources: { top: 'rule:stacked-seam' } });
  });

  it('leaves face frame reveals unchanged under stone', () => {
    expect(reveals({ cabinetTypeId: BASE, top: 'stone' }, { style: { ...EURO, cabinetStyleId: 14 } }))
      .toMatchObject({ values: { top: 1.5 }, sources: { top: 'style' } });
  });

  it('adds top overlap to the configured reveal at column tops and lets manual values win', () => {
    const run = { cabinetTypeId: BASE, top: 'stone' };
    const options = { topOverlap: 1, settings: { ...DEFAULT_SETTINGS, stoneTopReveal: 0.375 } };
    expect(reveals(run, options))
      .toMatchObject({ values: { top: 1.375 }, sources: { top: 'rule:top-overlap' } });
    expect(reveals(run, { ...options, runEdges: { top: false, bottom: true }, stacked: { top: true } }))
      .toMatchObject({ values: { top: 0.125 }, sources: { top: 'rule:stacked-seam' } });
    expect(reveals(run, { ...options, manual: { top: 0 } }))
      .toMatchObject({ values: { top: 0 }, sources: { top: 'manual' } });
    expect(reveals(run, { topOverlap: 0 }))
      .toMatchObject({ values: { top: 0.25 }, sources: { top: 'rule:stone-top' } });
    expect(REVEAL_SOURCE_LABELS['rule:top-overlap']).toBe('rule: top overlap');
  });
});
