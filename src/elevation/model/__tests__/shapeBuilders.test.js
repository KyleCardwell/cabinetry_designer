import { describe, expect, it } from 'vitest';
import {
  buildShape, builderProblemText, convertShapeToDrawn, flipShape, isShape, isShapeDraft, moveShapeOriginTo,
  newShape, resolveShape, shapeBuilderProblems, shapeViewProfile, stackSectionProfile, withShapeView,
  withStackSectionProfile, copyShape,
} from '../index.js';
import { moveProfilePoint } from '../profileEditing.js';
import { produce } from 'immer';
import { shapeReducers } from '../../store/slices/shapes.js';

const pts = (geometry) => geometry.loops.map((loop) => loop.segs.map((s) => geometry.points[s.from]));
const box = (shape) => shape.box;

const CLEAT_SIDE = {
  units: 'in',
  points: { k1: [0, 0], k2: [0.75, 0], k3: [0.75, 1.25], k4: [0.5, 1.5], k5: [0, 1.5] },
  loops: [{ id: 'L1', closed: true, segs: ['k1', 'k2', 'k3', 'k4', 'k5'].map((from, i, a) => ({
    type: 'line', from, to: a[(i + 1) % a.length],
  })) }],
};
const CLEAT = buildShape({
  id: 'cleat', name: 'Cleat', archived: false, version: 1, kind: 'accessory',
  box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }, stretch: {},
  views: { front: CLEAT_SIDE, side: CLEAT_SIDE },
  builder: { type: 'extrude', length: 24, stretches: false, drawnPoints: { elevation: ['k3', 'k4'] } },
});

const BEAD = {
  units: 'in',
  points: { q1: [1, 0], q2: [1, 0.5], q3: [1, 1.5], q4: [1, 2] },
  loops: [{ id: 'L1', closed: false, segs: [
    { type: 'line', from: 'q1', to: 'q2' },
    { type: 'arc', from: 'q2', to: 'q3', center: [1, 1], ccw: true },
    { type: 'line', from: 'q3', to: 'q4' },
  ] }],
};
const stack = (bead = BEAD, stretch = 0, drawn = ['q1', 'q2', 'q3', 'q4']) => buildShape({
  id: 'leg', name: 'Leg', archived: false, version: 1, kind: 'leg',
  box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }, stretch: {},
  views: { front: CLEAT_SIDE },
  builder: { type: 'stack', stretch, sections: [
    { type: 'square', width: 3.5, height: 8 },
    { type: 'turned', profile: bead, drawnPoints: { elevation: drawn } },
    { type: 'square', width: 2, height: 24.5 },
  ] },
});

describe('SH5 step a extrusion builder', () => {
  it('anchor 1: New extrusion is a 1 5/16 round rod 30 long that stretches', () => {
    const rod = newShape([], 'rod', 'extrude');
    expect(rod.kind).toBe('accessory');
    expect(rod.name).toBe('New shape');
    expect(pts(rod.views.front)).toEqual([[[0, -0.65625], [30, -0.65625], [30, 0.65625], [0, 0.65625]]]);
    expect(pts(rod.views.plan)).toEqual([[[0, -0.65625], [30, -0.65625], [30, 0.65625], [0, 0.65625]]]);
    expect(box(rod)).toEqual({ x: 0, y: -0.65625, z: -0.65625, w: 30, h: 1.3125, d: 1.3125 });
    expect(rod.stretch).toEqual({ x: [[0, 30]] });
    expect(isShape(rod)).toBe(true);
  });

  it('anchor 2: a cleat gets lines at drawn points inside its bounds only', () => {
    expect(CLEAT.views.front.loops.map((l) => l.id)).toEqual(['outline', 'line1']);
    expect(pts(CLEAT.views.front)[0]).toEqual([[0, 0], [24, 0], [24, 1.5], [0, 1.5]]);
    expect(CLEAT.views.front.points.l1a).toEqual([0, 1.25]);
    expect(CLEAT.views.front.points.l1b).toEqual([24, 1.25]);
    expect(pts(CLEAT.views.plan)[0]).toEqual([[0, 0], [24, 0], [24, 0.75], [0, 0.75]]);
    expect(CLEAT.views.plan.loops).toHaveLength(2);
    expect(CLEAT.views.plan.points.l1a).toEqual([0, 0.5]);
    expect(CLEAT.box).toEqual({ x: 0, y: 0, z: 0, w: 24, h: 1.5, d: 0.75 });
    expect(CLEAT.stretch).toEqual({});
  });

  it('anchor 3: length 0 is a problem and keeps the views; stretches gives one x zone', () => {
    const zero = buildShape({ ...CLEAT, builder: { ...CLEAT.builder, length: 0 } });
    expect(shapeBuilderProblems(zero)).toEqual([{ problem: 'length' }]);
    expect(builderProblemText({ problem: 'length' })).toBe('The extrusion needs a length.');
    expect(zero.views.front).toEqual(CLEAT.views.front);
    expect(isShape(zero)).toBe(false);
    expect(isShapeDraft(zero)).toBe(true);
    expect(buildShape({ ...CLEAT, builder: { ...CLEAT.builder, stretches: true } }).stretch).toEqual({ x: [[0, 24]] });
  });

  it('anchor 4: a recipe change bumps the version, a rename does not', () => {
    const rod = newShape([], 'rod', 'extrude');
    const update = (state, shape) => produce(state, (draft) => {
      shapeReducers.updateShape(draft, { payload: { shape } });
    });
    const longer = buildShape({ ...rod, builder: { ...rod.builder, length: 36 } });
    let state = update({ settings: { shapes: [rod] } }, longer);
    expect(state.settings.shapes[0].version).toBe(2);
    expect(state.settings.shapes[0].views.front.points.f2).toEqual([36, -0.65625]);
    state = update(state, { ...state.settings.shapes[0], name: 'Rod' });
    expect(state.settings.shapes[0].version).toBe(2);
  });

  it('anchor 5: an extrusion moves and flips on y and z only', () => {
    const rod = newShape([], 'rod', 'extrude');
    const moved = moveShapeOriginTo(rod, { z: 0.65625 });
    expect(moved.views.side.points.p1).toEqual([0.65625, -0.65625]);
    expect(moved.views.front.points.f1).toEqual([0, -1.3125]);
    expect(moved.box.z).toBe(-1.3125);
    expect(moveShapeOriginTo(rod, { x: 1 })).toBeNull();
    expect(flipShape(rod, 'x')).toBeNull();
    expect(flipShape(CLEAT, 'z').box).toEqual({ x: 0, y: 0, z: -1.5, w: 24, h: 1.5, d: 0.75 });
  });

  it('anchor 6: convert to drawn drops the recipe only; a bad recipe is not a shape', () => {
    const rod = newShape([], 'rod', 'extrude');
    const drawn = convertShapeToDrawn(rod);
    expect(Object.hasOwn(drawn, 'builder')).toBe(false);
    expect([drawn.views, drawn.box, drawn.stretch]).toEqual([rod.views, rod.box, rod.stretch]);
    expect(isShape(drawn)).toBe(true);
    expect(isShape({ ...rod, builder: { ...rod.builder, drawnPoints: { elevation: ['zz'] } } })).toBe(false);
  });

  it('copies keep the recipe; side edits through the adapter rebuild front and plan', () => {
    const rod = newShape([], 'rod', 'extrude');
    expect(copyShape([rod], rod, 'b').builder).toEqual(rod.builder);
    const profile = shapeViewProfile(CLEAT, 'side');
    expect(profile.drawnPoints).toEqual({ elevation: ['k3', 'k4'] });
    const next = withShapeView(CLEAT, 'side', moveProfilePoint(profile, 'k3', [0.75, 1]));
    expect(next.views.front.points.l1a).toEqual([0, 1]);
    expect(withShapeView(CLEAT, 'front', shapeViewProfile(CLEAT, 'front'))).toBeNull();
  });
});

describe('SH5 step b leg / column stack builder', () => {
  it('anchor 1: New leg / column is one 3 1/2 x 34 1/2 square that stretches', () => {
    const leg = newShape([], 'leg', 'stack');
    expect(leg.kind).toBe('leg');
    expect(leg.box).toEqual({ x: -1.75, y: -1.75, z: 0, w: 3.5, h: 34.5, d: 3.5 });
    expect(leg.stretch).toEqual({ z: [[0, 34.5]] });
    expect(leg.views.plan.loops.map((l) => l.id)).toEqual(['square']);
    expect(isShape(leg)).toBe(true);
  });

  it('anchor 2: front of the leg: squares, the mirrored bead and lines across', () => {
    const { front, side } = stack().views;
    const loop = (id) => front.loops.find((l) => l.id === id);
    const at = (s) => front.points[s.from];
    expect(loop('s3').segs.map(at)).toEqual([[-1, 0], [1, 0], [1, 24.5], [-1, 24.5]]);
    const s2 = loop('s2').segs;
    expect(s2.map(at)).toEqual([[1, 24.5], [1, 25], [1, 26], [1, 26.5], [-1, 26.5], [-1, 26], [-1, 25], [-1, 24.5]]);
    expect(s2[1]).toMatchObject({ type: 'arc', center: [1, 25.5], ccw: true });
    expect(s2[5]).toMatchObject({ type: 'arc', center: [-1, 25.5], ccw: true });
    const lines = front.loops.filter((l) => !l.closed).map((l) => l.segs.map((s) => [front.points[s.from], front.points[s.to]]));
    expect(lines).toEqual([[[[-1, 25], [1, 25]]], [[[-1, 26], [1, 26]]]]);
    expect(loop('s1').segs.map(at)).toEqual([[-1.75, 26.5], [1.75, 26.5], [1.75, 34.5], [-1.75, 34.5]]);
    expect(side).toEqual(front);
  });

  it('anchor 3: plan, box and stretch of the leg', () => {
    const leg = stack();
    expect(pts(leg.views.plan)[0]).toEqual([[-1.75, -1.75], [1.75, -1.75], [1.75, 1.75], [-1.75, 1.75]]);
    expect(leg.views.plan.points.c1).toEqual([1.5, 0]);
    expect(leg.views.plan.points.c2).toEqual([-1.5, 0]);
    expect(leg.box).toEqual({ x: -1.75, y: -1.75, z: 0, w: 3.5, h: 34.5, d: 3.5 });
    expect(leg.stretch).toEqual({ z: [[26.5, 34.5]] });
    expect(isShape(leg)).toBe(true);
  });

  it('anchor 4: placed shorter, the top block shrinks and the turning stays', () => {
    const leg = stack();
    const resolved = resolveShape(leg, { h: 30 });
    const front = resolved.shape.views.front;
    expect(front.points.s1p3).toEqual([1.75, 30]);
    expect(front.points.s1p1).toEqual([-1.75, 26.5]);
    expect(front.points.s2r1).toEqual([1, 25]);
    expect(resolveShape(leg, { h: 26 }).warnings).toEqual([
      { code: 'shape-too-small', axis: 'z', fixed: 26.5, target: 26 },
    ]);
  });

  it('anchor 5: a bead drawn top to bottom makes the same loop', () => {
    const reversed = {
      ...BEAD, loops: [{ id: 'L1', closed: false, segs: [
        { type: 'line', from: 'q4', to: 'q3' },
        { type: 'arc', from: 'q3', to: 'q2', center: [1, 1], ccw: false },
        { type: 'line', from: 'q2', to: 'q1' },
      ] }],
    };
    const loop = (shape) => shape.views.front.loops.find((l) => l.id === 's2');
    const coords = (shape) => loop(shape).segs.map((s) => ({ ...s,
      from: shape.views.front.points[s.from], to: shape.views.front.points[s.to] }));
    expect(coords(stack(reversed))).toEqual(coords(stack()));
  });

  it('anchor 6: stack problems', () => {
    expect(shapeBuilderProblems(stack(BEAD, 1))).toEqual([{ problem: 'stretch' }]);
    const closed = structuredClone(BEAD);
    closed.loops[0].segs.push({ type: 'line', from: 'q4', to: 'q1' });
    closed.loops[0].closed = true;
    expect(shapeBuilderProblems(stack(closed))).toEqual([{ problem: 'turned', index: 1 }]);
    const crossing = structuredClone(BEAD);
    crossing.points.q1 = [-0.25, 0];
    expect(shapeBuilderProblems(stack(crossing))).toEqual([{ problem: 'axis', index: 1 }]);
    expect(builderProblemText({ problem: 'turned', index: 1 }))
      .toBe("Section 2's profile must be one open line from its bottom to its top.");
  });

  it('a pointed end shares its point on the centre line; origin and flip are refused', () => {
    const finial = { units: 'in', points: { a: [1, 0], b: [0, 2] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] };
    const leg = stack(finial, 0, ['a', 'b']);
    const s2 = leg.views.front.loops.find((l) => l.id === 's2');
    expect(s2.segs.map((s) => leg.views.front.points[s.from])).toEqual([[1, 24.5], [0, 26.5], [-1, 24.5]]);
    expect(moveShapeOriginTo(leg, { z: 1 })).toBeNull();
    expect(flipShape(leg, 'z')).toBeNull();
  });

  it('turned section adapter edits rebuild the stack', () => {
    const leg = stack();
    const profile = stackSectionProfile(leg, 1);
    expect(profile.drawnPoints.elevation).toEqual(['q1', 'q2', 'q3', 'q4']);
    const taller = withStackSectionProfile(leg, 1, moveProfilePoint(profile, 'q4', [1, 3]));
    expect(taller.box.h).toBe(35.5);
    expect(taller.stretch).toEqual({ z: [[27.5, 35.5]] });
    expect(stackSectionProfile(leg, 0)).toBeNull();
  });
});
