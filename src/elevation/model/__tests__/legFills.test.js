import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isLegList, legFillPlans, legPreset, legRoom, legWarningText, runLegFills } from '../index.js';
import { room, run, wall } from '../../../test/builders.js';
import { legShape } from './fixtures/legs.js';

const LEG = legShape();
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG] };
const R = run({ x: 10, width: 36 });
const W = wall({ runs: [R] });
const ROOM = room({ walls: [W] });
let nextId = 0;
const four = legPreset('four', { shapeId: LEG.id, proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);

describe('SH7.2 step a leg fills', () => {
  it('anchors 1–2: places left and right panels between the legs', () => {
    for (const [offset, x] of [[0, 10.25], [2, 44.9375]]) {
      const legs = four.map((leg, i) => i === offset ? { ...leg, fill: { type: 'panel' } } : leg);
      const input = { ...R, legs };
      const before = structuredClone(input);
      const result = runLegFills(ROOM, W, input, settings);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: `${legs[offset].id}:fill`, leg: legs[offset], index: offset + 1,
        type: 'panel', side: legs[offset].from,
        bounds: { x, z: 0, width: 0.8125, height: 34.5 },
        back: 3.5, front: 21.875, depth: 18.375, thickness: 0.8125 });
      expect(result.warnings).toEqual([]);
      expect(legFillPlans(input, settings)[0]).toMatchObject({ u0: x, width: 0.8125, takesRoom: true });
      expect(input).toEqual(before);
    }
  });

  it('anchor 3: fills forward from LB alone and makes only LF when both fill the shared gap', () => {
    const legs = four.map((leg, i) => i === 1 ? { ...leg, fill: { type: 'panel' } } : leg);
    const [back] = runLegFills(ROOM, W, { ...R, legs }, settings);
    expect(back).toMatchObject({ id: 'LB:fill', index: 2, bounds: { x: 10.25, z: 0, width: 0.8125, height: 34.5 },
      back: 3.5, front: 21.875, depth: 18.375 });
    legs[0] = { ...legs[0], fill: { type: 'panel' } };
    const both = runLegFills(ROOM, W, { ...R, legs }, settings);
    expect(both).toHaveLength(1);
    expect(both[0].id).toBe('LF:fill');
    expect(both.warnings).toEqual([{ code: 'leg-fill-shared', type: 'panel', index: 2, legId: 'LB', other: 1 }]);
    expect(both.warnings.map(legWarningText)).toEqual(['Leg 2: Leg 1 already fills the gap between them.']);
  });

  it('anchor 4: past panels span from the run back to the door-face line', () => {
    const legs = four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel', past: true } } : leg);
    expect(runLegFills(ROOM, W, { ...R, legs }, settings)[0])
      .toMatchObject({ back: 0, front: 24.875, depth: 24.875 });
  });

  it('anchor 5: front-only fillers reach the run back and allow explicit setback and thickness', () => {
    let id = 0;
    const front = legPreset('front', { shapeId: LEG.id, proud: 0.5 }, () => `front-${++id}`);
    for (const [fill, x, width] of [[{ type: 'filler' }, 10.25, 0.8125],
      [{ type: 'filler', inset: 0, thickness: 0.75 }, 10, 0.75]]) {
      const legs = front.map((leg, i) => i === 0 ? { ...leg, fill } : leg);
      expect(runLegFills(ROOM, W, { ...R, legs }, settings)[0]).toMatchObject({
        type: 'filler', bounds: { x, width }, back: 0, front: 21.875, depth: 21.875, thickness: width,
      });
    }
  });

  it('anchor 6: combines explicit bottom and inherited top clearances', () => {
    const legs = [{ ...four[0], fill: { type: 'panel', bottom: 1 } }, ...four.slice(1)];
    expect(runLegFills(ROOM, W, { ...R, legs }, { ...settings, legPanelTopClearance: 0.5 })[0].bounds)
      .toEqual({ x: 10.25, z: 1, width: 0.8125, height: 33 });
  });

  it('anchor 7: inherits the placed leg bottom on a furniture base', () => {
    const legs = four.map((leg, i) => ({ ...leg, sitsOn: 'base', ...(i === 0 ? { fill: { type: 'panel' } } : {}) }));
    const supported = { ...R, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 }, legs };
    expect(runLegFills(ROOM, W, supported, settings)[0].bounds)
      .toEqual({ x: 10.25, z: 4, width: 0.8125, height: 30.5 });
  });

  it('anchor 8: skips overlapping or touching legs and retains the no-depth warning', () => {
    for (const y of [-18.5, -18.375, -18.375 + 0.5e-6]) {
      const legs = four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel' } } : i === 1 ? { ...leg, y } : leg);
      const fills = runLegFills(ROOM, W, { ...R, legs }, settings);
      expect(fills).toHaveLength(0);
      expect(fills.warnings[0]).toMatchObject({ code: 'leg-fill-no-depth', index: 1, legId: 'LF' });
      expect(legWarningText(fills.warnings[0])).toBe('Leg 1: no room for its panel (the legs touch or overlap).');
    }
  });

  it('anchor 9: takes the largest leg/fill room and respects takesRoom and pin splits on either end', () => {
    const legs = [{ ...four[0], fill: { type: 'panel' } }, ...four.slice(1)];
    expect(legRoom({ ...R, legs }, settings).left).toBe(3.5);
    for (const side of ['left', 'right']) {
      const island = { ...four[0], from: side, y: 4, fill: { type: 'filler' } };
      expect(legRoom({ ...R, legs: [island] }, settings)[side]).toBe(1.0625);
      expect(legRoom({ ...R, legs: [{ ...island, takesRoom: false }] }, settings)[side]).toBe(0);
      expect(legRoom({ ...R, legs: [island], _pinSplit: { [side]: true } }, settings)[side]).toBe(0);
      expect(legRoom({ ...R, legs: [{ ...island, yFrom: 'back', y: 4 }] }, settings)[side]).toBe(1.0625);
      const outside = [{ ...island, y: 12 }, { ...four[0], id: 'outside', from: side, y: 8 }];
      expect(legFillPlans({ ...R, legs: outside }, settings)[0]).toMatchObject({ depth: 0.5, takesRoom: false });
      expect(legRoom({ ...R, legs: outside }, settings)[side]).toBe(0);
    }
  });

  it('anchor 10: validates fill keys and finite nonnegative clearances, positive filler thickness and true-only past', () => {
    for (const fill of [{ type: 'panel' }, { type: 'panel', past: true },
      { type: 'filler', inset: 0, thickness: 0.75, top: 0, bottom: 1 }]) {
      expect(isLegList([{ ...four[0], fill }])).toBe(true);
    }
    const invalid = [undefined, null, [], {}, 'panel', { type: 'nothing' },
      { type: 'panel', thickness: 1 }, { type: 'filler', past: true }, { type: 'panel', unknown: 1 },
      ...[false, null, 1, undefined].map((past) => ({ type: 'panel', past })),
      ...['inset', 'top', 'bottom'].flatMap((key) => [-1, Infinity, NaN, '1', null, undefined]
        .map((value) => ({ type: 'panel', [key]: value }))),
      ...[0, -1, Infinity, NaN, '1', null, undefined].map((thickness) => ({ type: 'filler', thickness }))];
    for (const fill of invalid) expect(isLegList([{ ...four[0], fill }])).toBe(false);
  });

  it('warns for nonpositive fill heights and ignores missing, no-height or opposite-face leg placements', () => {
    for (const type of ['panel', 'filler']) {
      const legs = [{ ...four[0], fill: { type, top: 34.5 } }];
      const fills = runLegFills(ROOM, W, { ...R, legs }, settings);
      expect(fills).toHaveLength(0);
      expect(fills.warnings.map(legWarningText)).toEqual([`Leg 1: its ${type} has no height.`]);
      for (const changes of [{ shapeId: 'missing' }, { height: 'feet' }]) {
        const skipped = runLegFills(ROOM, W, { ...R, z: 0, legs: [{ ...legs[0], ...changes }] }, settings);
        expect(skipped).toHaveLength(0);
        expect(skipped.warnings).toEqual([]);
      }
      expect(runLegFills(ROOM, W, { ...R, wallSide: 'back', legs }, settings)).toHaveLength(0);
    }
  });

  it('chooses the nearest shaped partner at the same end and resolves end thickness and inherited clearances', () => {
    const legs = [
      { ...four[0], fill: { type: 'panel' } },
      { ...four[1], y: -6 },
      { ...four[1], id: 'near', y: -10 },
      { ...four[1], id: 'missing', shapeId: 'missing', y: -15 },
      { ...four[3], y: -17 },
    ];
    const changed = { ...R, legs, _endThickness: { left: 1 } };
    const [fill] = runLegFills(ROOM, W, changed,
      { ...settings, legPanelReveal: 0.5, legPanelBottomClearance: 2, legPanelTopClearance: 1 });
    expect(fill).toMatchObject({ bounds: { x: 10.5, z: 2, width: 1, height: 31.5 }, back: 13.5, front: 21.875 });
    const forward = [{ ...four[1], fill: { type: 'filler' } },
      { ...four[0], id: 'near', y: -10 }, { ...four[0], id: 'far', y: 0 }];
    expect(legFillPlans({ ...R, legs: forward }, settings)[0]).toMatchObject({ back: 3.5, front: 11.375 });
    const shifted = { ...R, outset: 2, _plane: { offset: -1 }, legs: [legs[0]] };
    expect(legFillPlans(shifted, settings)[0]).toMatchObject({ back: 1, front: 22.875 });
    expect(runLegFills(ROOM, W, { ...R, legs: [legs[0]] },
      { ...settings, teamDoorStyle: { ...settings.teamDoorStyle, thickness: 0.75 } })[0].thickness).toBe(0.75);
  });
});
