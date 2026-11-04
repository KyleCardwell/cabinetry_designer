import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isLegList, legPreset, legWarningText, runLegs } from '../index.js';
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
      legs: [{ ...leg, from: 'right', x: -2, yFrom: 'back', y: 1 }] }, settings);
    expect(offset).toMatchObject({ bounds: { x: 44.5 }, front: 5.5, back: 2 });
  });

  it('anchor 3: stretches the top block at 30 and retains own height for feet below the fixed parts', () => {
    const pick = { ...leg, x: 2, y: -0.75, height: 30 };
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
      { id: 'lg-1', shapeId: LEG.id, height: 'feet', from: 'left', x: 0, yFrom: 'front', y: -0.5 },
      { id: 'lg-2', shapeId: LEG.id, height: 'feet', from: 'left', x: 0, yFrom: 'back', y: 1 },
      { id: 'lg-3', shapeId: LEG.id, height: 'feet', from: 'right', x: 0, yFrom: 'front', y: -0.5 },
    ]);
    const code = ({ from, yFrom }) => `${from[0].toUpperCase()}${yFrom[0].toUpperCase()}`;
    for (const [preset, codes] of [['four', ['LF', 'LB', 'RF', 'RB']], ['front', ['LF', 'RF']],
      ['left', ['LF', 'LB']], ['right', ['RF', 'RB']]]) {
      const picks = legPreset(preset, { shapeId: LEG.id }, newId);
      expect(picks.map(code)).toEqual(codes);
      expect(picks.every(({ x, y, height }) => x === 0 && y === 0 && height === 'full')).toBe(true);
      expect(isLegList([...three, ...picks])).toBe(true);
    }
    for (const leaveOut of ['LF', 'LB', 'RF', 'RB']) {
      expect(legPreset('three', { ...options, leaveOut }, newId).map(code))
        .toEqual(['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut));
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
