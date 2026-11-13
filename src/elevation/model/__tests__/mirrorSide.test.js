import { describe, expect, it } from 'vitest';
import {
  builderMadeViews, builderSourceView, flipShape, isMadeView, isShape, isShapeDraft,
  moveShapeOriginTo, newShape, shapeViewProfile, withMirrorSide, withShapeView,
} from '../libraryShapes.js';
import { buildShape, isShapeBuilder } from '../shapeBuilders.js';
import { moveProfilePoint } from '../profileEditing.js';
import { sectionProfileBounds } from '../sectionProfiles.js';

const S = {
  id: 's-leg', name: 'S leg', kind: 'leg', version: 1, archived: false,
  box: { x: -1, y: 0, z: 0, w: 4, h: 30, d: 1 },
  stretch: { x: [[-0.5, 0.5]], z: [[14, 28]] },
  views: { front: {
    units: 'in',
    points: { a: [-1, 0], b: [2, 0], c: [2, 10], d: [2, 12], e: [2, 30], f: [-1, 30] },
    loops: [{ id: 'outline', closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'line', from: 'b', to: 'c' },
      { type: 'arc', from: 'c', to: 'd', center: [2, 11], ccw: true },
      { type: 'line', from: 'd', to: 'e' },
      { type: 'line', from: 'e', to: 'f' },
      { type: 'line', from: 'f', to: 'a' },
    ] }],
  } },
};

describe('mirrored Side builder (SH5.1)', () => {
  it('mirrors the Front points and knee arc, deriving only Side, depth and y zones', () => {
    const made = withMirrorSide(S, true);
    expect(made.builder).toEqual({ type: 'mirror-side' });
    expect(made.views.side.points).toEqual({
      a: [1, 0], b: [-2, 0], c: [-2, 10], d: [-2, 12], e: [-2, 30], f: [1, 30],
    });
    expect(made.views.side.loops).toEqual([{
      ...S.views.front.loops[0],
      segs: S.views.front.loops[0].segs.map((seg) => seg.type === 'arc'
        ? { ...seg, center: [-2, 11], ccw: false } : seg),
    }]);
    expect(sectionProfileBounds({ geometry: made.views.side }).minX).toBe(-3);
    expect(made.box).toEqual({ x: -1, y: -3, z: 0, w: 4, h: 30, d: 4 });
    expect(made.stretch).toEqual({ ...S.stretch, y: [[-0.5, 0.5]] });
    expect(builderMadeViews(made)).toEqual(['side']);
    expect(builderSourceView(made)).toBe('front');
    expect(made.views.front).toEqual(S.views.front);
    expect(made.views.front).not.toBe(S.views.front);
    expect(isShape(made)).toBe(true);
    expect(S.views.side).toBeUndefined();
    expect(S.builder).toBeUndefined();

    const withPlan = { ...S, views: { ...S.views, side: S.views.front, plan: S.views.front },
      stretch: { x: [[-0.75, -0.5], [0.1, 0.4]], y: [[0, 0.5]] } };
    const replaced = withMirrorSide(withPlan, true);
    expect(replaced.views.plan).toEqual(withPlan.views.plan);
    expect(replaced.views.side).toEqual(made.views.side);
    expect(replaced.stretch.y).toEqual([[-0.4, -0.1], [0.5, 0.75]]);
    expect(withMirrorSide({ ...withPlan, stretch: { y: [[0, 0.5]] } }, true).stretch).toEqual({});
  });

  it('editing Front rebuilds Side without adding drawnPoints to the recipe', () => {
    const made = withMirrorSide(S, true);
    const front = shapeViewProfile(made, 'front');
    expect(front.drawnPoints).toEqual({ elevation: [] });
    const edited = withShapeView(made, 'front', moveProfilePoint(front, 'b', [2.5, 0]));
    expect(edited.views.front.points.b).toEqual([2.5, 0]);
    expect(edited.views.side.points.b).toEqual([-2.5, 0]);
    expect(edited.builder).toEqual({ type: 'mirror-side' });
    expect(made.views.front.points.b).toEqual([2, 0]);
    expect(isShape(edited)).toBe(true);

    const plan = shapeViewProfile(made, 'plan');
    const withPlan = withShapeView(made, 'plan', plan);
    expect(withPlan.views.plan).toEqual(plan.geometry);
    expect(withPlan.views.side).toEqual(made.views.side);
    expect(withPlan.builder).toEqual(made.builder);

    const empty = { units: 'in', points: {}, loops: [] };
    const cleared = withShapeView(made, 'front', { ...front, geometry: empty });
    expect(cleared.views.side).toEqual(empty);
    expect(isShapeDraft(cleared)).toBe(true);
    expect(isShape(cleared)).toBe(false);
  });

  it('x and z flips and origin moves rebuild mirrors, while y is blocked', () => {
    const made = withMirrorSide(S, true);
    const flipped = flipShape(made, 'x');
    expect(flipped.views.front.points.b).toEqual([-2, 0]);
    expect(flipped.views.side.points.b).toEqual([2, 0]);
    expect(flipped.views.front.loops[0].segs[2]).toMatchObject({ center: [-2, 11], ccw: false });
    expect(flipped.views.side.loops[0].segs[2]).toMatchObject({ center: [2, 11], ccw: true });
    expect(flipped.box).toEqual({ x: -3, y: -1, z: 0, w: 4, h: 30, d: 4 });
    expect(flipShape(flipped, 'x')).toEqual(made);

    const moved = moveShapeOriginTo(made, { x: 1, z: 2 });
    expect(moved.views.front.points.b).toEqual([1, -2]);
    expect(moved.views.side.points.b).toEqual([-1, -2]);
    expect(moved.box).toEqual({ x: -2, y: -2, z: -2, w: 4, h: 30, d: 4 });
    expect(moved.stretch).toEqual({ x: [[-1.5, -0.5]], y: [[0.5, 1.5]], z: [[12, 26]] });
    const upsideDown = flipShape(made, 'z');
    expect(upsideDown.views.front.points.e).toEqual([2, -30]);
    expect(upsideDown.views.side.points.e).toEqual([-2, -30]);
    expect(flipShape(upsideDown, 'z')).toEqual(made);
    expect(moveShapeOriginTo(made, { y: 1 })).toBeNull();
    expect(moveShapeOriginTo(made, { x: 1, y: 0 })).toBeNull();
    expect(flipShape(made, 'y')).toBeNull();
  });

  it('switching off keeps the made Side, box and stretch as editable drawn data', () => {
    const made = withMirrorSide(S, true);
    const drawn = withMirrorSide(made, false);
    expect(drawn).toEqual({ ...S, views: made.views, box: made.box, stretch: made.stretch });
    expect(Object.hasOwn(drawn, 'builder')).toBe(false);
    expect([drawn.views, drawn.box, drawn.stretch]).toEqual([made.views, made.box, made.stretch]);
    expect(withShapeView(drawn, 'side', shapeViewProfile(drawn, 'side'))).toEqual(drawn);
    expect(builderMadeViews(drawn)).toEqual([]);
    expect(isShape(drawn)).toBe(true);
  });

  it('rejects edits to the made Side', () => {
    const made = withMirrorSide(S, true);
    expect(isMadeView(made, 'side')).toBe(true);
    expect(isMadeView(made, 'front')).toBe(false);
    expect(isMadeView(made, 'plan')).toBe(false);
    expect(withShapeView(made, 'side', shapeViewProfile(made, 'side'))).toBeNull();
  });

  it('validates the exact recipe and routes existing builders through their made view lists', () => {
    expect(isShapeBuilder({ type: 'mirror-side' }, S.views)).toBe(true);
    expect(isShapeDraft({ ...S, builder: { type: 'mirror-side', drawnPoints: { elevation: [] } } })).toBe(false);
    expect(withMirrorSide(null, true)).toBeNull();
    expect(withMirrorSide(S, 'true')).toBeNull();
    expect(withMirrorSide(S, false)).toEqual(S);
    expect(builderMadeViews(S)).toEqual([]);
    for (const [type, views] of [['extrude', ['front', 'plan']], ['stack', ['front', 'side', 'plan']]]) {
      const shape = newShape([], type, type);
      expect(builderMadeViews(shape)).toEqual(views);
      for (const view of ['front', 'side', 'plan']) expect(isMadeView(shape, view)).toBe(views.includes(view));
      expect(buildShape(shape)).toEqual(shape);
      expect(withMirrorSide(shape, true)).toBeNull();
      expect(withMirrorSide(shape, false)).toBeNull();
    }
  });
});
