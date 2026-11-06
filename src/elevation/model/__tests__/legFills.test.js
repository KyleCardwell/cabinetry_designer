import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DEFAULT_SETTINGS, isEndLegs, isLegList, legFillPlans,
  legRoom, legWarningText, runLegFills, runLegs } from '../index.js';
import { auto, room, run, wall } from '../../../test/builders.js';
import { E, S, Sf, fourEndLegs, legShape, noEnds } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const R = run({ x: 10, width: 36, ends: noEnds });
const R4 = { ...R, endLegs: fourEndLegs };
const W = wall({ runs: [R4] });
const ROOM = room({ walls: [W] });
const leftId = `${R.id}:endleg:left-front`;

describe('SH7.5 step b legs and fills from the run end', () => {
  it('anchors 1–3: places and names four end legs, then indexes hand legs independently', () => {
    const before = structuredClone(R4);
    const legs = runLegs(ROOM, W, R4, settings);
    expect(legs).toHaveLength(4);
    expect(legs[0]).toMatchObject({ bounds: { x: 10, width: 3.5, z: 0, height: 34.5 },
      front: 25.375, back: 21.875, name: 'Left front leg' });
    expect(legs[1]).toMatchObject({ front: 3.5, back: 0, name: 'Left back leg' });
    expect(legs[2]).toMatchObject({ bounds: { x: 42.5 }, name: 'Right front leg' });
    expect(legs[3].name).toBe('Right back leg');
    for (const leg of legs) expect(leg).not.toHaveProperty('index');
    const L = { ...S, id: 'L', from: 'left', yFrom: 'front', y: 4 };
    const mixed = runLegs(ROOM, W, { ...R4, legs: [L] }, settings);
    expect(mixed[4]).toMatchObject({ leg: L, index: 1 });
    expect(mixed[4]).not.toHaveProperty('name');
    expect(legRoom(R4, settings)).toEqual({ left: 3.5, right: 3.5 });
    expect(R4).toEqual(before);
  });

  it('anchors 4 and 7: places left and right panels between their own end legs', () => {
    for (const [side, x] of [['left', 10.25], ['right', 44.9375]]) {
      const input = { ...R4, endLegs: { ...fourEndLegs, [side]: { ...E, fit: 'between' } } };
      const before = structuredClone(input);
      const fills = runLegFills(ROOM, W, input, settings);
      expect(fills).toHaveLength(1);
      expect(fills[0]).toMatchObject({ id: `${R.id}:endleg:${side}-front:fill`, type: 'panel', side,
        name: `${side === 'left' ? 'Left' : 'Right'} front leg`,
        bounds: { x, z: 0, width: 0.8125, height: 34.5 },
        back: 3.5, front: 21.875, depth: 18.375, thickness: 0.8125, returns: [] });
      expect(fills[0]).not.toHaveProperty('index');
      expect(fills.warnings).toEqual([]);
      expect(legFillPlans(input, settings)[0]).toMatchObject({ legId: `${R.id}:endleg:${side}-front`,
        name: fills[0].name, u0: x, width: 0.8125, takesRoom: true });
      expect(input).toEqual(before);
    }
  });

  it('anchor 5: an end piece suppresses its fit without suppressing its leg room', () => {
    for (const fit of ['between', 'behind']) {
      const input = { ...R4, ends: { ...noEnds, left: { type: 'end_panel', width: null } },
        endLegs: { ...fourEndLegs, left: { ...E, fit } } };
      expect(runLegFills(ROOM, W, input, settings)).toHaveLength(0);
      expect(legFillPlans(input, settings)).toEqual([]);
      expect(legRoom(input, settings).left).toBe(3.5);
    }
  });

  it('anchor 6: plans both returns at either end and reserves their room', () => {
    for (const [side, x, start, end] of [['left', 10.25, 11.0625, 14.75], ['right', 44.9375, 41.25, 44.9375]]) {
      const input = { ...R4, endLegs: { ...fourEndLegs, [side]: { ...E, fit: 'between', panel: { returns: 'both' } } } };
      const returns = [
        { edge: 'front', start, end, back: 21.0625, front: 21.875, takesRoom: true },
        { edge: 'back', start, end, back: 3.5, front: 4.3125, takesRoom: true },
      ];
      expect(legFillPlans(input, settings)[0]).toMatchObject({ u0: x, width: 0.8125,
        back: 3.5, front: 21.875, returnDepth: 4.5, returns });
      expect(runLegFills(ROOM, W, input, settings)[0]).toMatchObject({
        bounds: { x, z: 0, width: 0.8125, height: 34.5 }, returnDepth: 4.5, returns });
      expect(legRoom(input, settings)[side]).toBe(4.75);
    }
  });

  it('anchor 8: front fillers use the run face, cabinet-side return and box height', () => {
    for (const [side, x, start, end] of [['left', 10, 12.75, 13.5], ['right', 42.5, 42.5, 43.25]]) {
      const input = { ...R, endLegs: { [side]: { legs: 'front', front: Sf, fit: 'behind' } } };
      const before = structuredClone(input);
      const fills = runLegFills(ROOM, W, input, settings);
      expect(fills).toHaveLength(1);
      expect(fills[0]).toMatchObject({ id: `${R.id}:endleg:${side}-front:fill`, type: 'filler', side,
        bounds: { x, width: 3.5, z: 4, height: 30.5 },
        face: { back: 21.0625, front: 21.875 }, ret: { start, end, back: 18.6875, front: 21.1875 },
        front: 21.875, back: 18.6875, thickness: 0.8125, orderedDepth: 3.1875 });
      expect(fills.warnings).toEqual([]);
      expect(legRoom(input, settings)[side]).toBe(3.5);
      expect(input).toEqual(before);
    }
  });

  it('anchor 9: missing back shapes fall back to B and warn with the end-leg name', () => {
    const input = { ...R4, endLegs: { ...fourEndLegs,
      left: { ...E, fit: 'between', back: { ...S, shapeId: 'gone' } } } };
    expect(runLegFills(ROOM, W, input, settings)[0]).toMatchObject({ back: 0, front: 21.875, depth: 21.875 });
    const warnings = runLegs(ROOM, W, input, settings).warnings;
    expect(warnings).toEqual([{ code: 'leg-shape-missing', name: 'Left back leg', legId: `${R.id}:endleg:left-back` }]);
    expect(warnings.map(legWarningText)).toEqual(["Left back leg: its shape isn't in the library."]);
  });

  it('anchor 10: touching or overlapping end legs retain a named no-depth warning', () => {
    for (const y of [-18.5, -18.375, -18.375 + 0.5e-6]) {
      const input = { ...R4, endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', back: { ...S, y } } } };
      const fills = runLegFills(ROOM, W, input, settings);
      expect(fills).toHaveLength(0);
      expect(fills.warnings).toEqual([{ code: 'leg-fill-no-depth', type: 'panel', name: 'Left front leg', legId: leftId }]);
      expect(fills.warnings.map(legWarningText)).toEqual(['Left front leg: no room for its panel (the legs touch or overlap).']);
    }
  });

  it('anchor 11: rejects every hand-leg fill, including an explicitly undefined key', () => {
    const L = { ...S, id: 'L', from: 'left', yFrom: 'front' };
    expect(isLegList([L])).toBe(true);
    for (const fill of [{ type: 'panel' }, { type: 'filler' }, undefined, null]) {
      expect(isLegList([{ ...L, fill }])).toBe(false);
    }
  });

  it('anchor 12: warning text prefers names and preserves hand-leg wording', () => {
    expect(legWarningText({ code: 'leg-no-height', name: 'Right back leg' }))
      .toBe('Right back leg has no height (the run sits on the floor).');
    expect(legWarningText({ code: 'leg-no-height', index: 2 }))
      .toBe('Leg 2 has no height (the run sits on the floor).');
    for (const code of ['leg-fill-return-short', 'leg-fill-no-depth', 'leg-fill-no-height', 'leg-shape-missing',
      'leg-no-height', 'leg-no-base', 'leg-no-countertop', 'shape-too-small', 'leg-fixed-height']) {
      const args = { code, index: 2, type: 'panel', target: 4, fixed: 26.5, height: 34.5 };
      expect(legWarningText({ ...args, name: 'Right back leg' })).toBe(legWarningText(args).replace('Leg 2', 'Right back leg'));
    }
  });

  it('uses only the same end’s back leg, ignoring nearer hand legs and other ends', () => {
    const input = { ...R4, endLegs: { ...fourEndLegs,
      left: { ...E, fit: 'between', back: { ...S, y: -10 } } },
    legs: [{ ...S, id: 'near', from: 'left', yFrom: 'back', y: -14 },
      { ...S, id: 'other', from: 'right', yFrom: 'back', y: -17 }], _endThickness: { left: 1 } };
    expect(runLegFills(ROOM, W, input,
      { ...settings, legPanelReveal: 0.5, legPanelBottomClearance: 2, legPanelTopClearance: 1 })[0])
      .toMatchObject({ bounds: { x: 10.5, z: 2, width: 1, height: 31.5 }, back: 13.5, front: 21.875 });
    const shifted = { ...R4, outset: 2, _plane: { offset: -1 }, endLegs: { left: {
      ...E, fit: 'between', back: { ...S, shapeId: 'missing' } } } };
    expect(legFillPlans(shifted, settings)[0]).toMatchObject({ back: 1, front: 22.875 });
    expect(runLegFills(ROOM, W, { ...R4, endLegs: { left: { ...E, fit: 'between' } } },
      { ...settings, teamDoorStyle: { ...settings.teamDoorStyle, thickness: 0.75 } })[0].thickness).toBe(0.75);
  });

  it('matches fills to both end-leg ids even with skipped end legs and hand placements', () => {
    const input = { ...R4, endLegs: {
      left: { ...E, fit: 'between', front: { ...Sf, shapeId: 'missing' } },
      right: { ...E, fit: 'between', front: { ...Sf, sitsOn: 'base' } },
    }, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 },
    legs: [{ ...S, id: 'hand', from: 'left', yFrom: 'front' }] };
    const fills = runLegFills(ROOM, W, input, settings);
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ id: `${R.id}:endleg:right-front:fill`, name: 'Right front leg', bounds: { z: 4, height: 30.5 } });
  });

  it('keeps both end fills distinct with different supports and clearances', () => {
    const input = { ...R4, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 }, endLegs: {
      left: { ...E, fit: 'between', panel: { bottom: 1 } },
      right: { ...E, fit: 'between', front: { ...Sf, sitsOn: 'base' }, panel: { top: 2 } },
    } };
    const fills = runLegFills(ROOM, W, input, settings);
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ id: `${leftId}:fill`, name: 'Left front leg', bounds: { z: 1, height: 33.5 } });
    expect(fills[1]).toMatchObject({ id: `${R.id}:endleg:right-front:fill`, name: 'Right front leg', bounds: { z: 4, height: 28.5 } });
    expect(fills.warnings).toEqual([]);
  });

  it('retains hand warning indices after named skipped end legs', () => {
    const input = { ...R4, endLegs: { left: { ...E, back: { ...S, shapeId: 'gone' } } },
      legs: [{ ...S, id: 'missing-hand', shapeId: 'gone', from: 'right', yFrom: 'front' },
        { ...S, id: 'hand', from: 'right', yFrom: 'front' }] };
    const legs = runLegs(ROOM, W, input, settings);
    expect(legs.warnings.map(legWarningText)).toEqual([
      "Left back leg: its shape isn't in the library.", "Leg 1: its shape isn't in the library.",
    ]);
    expect(legs.at(-1)).toMatchObject({ index: 2, leg: { id: 'hand' } });
    expect(legs.at(-1)).not.toHaveProperty('name');
  });

  it('uses MDF face thickness and shop filler standards, ignoring panel and end overrides', () => {
    const mdf = { ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 1 };
    const thin = { ...mdf, id: 'thin', thickness: 0.75 };
    const styledRoom = room({ walls: [W], doorStyles: [mdf, thin], doorStyleId: 'mdf' });
    const input = run({ ...R, items: [auto('a'), { ...auto('b'), doorStyleId: 'thin' }],
      endLegs: { left: { legs: 'front', front: { ...Sf, height: 4 }, fit: 'behind' } },
      endFiller: { left: { width: 6, returnDepth: 10 } }, _endThickness: { left: 2 } });
    const standards = { ...settings, fillerReturnThickness: 0.5, fillerReturnDepth: 3,
      fillerReturnTongue: 0.25, legPanelReveal: 2, legPanelTopClearance: 10, legPanelBottomClearance: 10 };
    expect(runLegFills(styledRoom, W, input, standards)[0]).toMatchObject({
      bounds: { x: 10, width: 3.5, z: 4, height: 30.5 }, thickness: 1,
      face: { back: 20.875, front: 21.875 }, ret: { start: 13, end: 13.5, back: 18.125, front: 21.125 },
      back: 18.125, front: 21.875, orderedDepth: 3.75 });
    expect(legFillPlans(input, standards)[0].thickness).toBe(0.8125);
    expect(runLegFills(ROOM, W, input, { ...standards, fillerThickness: 0.625 })[0].thickness).toBe(0.625);
    const mixed = { ...input, grid: run({ items: [auto('a'), { ...auto('b'), doorStyleId: 'default' }] }).grid };
    expect(runLegFills(styledRoom, W, mixed, standards)[0].thickness).toBe(0.8125);
    expect(runLegFills(ROOM, W, input, { ...standards, fillerReturnDepth: 0 })[0])
      .toMatchObject({ back: 21.0625, front: 21.875, orderedDepth: 0.8125 });
  });

  it('combines explicit bottom and inherited top clearances and uses the placed support', () => {
    const end = { ...E, fit: 'between', panel: { bottom: 1 } };
    expect(runLegFills(ROOM, W, { ...R4, endLegs: { left: end } }, { ...settings, legPanelTopClearance: 0.5 })[0].bounds)
      .toEqual({ x: 10.25, z: 1, width: 0.8125, height: 33 });
    const supported = { ...R4, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 },
      endLegs: { left: { ...end, front: { ...Sf, sitsOn: 'base' }, panel: {} } } };
    expect(runLegFills(ROOM, W, supported, settings)[0].bounds).toEqual({ x: 10.25, z: 4, width: 0.8125, height: 30.5 });
  });

  it('warns for zero panel height and ignores missing, zero-height or opposite-face placements', () => {
    for (const fit of ['between', 'behind']) {
      const end = { ...E, fit, ...(fit === 'between' ? { panel: { top: 34.5 } } : {}) };
      const input = { ...R4, endLegs: { left: end } };
      if (fit === 'between') {
        const fills = runLegFills(ROOM, W, input, settings);
        expect(fills).toHaveLength(0);
        expect(fills.warnings.map(legWarningText)).toEqual(['Left front leg: its panel has no height.']);
      }
      for (const changes of [{ shapeId: 'missing' }, { height: 'feet' }]) {
        const skipped = runLegFills(ROOM, W, { ...input, z: 0,
          endLegs: { left: { ...end, front: { ...Sf, ...changes } } } }, settings);
        expect(skipped).toHaveLength(0);
        expect(skipped.warnings).toEqual([]);
      }
      expect(runLegFills(ROOM, { ...W, side: 'front' }, { ...input, wallSide: 'back' }, settings)).toHaveLength(0);
    }
  });

  it('reserves the largest leg, panel or return room and respects takesRoom and pin splits', () => {
    for (const side of ['left', 'right']) {
      for (const [returns, returnDepth, expected] of [['both', undefined, 4.75], ['front', 3, 3.5]]) {
        const panel = { returns, ...(returnDepth === undefined ? {} : { returnDepth }) };
        expect(legRoom({ ...R4, endLegs: { [side]: { ...E, fit: 'between', panel } } }, settings)[side]).toBe(expected);
      }
      const end = { ...E, front: { ...Sf, x: 1 }, back: { ...S, takesRoom: false },
        fit: 'between', panel: { returns: 'front', inset: 0.5 } };
      const input = { ...R4, endLegs: { [side]: end } };
      expect(legRoom(input, settings)[side]).toBe(4);
      for (const pick of [{ ...input, endLegs: { [side]: { ...end, front: { ...end.front, takesRoom: false } } } },
        { ...input, _pinSplit: { [side]: true } }]) {
        expect(legRoom(pick, settings)[side]).toBe(0);
        expect(legFillPlans(pick, settings)[0].returns[0].takesRoom).toBe(false);
      }
      for (const [y, x, expected] of [[4, 0, 3.5], [4.5, 1, 2.5], [12, 0, 0]]) {
        const input = { ...R, endLegs: { [side]: { legs: 'front', front: { ...Sf, y, x }, fit: 'behind' } } };
        expect(legRoom(input, settings)[side]).toBe(expected);
        if (y === 12) expect(legFillPlans(input, settings)[0])
          .toMatchObject({ back: 30.1875, front: 33.375, takesRoom: false });
      }
    }
  });

  it('an island back return behind B reserves no room independently of its panel', () => {
    const end = { ...E, fit: 'between', panel: { returns: 'back' }, back: { ...S, y: 12 } };
    const input = { ...R4, endLegs: { left: end } };
    expect(legFillPlans(input, settings)[0]).toMatchObject({ back: -8.5, front: 21.875, depth: 30.375,
      takesRoom: true, returns: [{ edge: 'back', back: -8.5, front: -7.6875, takesRoom: false }] });
    expect(legRoom(input, settings).left).toBe(3.5);
    for (const overlap of [0.5e-6, 2e-6]) {
      const shifted = { ...input, endLegs: { left: { ...end, back: { ...S, y: 4.3125 - overlap } } } };
      expect(legFillPlans(shifted, settings)[0].returns[0].takesRoom).toBe(overlap > 1e-6);
      expect(legRoom(shifted, settings).left).toBe(overlap > 1e-6 ? 4.75 : 3.5);
    }
  });

  it('keeps a plain panel and named warning when return depth is no greater than thickness', () => {
    for (const returnDepth of [0.75, 0.8125, 0.8125 + 0.5e-6]) {
      const input = { ...R4, endLegs: { left: { ...E, fit: 'between', panel: { returns: 'front', returnDepth } } } };
      const [plan] = legFillPlans(input, settings);
      expect(plan.returns).toEqual([]);
      expect(plan).not.toHaveProperty('returnDepth');
      const fills = runLegFills(ROOM, W, input, settings);
      expect(fills).toHaveLength(1);
      expect(fills[0]).toMatchObject({ bounds: { x: 10.25, z: 0, width: 0.8125, height: 34.5 }, returns: [] });
      expect(fills[0]).not.toHaveProperty('returnDepth');
      expect(fills.warnings).toEqual([{ code: 'leg-fill-return-short', name: 'Left front leg', legId: leftId }]);
      expect(fills.warnings.map(legWarningText)).toEqual(["Left front leg: its panel return is no deeper than the panel's thickness."]);
      expect(legRoom(input, settings).left).toBe(3.5);
    }
  });

  it('validates panel clearances, past and return settings on the run end', () => {
    for (const panel of [{}, { past: true, inset: 0, top: 0, bottom: 1 },
      ...['front', 'back', 'both'].flatMap((returns) => [{ returns }, { returns, returnDepth: 4 }])]) {
      expect(isEndLegs({ left: { ...E, fit: 'between', panel } })).toBe(true);
    }
    for (const panel of [undefined, null, [], { type: 'panel' }, { unknown: 1 }, { returnDepth: 4 }, { returns: 'side' },
      ...[false, null, 1, undefined].map((past) => ({ past })),
      ...['inset', 'top', 'bottom'].flatMap((key) => [-1, Infinity, NaN, '1', null, undefined].map((value) => ({ [key]: value }))),
      ...[0, -1, Infinity, NaN, '4', undefined, null].map((returnDepth) => ({ returns: 'both', returnDepth }))]) {
      expect(isEndLegs({ left: { ...E, fit: 'between', panel } })).toBe(false);
    }
  });

  it('uses past edges, inherited or explicit return depth, thickness and panel clearances', () => {
    const end = { ...E, fit: 'between', panel: { returns: 'both', past: true, bottom: 1, top: 2 } };
    const input = { ...R4, endLegs: { left: end }, _endThickness: { left: 1 } };
    const inherited = { ...settings, legPanelReturnDepth: 6 };
    const [fill] = runLegFills(ROOM, W, input, inherited);
    expect(fill).toMatchObject({ bounds: { x: 10.25, z: 1, width: 1, height: 31.5 }, returnDepth: 6, returns: [
      { edge: 'front', start: 11.25, end: 16.25, back: 23.875, front: 24.875 },
      { edge: 'back', start: 11.25, end: 16.25, back: 0, front: 1 },
    ] });
    expect(legRoom(input, inherited).left).toBe(6.25);
    const explicit = { ...input, endLegs: { left: { ...end, panel: { ...end.panel, returns: 'back', returnDepth: 2 } } } };
    expect(runLegFills(ROOM, W, explicit, inherited)[0]).toMatchObject({ returnDepth: 2,
      returns: [{ edge: 'back', start: 11.25, end: 12.25, back: 0, front: 1 }] });
    const narrow = { ...input, endLegs: { left: { ...end, panel: { returns: 'front', returnDepth: 1 + 2e-6 } } } };
    expect(legFillPlans(narrow, settings)[0].returns).toHaveLength(1);
  });
});
