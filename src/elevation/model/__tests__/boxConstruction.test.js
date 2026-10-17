import { describe, expect, it } from 'vitest';
import { boxConstruction, CABINET_TYPE_IDS } from '../index.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const base = { cabinetTypeId: BASE };
const wall = { thickness: 4 };

describe('boxConstruction', () => {
  it('anchor 1: resolves an empty leaf to all standard values and sources', () => {
    expect(boxConstruction({}, base, wall)).toEqual({
      back: 'dado', top: 'between', bottom: 'between', left: true, right: true,
      finTop: false, finBottom: false,
      sources: {
        back: 'standard', top: 'standard', bottom: 'standard', left: 'standard',
        right: 'standard', finTop: 'standard', finBottom: 'standard',
      },
    });
  });

  it('anchor 2: gives a sink top spreaders, unless the top is manual', () => {
    expect(boxConstruction({ purpose: 'sink' }, base, wall)).toMatchObject({
      top: 'spreaders', back: 'dado', sources: { top: 'rule:sink', back: 'standard' },
    });
    expect(boxConstruction({ purpose: 'sink', box: { top: 'between' } }, base, wall))
      .toMatchObject({ top: 'between', sources: { top: 'manual' } });
  });

  it('anchor 3: hanging bases take precedence over the island rule', () => {
    expect(boxConstruction({}, { ...base, hanging: true }, { thickness: 0 }))
      .toMatchObject({ back: 'inset', sources: { back: 'rule:hanging' } });
    for (const cabinetTypeId of [UPPER, TALL]) {
      expect(boxConstruction({}, { cabinetTypeId, hanging: true }, wall))
        .toMatchObject({ back: 'dado', sources: { back: 'standard' } });
    }
    expect(boxConstruction({}, { ...base, hanging: 1 }, wall))
      .toMatchObject({ back: 'dado', sources: { back: 'standard' } });
  });

  it('anchor 4: a resolved missing bottom takes precedence over medicine and other back rules', () => {
    const leaf = { purpose: 'medicine', box: { bottom: 'none' } };
    expect(boxConstruction(leaf, { cabinetTypeId: UPPER }, wall)).toMatchObject({
      bottom: 'none', back: 'inset', sources: { bottom: 'manual', back: 'rule:no-bottom' },
    });
    expect(boxConstruction(leaf, { ...base, hanging: true }, { thickness: 0 }))
      .toMatchObject({ back: 'inset', sources: { back: 'rule:no-bottom' } });
    expect(boxConstruction({ purpose: 'medicine' }, { ...base, hanging: true }, { thickness: 0 }))
      .toMatchObject({ back: 'applied', sources: { back: 'rule:medicine' } });
  });

  it('anchor 5: preserves manual values, including standard values and false flags', () => {
    expect(boxConstruction({ box: { back: 'dado', bottom: 'none' } }, { cabinetTypeId: TALL }, wall))
      .toMatchObject({ back: 'dado', sources: { back: 'manual' } });
    const box = Object.freeze({
      back: 'none', top: 'overlay', bottom: 'overlay', left: false, right: false,
      finTop: true, finBottom: false,
    });
    const leaf = Object.freeze({ purpose: 'sink', box });
    expect(boxConstruction(leaf, Object.freeze(base), Object.freeze(wall))).toEqual({
      ...box,
      sources: Object.fromEntries(Object.keys(box).map((key) => [key, 'manual'])),
    });
    expect(leaf.box).toBe(box);
  });

  it('anchor 6: suppresses finished flags on non-full panels without changing stored overrides', () => {
    const leaf = { purpose: 'cooktop', box: { finTop: true } };
    expect(boxConstruction(leaf, base, wall)).toMatchObject({
      top: 'spreaders', finTop: false, sources: { top: 'rule:cooktop', finTop: 'rule:not-full' },
    });
    expect(leaf.box).toEqual({ finTop: true });
    for (const panel of ['between', 'overlay', 'spreaders', 'none']) {
      for (const finished of [undefined, false, true]) {
        const box = { top: panel, bottom: panel };
        if (finished !== undefined) Object.assign(box, { finTop: finished, finBottom: finished });
        const full = panel === 'between' || panel === 'overlay';
        const source = full ? (finished === undefined ? 'standard' : 'manual') : 'rule:not-full';
        expect(boxConstruction({ box }, base, wall)).toMatchObject({
          finTop: full && finished === true,
          finBottom: full && finished === true,
          sources: { finTop: source, finBottom: source },
        });
      }
    }
  });

  it('uses inset backs on zero-thickness walls for all cabinet types, with manual backs winning', () => {
    for (const cabinetTypeId of [BASE, UPPER, TALL]) {
      const run = { cabinetTypeId };
      expect(boxConstruction({}, run, { thickness: 0 }))
        .toMatchObject({ back: 'inset', sources: { back: 'rule:island' } });
      for (const thickness of [4, 0.5, undefined]) {
        expect(boxConstruction({}, run, { thickness }))
          .toMatchObject({ back: 'dado', sources: { back: 'standard' } });
      }
      for (const back of ['dado', 'inset', 'applied', 'none']) {
        expect(boxConstruction({ purpose: 'medicine', box: { back } }, run, { thickness: 0 }))
          .toMatchObject({ back, sources: { back: 'manual' } });
      }
    }
  });
});
