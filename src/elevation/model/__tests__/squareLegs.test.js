import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isLegList, isShape, legFillPlans, legPreset, legRoom,
  legShapeOf, resolveShape, runLegs, shapeOutlines } from '../index.js';
import { noEnds } from './fixtures/legs.js';
import { faceDrawing } from '../drawingPayload.js';
import { room, run, wall } from '../../../test/builders.js';

const settings = { ...DEFAULT_SETTINGS };
const square = {};
const legs = legPreset('four', { square, proud: 0.5 }, (() => {
  let id = 0;
  return () => `square-${++id}`;
})());
const R = run({ x: 10, width: 36, legs });
const W = wall({ runs: [R] });
const ROOM = room({ walls: [W] });

describe('SH7.4 step a square leg model', () => {
  it('anchor 1: places Four square legs with one closed front rectangle and one plan rectangle', () => {
    const before = structuredClone(R);
    expect(isLegList(legs)).toBe(true);
    expect(legs.map(({ from, yFrom }) => [from, yFrom])).toEqual([
      ['left', 'front'], ['left', 'back'], ['right', 'front'], ['right', 'back'],
    ]);
    expect(legs.every((leg) => !Object.hasOwn(leg, 'shapeId'))).toBe(true);
    expect(new Set(legs.map((leg) => leg.square)).size).toBe(4);
    expect(legs[0].square).not.toBe(square);
    const placed = runLegs(ROOM, W, R, settings);
    expect(placed).toHaveLength(4);
    expect(placed.warnings).toEqual([]);
    expect(placed[0]).toMatchObject({
      shapeName: 'Square leg', bounds: { x: 10, width: 3, z: 0, height: 34.5 },
      front: 25.375, back: 22.375, size: { w: 3, h: 34.5, d: 3 }, warnings: [],
    });
    expect(placed[0].outlines).toEqual([{ closed: true,
      outline: [[13, 0, 0], [10, 0, 0], [10, 34.5, 0], [13, 34.5, 0]],
    }]);
    expect(placed[0].plan.loops).toEqual([{ closed: true,
      points: [[13, 25.375, 0], [10, 25.375, 0], [10, 22.375, 0], [13, 22.375, 0]],
    }]);
    const shape = legShapeOf(legs[0], settings);
    expect(shape).toMatchObject({ id: 'square-leg', name: 'Square leg', kind: 'leg', archived: false,
      version: 1, box: { x: 0, y: 0, z: 0, w: 3, h: 1, d: 3 }, stretch: { z: [[0, 1]] } });
    expect(isShape(shape)).toBe(true);
    for (const view of Object.values(shape.views)) {
      expect(view.loops).toHaveLength(1);
      expect(view.loops[0]).toMatchObject({ closed: true });
      expect(view.loops[0].segs).toHaveLength(4);
      expect(view.loops[0].segs.every(({ type }) => type === 'line')).toBe(true);
    }
    const resolved = resolveShape(shape, { h: 34.5 });
    expect(shapeOutlines(resolved.shape.views.side)).toEqual([{ closed: true,
      outline: [[0, 0, 0], [3, 0, 0], [3, 34.5, 0], [0, 34.5, 0]],
    }]);
    expect(R).toEqual(before);
  });

  it('anchors 2 and 8: uses per-leg dimensions before width and depth settings', () => {
    const picks = [
      [{ w: 2, d: 4 }, settings, { width: 2, back: 21.375, w: 2, d: 4 }],
      [{}, { ...settings, squareLegWidth: 4 }, { width: 4, back: 22.375, w: 4, d: 3 }],
      [{ w: 2 }, { ...settings, squareLegDepth: 5 }, { width: 2, back: 20.375, w: 2, d: 5 }],
    ];
    for (const [square, config, expected] of picks) {
      const [placed] = runLegs(ROOM, W, { ...R, legs: [{ ...legs[0], square }] }, config);
      expect(placed).toMatchObject({ bounds: { width: expected.width }, back: expected.back,
        size: { w: expected.w, d: expected.d } });
    }
    const shape = { id: 'library-leg' };
    expect(legShapeOf({ shapeId: shape.id }, { shapes: [shape] })).toBe(shape);
    expect(legShapeOf({ shapeId: 'missing' }, settings)).toBeUndefined();
  });

  it('anchor 3: stretches the whole square leg to the four-inch feet height', () => {
    const [placed] = runLegs(ROOM, W, { ...R, legs: [{ ...legs[0], height: 'feet' }] }, settings);
    expect(placed).toMatchObject({ bounds: { z: 0, height: 4 }, size: { h: 4 }, warnings: [] });
    expect(placed.outlines[0].outline.map(([, z]) => z)).toEqual([0, 0, 4, 4]);
  });

  it('anchor 4: reserves three inches at each run end unless the legs do not take room', () => {
    expect(legRoom(R, settings)).toEqual({ left: 3, right: 3 });
    expect(legRoom({ ...R, legs: legs.map((leg) => ({ ...leg, takesRoom: false })) }, settings))
      .toEqual({ left: 0, right: 0 });
  });

  it('anchor 5: fills between the front and back square legs using their depths', () => {
    const spec = { square, height: 'full', x: 0, y: 0 };
    const filled = { ...R, legs: undefined, ends: noEnds, endLegs: {
      left: { legs: 'both', front: { ...spec, y: 0.5 }, back: spec, fit: 'between' },
    } };
    expect(legFillPlans(filled, settings)).toMatchObject([
      { u0: 10.25, back: 3, front: 22.375, depth: 19.375 },
    ]);
  });

  it('anchor 6: exports four leg shapes without blocks, even at the unstretched height of one', () => {
    for (const height of ['full', 1]) {
      const placedRun = { ...R, legs: legs.map((leg) => ({ ...leg, height })) };
      const placedWall = { ...W, runs: [placedRun] };
      const drawing = faceDrawing(room({ walls: [placedWall] }), placedWall, 'front', settings);
      const shapes = drawing.shapes.filter(({ kind }) => kind === 'leg');
      expect(shapes).toHaveLength(4);
      for (const shape of shapes) {
        expect(shape).not.toHaveProperty('block');
        expect(shape.loops).toHaveLength(1);
        expect(shape.loops[0]).toMatchObject({ closed: true });
        expect(shape.loops[0].points).toHaveLength(4);
      }
    }
  });

  it('anchor 7: accepts exactly one library or square shape with only positive finite square dimensions', () => {
    const { square: omitted, ...base } = legs[0];
    expect(omitted).toEqual({});
    const valid = [{ square: {} }, { square: { w: 2.5 } }, { square: { d: 4 } },
      { square: { w: 2, d: 4 } }, { shapeId: 'leg' }];
    const invalid = [{ square: { w: 0 } }, { square: { h: 1 } }, { shapeId: 'leg', square: {} }, {},
      { shapeId: '', square: {} }, { shapeId: undefined, square: {} },
      ...[null, [], 'square', 3].map((square) => ({ square })),
      ...[undefined, null, -1, NaN, Infinity, '3'].flatMap((value) =>
        [{ square: { w: value } }, { square: { d: value } }])];
    for (const shape of valid) expect(isLegList([{ ...base, ...shape }])).toBe(true);
    for (const shape of invalid) expect(isLegList([{ ...base, ...shape }])).toBe(false);
  });
});
