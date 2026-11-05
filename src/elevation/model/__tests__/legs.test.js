import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS, isLegList, legBottom, legPreset,
  legRoom, legWarningText, runLegs } from '../index.js';
import { flipRunsForWall } from '../room.js';
import { room, run, wall } from '../../../test/builders.js';
import { legShape } from './fixtures/legs.js';

const LEG = legShape();
const FOOT = {
  id: 'foot', name: 'Foot', kind: 'leg', version: 1, archived: false,
  box: { x: -1.25, y: -1.25, z: 0, w: 2.5, h: 4, d: 2.5 }, stretch: {},
  views: { front: {
    units: 'in', points: { a: [-1.25, 0], b: [1.25, 0], c: [1.25, 4], d: [-1.25, 4] },
    loops: [{ id: 'rect', closed: true, segs: ['a', 'b', 'c', 'd'].map((from, i, ids) => ({
      type: 'line', from, to: ids[(i + 1) % ids.length],
    })) }],
  } },
};
const settings = { ...DEFAULT_SETTINGS, shapes: [LEG, FOOT] };
const leg = { id: 'lg-1', shapeId: LEG.id, from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' };
const R = run({ x: 10, width: 36 });
const W = wall({ runs: [R] });
const ROOM = room({ walls: [W] });

describe('SH7 step a run leg placement and presets', () => {
  it('anchor 1: places the built LEG at the left door-face corner, including its plan circle', () => {
    const [placed] = runLegs(ROOM, W, { ...R, legs: [leg] }, settings);
    expect(placed).toMatchObject({ leg, index: 1, shapeName: 'Leg', stretched: false,
      bounds: { x: 10, z: 0, width: 3.5, height: 34.5 }, front: 24.875, back: 21.375,
      insert: { x: 11.75, z: 0 }, size: { w: 3.5, h: 34.5, d: 3.5 }, warnings: [],
      plan: { top: 34.5 } });
    expect(placed.plan.loops[0]).toEqual({ closed: true,
      points: [[10, 24.875, 0], [13.5, 24.875, 0], [13.5, 21.375, 0], [10, 21.375, 0]] });
    // Two semicircles still describe radius 1.5 around (11.75, 23.125).
    expect(placed.plan.loops[1]).toEqual({ closed: true,
      points: [[13.25, 23.125, -1], [10.25, 23.125, -1]] });
    expect(placed.outlines[0].outline).toEqual([
      [10, 26.5, 0], [13.5, 26.5, 0], [13.5, 34.5, 0], [10, 34.5, 0],
    ]);
  });

  it('anchor 2: places a right/back leg flush with both run faces', () => {
    const [placed] = runLegs(ROOM, W, { ...R, legs: [{ ...leg, from: 'right', yFrom: 'back' }] }, settings);
    expect(placed).toMatchObject({ bounds: { x: 42.5 }, front: 3.5, back: 0 });
    const [offset] = runLegs(ROOM, W, { ...R, outset: 2, _plane: { offset: -1 },
      legs: [{ ...leg, from: 'right', x: 2, yFrom: 'back', y: -1 }] }, settings);
    expect(offset).toMatchObject({ bounds: { x: 44.5 }, front: 5.5, back: 2 });
  });

  it('anchor 3: stretches the top block at 30 and retains own height for feet below the fixed parts', () => {
    const pick = { ...leg, x: -2, y: 0.75, height: 30 };
    const [placed] = runLegs(ROOM, W, { ...R, legs: [pick] }, settings);
    expect(placed).toMatchObject({ bounds: { x: 12, height: 30 }, front: 25.625, stretched: true,
      size: { h: 30 }, plan: { top: 30 }, warnings: [] });
    expect(placed.outlines[0].outline.map(([, z]) => z)).toEqual([26.5, 26.5, 30, 30]);
    const [feet] = runLegs(ROOM, W, { ...R, legs: [{ ...pick, height: 'feet' }] }, settings);
    expect(feet).toMatchObject({ stretched: false, bounds: { height: 34.5 }, plan: { top: 34.5 },
      warnings: [{ code: 'shape-too-small', fixed: 26.5, target: 4, height: 34.5, index: 1 }] });
    expect(legWarningText(feet.warnings[0])).toBe('Leg 1 can\'t be 4" tall: its fixed parts are 26 1/2". Drawn at 34 1/2".');
  });

  it('anchor 4: uses the fixed FOOT height and fallback plan rectangle, warning only for full height', () => {
    const [feet] = runLegs(ROOM, W, { ...R, legs: [{ ...leg, shapeId: FOOT.id, height: 'feet' }] }, settings);
    expect(feet).toMatchObject({ bounds: { height: 4 }, size: { w: 2.5, h: 4, d: 2.5 }, warnings: [] });
    expect(feet.plan).toEqual({ top: 4, loops: [{ closed: true,
      points: [[10, 24.875, 0], [12.5, 24.875, 0], [12.5, 22.375, 0], [10, 22.375, 0]] }] });
    const [full] = runLegs(ROOM, W, { ...R, legs: [{ ...leg, shapeId: FOOT.id }] }, settings);
    expect(full.bounds.height).toBe(4);
    expect(full.warnings).toHaveLength(1);
    expect(legWarningText(full.warnings[0])).toBe('Leg 1 doesn\'t stretch: drawn at its own height, 4".');
  });

  it('anchor 5: generates three corners in order, and all other additive presets with fresh ids', () => {
    let id = 0;
    const newId = () => `lg-${++id}`;
    const options = { shapeId: LEG.id, height: 'feet', proud: 0.5, backOffset: 1, leaveOut: 'RB' };
    const three = legPreset('three', options, newId);
    expect(three).toEqual([
      { id: 'lg-1', shapeId: LEG.id, height: 'feet', from: 'left', x: 0, yFrom: 'front', y: 0.5, mirror: true },
      { id: 'lg-2', shapeId: LEG.id, height: 'feet', from: 'left', x: 0, yFrom: 'back', y: 1, mirror: true, mirrorDepth: true },
      { id: 'lg-3', shapeId: LEG.id, height: 'feet', from: 'right', x: 0, yFrom: 'front', y: 0.5 },
    ]);
    const code = ({ from, yFrom }) => `${from[0].toUpperCase()}${yFrom[0].toUpperCase()}`;
    for (const [preset, codes] of [['four', ['LF', 'LB', 'RF', 'RB']], ['front', ['LF', 'RF']],
      ['left', ['LF', 'LB']], ['right', ['RF', 'RB']]]) {
      const picks = legPreset(preset, { shapeId: LEG.id }, newId);
      expect(picks.map(code)).toEqual(codes);
      for (const pick of picks) {
        expect(Object.hasOwn(pick, 'mirror')).toBe(pick.from === 'left');
        expect(Object.hasOwn(pick, 'mirrorDepth')).toBe(pick.yFrom === 'back');
        if (pick.from === 'left') expect(pick.mirror).toBe(true);
        if (pick.yFrom === 'back') expect(pick.mirrorDepth).toBe(true);
      }
      expect(picks.every(({ x, y, height }) => x === 0 && y === 0 && height === 'full')).toBe(true);
      expect(isLegList([...three, ...picks])).toBe(true);
    }
    for (const leaveOut of ['LF', 'LB', 'RF', 'RB']) {
      const picks = legPreset('three', { ...options, leaveOut }, newId);
      expect(picks.map(code)).toEqual(['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut));
      for (const pick of picks) {
        expect(pick.mirror).toBe(pick.from === 'left' ? true : undefined);
        expect(pick.mirrorDepth).toBe(pick.yFrom === 'back' ? true : undefined);
      }
    }
  });

  it('anchor 6: omits missing/no-height legs but keeps their warnings and original list indices', () => {
    const picks = [{ ...leg, shapeId: 'zz' }, { ...leg, id: 'lg-2', height: 'feet' }, { ...leg, id: 'lg-3' }];
    const result = runLegs(ROOM, W, { ...R, z: 0, legs: picks }, settings);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(3);
    expect(result.warnings.slice(0, 2).map(legWarningText)).toEqual([
      'Leg 1: its shape isn\'t in the library.', 'Leg 2 has no height (the run sits on the floor).',
    ]);
    expect(runLegs(ROOM, W, { ...R, z: 1e-6, legs: [{ ...leg, height: 'feet' }] }, settings)).toHaveLength(0);
    expect(isLegList([leg, leg])).toBe(false);
  });

  it('mirrors front and plan bulges once, and seats nonzero size-box origins on the floor on either wall face', () => {
    const shifted = { ...FOOT, id: 'shifted', kind: 'other', archived: true,
      box: { ...FOOT.box, z: -2 }, views: { front: { ...FOOT.views.front,
        points: Object.fromEntries(Object.entries(FOOT.views.front.points).map(([id, [x, z]]) => [id, [x, z - 2]])),
      } } };
    const [offset] = runLegs(ROOM, W, { ...R, legs: [{ ...leg, shapeId: shifted.id, mirror: true }] },
      { ...settings, shapes: [shifted] });
    expect(offset).toMatchObject({ shapeName: 'Foot', bounds: { x: 10, z: 0, height: 4 }, insert: { x: 11.25, z: 2 } });
    const original = structuredClone(LEG);
    const [normal] = runLegs(ROOM, W, { ...R, legs: [leg] }, settings);
    const backRun = { ...R, wallSide: 'back', legs: [{ ...leg, mirror: true }] };
    const backWall = { ...W, runs: [backRun] };
    const [mirrored] = runLegs(room({ walls: [backWall] }), backWall, backRun, settings);
    expect(mirrored.bounds).toEqual(normal.bounds);
    for (let i = 0; i < normal.outlines.length; i += 1) {
      expect(mirrored.outlines[i].outline).toEqual(normal.outlines[i].outline.map(([x, z, b]) => [23.5 - x, z, -b || 0]));
    }
    expect(mirrored.plan.loops[1].points).toEqual([[10.25, 23.125, 1], [13.25, 23.125, 1]]);
    expect(LEG).toEqual(original);
  });
});

describe('SH5.1 step d handed legs', () => {
  it('anchors 1–2: mirrors the KNEE foot pad front–back and left–right about its size box', () => {
    const KNEE = {
      ...FOOT, id: 'knee', name: 'Knee', box: { x: -1, y: -1, z: 0, w: 2, h: 30, d: 2 },
      views: {
        front: { ...FOOT.views.front, points: { a: [-1, 0], b: [1, 0], c: [1, 30], d: [-1, 30] } },
        plan: { ...FOOT.views.front, points: { a: [0, -1], b: [1, -1], c: [1, 0], d: [0, 0] } },
      },
    };
    const pick = { ...leg, shapeId: KNEE.id, from: 'right', height: 30 };
    const place = (flags) => runLegs(ROOM, W, { ...R, legs: [{ ...pick, ...flags }] },
      { ...settings, shapes: [KNEE] })[0];
    const normal = place({});
    expect(normal.plan.loops[0].points).toEqual([
      [45, 24.875, 0], [46, 24.875, 0], [46, 23.875, 0], [45, 23.875, 0],
    ]);
    const depth = place({ mirrorDepth: true });
    expect(depth.plan.loops[0].points).toEqual([
      [45, 22.875, 0], [46, 22.875, 0], [46, 23.875, 0], [45, 23.875, 0],
    ]);
    expect(depth.outlines).toEqual(normal.outlines);
    expect(depth.insert).toEqual(normal.insert);
    expect(depth.bounds).toEqual(normal.bounds);
    expect([depth.front, depth.back]).toEqual([normal.front, normal.back]);
    const both = place({ mirrorDepth: true, mirror: true });
    expect(both.plan.loops[0].points).toEqual([
      [45, 22.875, 0], [44, 22.875, 0], [44, 23.875, 0], [45, 23.875, 0],
    ]);
    expect(both.outlines).toEqual(place({ mirror: true }).outlines);
    const shifted = { ...KNEE, box: { ...KNEE.box, y: 4 }, views: { ...KNEE.views,
      plan: { ...KNEE.views.plan, points: Object.fromEntries(Object.entries(KNEE.views.plan.points)
        .map(([id, [x, y]]) => [id, [x, y + 5]])) },
    } };
    const [shiftedDepth] = runLegs(ROOM, W, { ...R, legs: [{ ...pick, mirrorDepth: true }] },
      { ...settings, shapes: [shifted] });
    expect(shiftedDepth.plan).toEqual(depth.plan);
  });

  it('flips plan arc bulges once per reflection, including the existing plan flip', () => {
    const original = structuredClone(LEG);
    for (const mirror of [false, true]) {
      for (const mirrorDepth of [false, true]) {
        const [placed] = runLegs(ROOM, W, { ...R, legs: [{ ...leg,
          ...(mirror ? { mirror: true } : {}), ...(mirrorDepth ? { mirrorDepth: true } : {}),
        }] }, settings);
        const bulge = mirror === mirrorDepth ? -1 : 1;
        expect(placed.plan.loops[1].points.map(([, , b]) => b)).toEqual([bulge, bulge]);
      }
    }
    expect(LEG).toEqual(original);
  });

  it('anchor 4: accepts only true or absent mirrorDepth', () => {
    expect(isLegList([leg])).toBe(true);
    expect(isLegList([{ ...leg, mirrorDepth: true }])).toBe(true);
    for (const mirrorDepth of [false, null, 0, 1, 'true']) {
      expect(isLegList([{ ...leg, mirrorDepth }])).toBe(false);
    }
  });
});

describe('SH7.1 step a leg room, supports and wall flips', () => {
  it('anchor 1: reserves the left leg width', () => {
    expect(legRoom({ ...R, legs: [leg] }, settings)).toEqual({ left: 3.5, right: 0 });
  });

  it('anchor 2: reserves both ends for four corners, including proud front legs', () => {
    let id = 0;
    const legs = legPreset('four', { shapeId: LEG.id, proud: 0.5 }, () => `lg-${++id}`);
    expect(legRoom({ ...R, legs }, settings)).toEqual({ left: 3.5, right: 3.5 });
  });

  it('anchor 3: ignores legs outside the depth and legs that do not take room', () => {
    for (const changes of [{ y: 4 }, { yFrom: 'back', y: 12 }, { takesRoom: false }]) {
      expect(legRoom({ ...R, legs: [{ ...leg, ...changes }] }, settings)).toEqual({ left: 0, right: 0 });
    }
  });

  it('anchor 4: measures the inside face from the run end with signed offsets', () => {
    for (const [x, left] of [[1, 2.5], [4, 0], [-2, 5.5]]) {
      expect(legRoom({ ...R, legs: [{ ...leg, x }] }, settings)).toEqual({ left, right: 0 });
    }
  });

  it('anchor 5: ignores split ends and missing shapes', () => {
    expect(legRoom({ ...R, legs: [leg], _pinSplit: { left: true } }, settings)).toEqual({ left: 0, right: 0 });
    expect(legRoom({ ...R, legs: [{ ...leg, shapeId: 'missing' }] }, settings)).toEqual({ left: 0, right: 0 });
  });

  it('anchor 6: seats and stretches a full leg on the furniture base, lifting all front geometry', () => {
    const supported = { ...R, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 },
      legs: [{ ...leg, sitsOn: 'base' }] };
    expect(legBottom(ROOM, W, supported, settings, supported.legs[0], 10, 3.5)).toEqual({ z: 4 });
    const [placed] = runLegs(ROOM, W, supported, settings);
    expect(placed).toMatchObject({ bounds: { z: 4, height: 30.5 }, stretched: true,
      insert: { x: 11.75, z: 4 }, plan: { top: 34.5 }, warnings: [] });
    expect(placed.outlines[0].outline).toEqual([
      [10, 30.5, 0], [13.5, 30.5, 0], [13.5, 34.5, 0], [10, 34.5, 0],
    ]);
  });

  it('anchor 7: warns for feet on the base and falls back to the floor without a base', () => {
    const supported = { ...R, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 },
      legs: [{ ...leg, sitsOn: 'base', height: 'feet' }] };
    const feet = runLegs(ROOM, W, supported, settings);
    expect(feet).toHaveLength(0);
    expect(feet.warnings.map(legWarningText)).toEqual([
      'Leg 1 has no height (the run sits on what the leg stands on).',
    ]);
    const [fallback] = runLegs(ROOM, W, { ...R, legs: [{ ...leg, sitsOn: 'base' }] }, settings);
    expect(fallback.bounds.z).toBe(0);
    expect(fallback.warnings.map(legWarningText)).toEqual([
      'Leg 1: the run has no furniture base. Drawn from the floor.',
    ]);
  });

  it('anchor 8: stands on a lower countertop, targets full 48 / feet 18, and warns without overlap', () => {
    const upper = run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 10, width: 36, z: 54, height: 30,
      legs: [{ ...leg, sitsOn: 'countertop' }] });
    const view = wall({ runs: [R, upper] });
    const space = room({ walls: [view] });
    const [full] = runLegs(space, view, upper, settings);
    expect(full).toMatchObject({ bounds: { z: 36, height: 48 }, plan: { top: 84 }, warnings: [] });
    const [feet] = runLegs(space, view, { ...upper, legs: [{ ...upper.legs[0], height: 'feet' }] }, settings);
    // The requested 18 is below LEG's fixed 26.5; its existing shape fallback still applies.
    expect(feet).toMatchObject({ bounds: { z: 36 },
      warnings: [{ code: 'shape-too-small', target: 18, fixed: 26.5, height: 34.5 }] });
    const moved = wall({ runs: [{ ...R, x: 60 }, upper] });
    const [fallback] = runLegs(room({ walls: [moved] }), moved, upper, settings);
    expect(fallback.bounds.z).toBe(0);
    expect(fallback.warnings.map(legWarningText)).toEqual([
      'Leg 1: no countertop below it. Drawn from the floor.',
    ]);
  });

  it('anchor 9: accepts only false/absent takesRoom and base/countertop/absent sitsOn', () => {
    expect(isLegList([{ ...leg, takesRoom: false, sitsOn: 'base' }])).toBe(true);
    expect(isLegList([{ ...leg, sitsOn: 'countertop' }])).toBe(true);
    expect(isLegList([{ ...leg, takesRoom: undefined, sitsOn: undefined }])).toBe(true);
    for (const takesRoom of [true, null, 0, 'false']) expect(isLegList([{ ...leg, takesRoom }])).toBe(false);
    for (const sitsOn of ['floor', null, false, 0, '']) expect(isLegList([{ ...leg, sitsOn }])).toBe(false);
  });

  it('anchor 10: mirrors four-corner legs, their hand and placements, and round-trips the wall', () => {
    let id = 0;
    const legs = legPreset('four', { shapeId: LEG.id, proud: 0.5, backOffset: 1 }, () => `lg-${++id}`);
    const original = wall({ runs: [{ ...R, legs }] });
    const before = structuredClone(original);
    const flipped = flipRunsForWall(original);
    const picks = flipped.runs[0].legs;
    expect(picks.map(({ from }) => from)).toEqual(['right', 'right', 'left', 'left']);
    expect(picks.slice(0, 2).every((pick) => !Object.hasOwn(pick, 'mirror'))).toBe(true);
    expect(picks.slice(2).map(({ mirror }) => mirror)).toEqual([true, true]);
    const normal = runLegs(room({ walls: [original] }), original, original.runs[0], settings);
    const mirrored = runLegs(room({ walls: [flipped] }), flipped, flipped.runs[0], settings);
    normal.forEach((placed, i) => {
      const expected = { ...legs[i], from: picks[i].from };
      if (i < 2) delete expected.mirror;
      else expected.mirror = true;
      expect(picks[i]).toEqual(expected);
      expect(mirrored[i].bounds.x).toBe(144 - placed.bounds.x - placed.bounds.width);
      expect([mirrored[i].front, mirrored[i].back]).toEqual([placed.front, placed.back]);
      expect(mirrored[i].outlines).toEqual(placed.outlines.map(({ closed, outline }) => ({ closed,
        outline: outline.map(([x, z, bulge]) => [144 - x, z, -bulge || 0]),
      })));
    });
    expect(flipRunsForWall(flipped)).toEqual({ ...original, flipped: false });
    expect(original).toEqual(before);
  });

  it('uses the maximum room, strict depth overlap and the run back plane without mutating inputs', () => {
    const shifted = { ...R, outset: 2, _plane: { offset: -1 }, legs: [leg,
      { ...leg, id: 'deeper', x: -2, height: 80 },
      { ...leg, id: 'right', from: 'right', yFrom: 'back' }] };
    const before = structuredClone(shifted);
    expect(legRoom(shifted, settings)).toEqual({ left: 5.5, right: 3.5 });
    expect(legRoom({ ...shifted, _pinSplit: { right: true } }, settings)).toEqual({ left: 5.5, right: 0 });
    for (const changes of [{ y: 3.5 }, { y: 3.5 - 0.5e-6 },
      { yFrom: 'back', y: 3.5 }, { yFrom: 'back', y: 3.5 - 0.5e-6 }]) {
      expect(legRoom({ ...shifted, legs: [{ ...leg, ...changes }] }, settings)).toEqual({ left: 0, right: 0 });
    }
    expect(legRoom({ ...shifted, legs: [{ ...leg, y: 3.5 - 2e-6 }] }, settings).left).toBe(3.5);
    expect(shifted).toEqual(before);
  });

  it('chooses the highest eligible countertop on the same face, excluding self, high tops and touching spans', () => {
    const upper = run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 });
    const below = [R, run({ id: 'wood', x: 10, width: 36, z: 10, top: 'wood', overrides: { countertopThickness: 2 } }),
      run({ id: 'high', x: 10, width: 36, z: 54 }),
      run({ id: 'touch', x: 13.5, z: 15 }),
      run({ id: 'other-face', x: 10, z: 20, wallSide: 'back' }),
      run({ id: 'molding', x: 10, z: 15, top: 'crown' })];
    const view = wall({ runs: [...below, upper] });
    const pick = { ...leg, sitsOn: 'countertop' };
    expect(legBottom(room({ walls: [view] }), view, upper, settings, pick, 10, 3.5)).toEqual({ z: 42.5 });
    const self = { ...R, z: 0, height: 0, top: 'wood', overrides: { countertopThickness: 0 } };
    const lone = wall({ runs: [self] });
    expect(legBottom(room({ walls: [lone] }), lone, self, settings, pick, 10, 3.5)).toEqual({
      z: 0, warning: { code: 'leg-no-countertop' },
    });
    const back = { ...upper, wallSide: 'back' };
    const backWall = wall({ runs: [...below, back] });
    expect(legBottom(room({ walls: [backWall] }), backWall, back, settings, pick, 10, 3.5)).toEqual({ z: 52 });
  });

  it('retains typed heights and lifts a fixed foot with a nonzero box origin onto the base', () => {
    const shifted = { ...FOOT, box: { ...FOOT.box, z: -2 } };
    const supported = { ...R, overrides: { baseKind: 'furniture_base', toeKickHeight: 4 },
      legs: [{ ...leg, shapeId: FOOT.id, sitsOn: 'base', height: 4 }] };
    const [placed] = runLegs(ROOM, W, supported, { ...settings, shapes: [shifted] });
    expect(placed).toMatchObject({ bounds: { z: 4, height: 4 }, insert: { z: 6 }, plan: { top: 8 }, warnings: [] });
    expect(legBottom(ROOM, W, R, settings, leg, 10, 3.5)).toEqual({ z: 0 });
  });
});
