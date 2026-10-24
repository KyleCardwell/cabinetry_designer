import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, SHAPE_KINDS, LIBRARY_KEYS,
  isShape, isShapeDraft, isShapeList, newShape, copyShape, shapeView, fitShapeBox,
  moveShapeOrigin, flipShape, shapeStretchProblems, stretchProblemText, shapeViewProfile, withShapeView,
} from '../index.js';
import { isSectionProfileDraft } from '../sectionProfiles.js';

const ROD = {
  id: 'rod', name: 'Closet rod', kind: 'accessory', version: 1, archived: false,
  box: { x: 0, y: 0, z: 0, w: 30, h: 3, d: 2 }, stretch: {},
  views: { front: {
    units: 'in',
    points: {
      a: [0, 0], b: [3, 0], c: [3, 3], d: [0, 3],
      e: [27, 0], f: [30, 0], g: [30, 3], h: [27, 3],
      hl: [0.875, 1.5], hr: [2.125, 1.5], jl: [27.875, 1.5], jr: [29.125, 1.5],
      r1: [3, 2.03125], r2: [27, 2.03125], r3: [3, 0.96875], r4: [27, 0.96875],
    },
    loops: [
      { id: 'left', closed: true, segs: [
        { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
        { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
      ] },
      { id: 'right', closed: true, segs: [
        { type: 'line', from: 'e', to: 'f' }, { type: 'line', from: 'f', to: 'g' },
        { type: 'line', from: 'g', to: 'h' }, { type: 'line', from: 'h', to: 'e' },
      ] },
      { id: 'hole-left', closed: true, segs: [
        { type: 'arc', from: 'hl', to: 'hr', center: [1.5, 1.5], ccw: true },
        { type: 'arc', from: 'hr', to: 'hl', center: [1.5, 1.5], ccw: true },
      ] },
      { id: 'hole-right', closed: true, segs: [
        { type: 'arc', from: 'jl', to: 'jr', center: [28.5, 1.5], ccw: true },
        { type: 'arc', from: 'jr', to: 'jl', center: [28.5, 1.5], ccw: true },
      ] },
      { id: 'rod-top', closed: false, segs: [{ type: 'line', from: 'r1', to: 'r2' }] },
      { id: 'rod-bottom', closed: false, segs: [{ type: 'line', from: 'r3', to: 'r4' }] },
    ],
  } },
};

describe('SH2 step a shapes', () => {
  it('anchor 1: creates the specified 12-inch box and front rectangle, with unique names and ids', () => {
    const shape = newShape([], 'shape-1');
    expect(DEFAULT_SETTINGS.shapes).toEqual([]);
    expect(LIBRARY_KEYS).toContain('shapes');
    expect(SHAPE_KINDS).toEqual({ accessory: 'Accessory', appliance: 'Appliance', leg: 'Leg / column', other: 'Other' });
    expect(shape).toEqual({
      id: 'shape-1', name: 'New shape', kind: 'other', version: 1, archived: false,
      box: { x: 0, y: 0, z: 0, w: 12, h: 12, d: 12 }, stretch: {},
      views: { front: {
        units: 'in', points: { p1: [0, 0], p2: [12, 0], p3: [12, 12], p4: [0, 12] },
        loops: [{ id: 'L1', closed: true, segs: [
          { type: 'line', from: 'p1', to: 'p2' }, { type: 'line', from: 'p2', to: 'p3' },
          { type: 'line', from: 'p3', to: 'p4' }, { type: 'line', from: 'p4', to: 'p1' },
        ] }],
      } },
    });
    const named = { ...shape, name: 'new shape', archived: true };
    expect(newShape([named], 'shape-2').name).toBe('New shape 2');
    expect(newShape([named, { ...shape, id: 'shape-2', name: 'NEW SHAPE 2' }], 'shape-3').name).toBe('New shape 3');
    expect(newShape([]).id).toMatch(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i);
    expect(newShape([shape], shape.id)).toBeNull();
  });

  it('copies all geometry and zones deeply, resets metadata, and counts archived copy names', () => {
    const base = { ...ROD, archived: true, version: 7, notes: 'Rod notes', stretch: { x: [[3, 27]] } };
    const copy = copyShape([base, { ...ROD, id: 'copy', name: 'Closet rod COPY' }], base, 'copy-2');
    expect(copy).toEqual({ ...base, id: 'copy-2', name: 'Closet rod copy 2', archived: false, version: 1 });
    copy.views.front.points.r3[0] = 9;
    copy.views.front.loops[2].segs[0].center[0] = 9;
    copy.stretch.x[0][0] = 9;
    expect(base.views.front.points.r3).toEqual([3, 0.96875]);
    expect(base.views.front.loops[2].segs[0].center).toEqual([1.5, 1.5]);
    expect(base.stretch.x).toEqual([[3, 27]]);
    expect(copyShape([], null, 'bad')).toBeNull();
  });

  it('anchor 2: returns stored views or counter-clockwise size-box plan and side rectangles', () => {
    const leg = { ...ROD, kind: 'leg', box: { x: -1.75, y: -1.75, z: 0, w: 3.5, h: 34.5, d: 3.5 } };
    const plan = shapeView(leg, 'plan');
    expect(plan.points).toEqual({ b1: [-1.75, -1.75], b2: [1.75, -1.75], b3: [1.75, 1.75], b4: [-1.75, 1.75] });
    expect(shapeView(leg, 'side').points).toEqual({ b1: [-1.75, 0], b2: [1.75, 0], b3: [1.75, 34.5], b4: [-1.75, 34.5] });
    expect(plan.loops).toEqual([{ id: 'box', closed: true, segs: [
      { type: 'line', from: 'b1', to: 'b2' }, { type: 'line', from: 'b2', to: 'b3' },
      { type: 'line', from: 'b3', to: 'b4' }, { type: 'line', from: 'b4', to: 'b1' },
    ] }]);
    const front = shapeView(leg, 'front');
    expect(front).toEqual(ROD.views.front);
    expect(front.points).not.toBe(ROD.views.front.points);
    expect(leg.views.plan).toBeUndefined();
    expect(shapeView(leg, 'top')).toBeNull();
  });

  it('anchor 3: checks x zones for arc crossing, edge contact, box overflow and overlapping/touching zones', () => {
    const zones = [[[3, 27]], [[2, 27]], [[2.125, 27]], [[3, 31]], [[3, 10], [9, 20]], [[3, 10], [10, 20]]];
    expect(zones.map((x) => shapeStretchProblems({ ...ROD, stretch: { x } }))).toEqual([
      [], [{ axis: 'x', index: 0, problem: 'arc', view: 'front' }], [],
      [{ axis: 'x', index: 0, problem: 'box' }],
      [{ axis: 'x', index: 1, problem: 'overlap' }], [{ axis: 'x', index: 1, problem: 'overlap' }],
    ]);
    expect(shapeStretchProblems({ ...ROD, stretch: { x: [[-0.5e-6, 0.5]] } })).toEqual([]);
    expect(shapeStretchProblems({ ...ROD, stretch: { x: [[12, 20], [3, 10]] } }))
      .toEqual([{ axis: 'x', index: 1, problem: 'overlap' }]);
  });

  it('anchor 4: includes arc extremes between endpoints and reports one conflict per view and zone', () => {
    expect(shapeStretchProblems({ ...ROD, stretch: { z: [[0.5, 1]] } }))
      .toEqual([{ axis: 'z', index: 0, problem: 'arc', view: 'front' }]);
    const shape = { ...ROD, views: { ...ROD.views, plan: ROD.views.front, side: ROD.views.front },
      stretch: { y: [[0.9, 1]] } };
    expect(shapeStretchProblems(shape)).toEqual([
      { axis: 'y', index: 0, problem: 'arc', view: 'plan' },
      { axis: 'y', index: 0, problem: 'arc', view: 'side' },
    ]);
    expect(stretchProblemText({ axis: 'x', problem: 'arc', view: 'front' }, [2, 27]))
      .toBe('Stretch zone x 2"–27" crosses an arc in the front view.');
    expect(stretchProblemText({ axis: 'z', problem: 'box' }, [0.5, 1]))
      .toBe('Stretch zone z 1/2"–1" is outside the size box.');
    expect(stretchProblemText({ axis: 'x', problem: 'overlap' }, [9, 20]))
      .toBe('Stretch zone x 9"–20" overlaps the zone before it.');
  });

  it('anchor 5: moves the origin on front axes, including arc centres, other views and zones', () => {
    const shape = { ...ROD, stretch: { x: [[3, 27]] }, views: { ...ROD.views, plan: {
      units: 'in', points: { p: [3, 1], q: [27, 1] },
      loops: [{ id: 'plan', closed: false, segs: [{ type: 'line', from: 'p', to: 'q' }] }],
    } } };
    const before = structuredClone(shape);
    const moved = moveShapeOrigin(shape, 'front', 'r3');
    expect(moved.box).toEqual({ x: -3, y: 0, z: -0.96875, w: 30, h: 3, d: 2 });
    expect(moved.stretch.x).toEqual([[0, 24]]);
    expect(moved.views.front.points.r3).toEqual([0, 0]);
    expect(moved.views.plan.points.p).toEqual([0, 1]);
    expect(moved.views.front.loops[2].segs[0]).toMatchObject({ center: [-1.5, 0.53125], ccw: true });
    expect(shape).toEqual(before);
    expect(moveShapeOrigin(shape, 'front', 'missing')).toBeNull();
    expect(moveShapeOrigin(ROD, 'plan', 'b1')).toBeNull();
  });

  it('anchor 6: flips the whole shape on x and reverses arc winding; two flips restore the rod', () => {
    const rod = { ...ROD, stretch: { x: [[3, 27]] } };
    const flipped = flipShape(rod, 'x');
    expect(flipped.box.x).toBe(-30);
    expect(flipped.stretch.x).toEqual([[-27, -3]]);
    expect(flipped.views.front.points.b).toEqual([-3, 0]);
    expect(flipped.views.front.loops[2].segs[0]).toMatchObject({ center: [-1.5, 1.5], ccw: false });
    expect(flipShape(flipped, 'x')).toEqual(rod);
    expect(rod.views.front.loops[2].segs[0].ccw).toBe(true);
  });

  it('uses all three world axes correctly for origin moves and flips, leaving unrelated views alone', () => {
    const shape = { ...ROD, views: { front: ROD.views.front, plan: ROD.views.front, side: ROD.views.front },
      stretch: { x: [[3, 10], [12, 27]], y: [[0.2, 0.5]], z: [[2.2, 2.8]] } };
    for (const [axis, views] of [['x', ['front', 'plan']], ['y', ['plan', 'side']], ['z', ['front', 'side']]]) {
      const flipped = flipShape(shape, axis);
      for (const view of ['front', 'plan', 'side']) {
        expect(flipped.views[view].loops[2].segs[0].ccw).toBe(!views.includes(view));
      }
      expect(flipShape(flipped, axis)).toEqual(shape);
    }
    expect(flipShape(shape, 'x').stretch.x).toEqual([[-27, -12], [-10, -3]]);
    const plan = moveShapeOrigin(shape, 'plan', 'hl');
    expect(plan.box).toMatchObject({ x: -0.875, y: -1.5, z: 0 });
    expect(plan.views.front.points.hl).toEqual([0, 1.5]);
    expect(plan.views.side.points.hl).toEqual([-0.625, 1.5]);
    const side = moveShapeOrigin(shape, 'side', 'hl');
    expect(side.box).toMatchObject({ x: 0, y: -0.875, z: -1.5 });
    expect(side.views.plan.points.hl).toEqual([0.875, 0.625]);
    expect(side.views.front.points.hl).toEqual([0.875, 0]);
  });

  it('anchor 7: fits only drawn axes, unions views, and includes arc extrema', () => {
    const rod = { ...ROD, box: { x: 5, y: 1, z: 5, w: 12, h: 12, d: 7 } };
    expect(fitShapeBox(rod).box).toEqual({ x: 0, y: 1, z: 0, w: 30, h: 3, d: 7 });
    const arc = {
      units: 'in', points: { a: [-2, 0], b: [2, 0] },
      loops: [{ id: 'arc', closed: false, segs: [
        { type: 'arc', from: 'a', to: 'b', center: [0, 0], ccw: true },
      ] }],
    };
    expect(fitShapeBox({ ...rod, views: { ...rod.views, plan: arc } }).box)
      .toEqual({ x: -2, y: -2, z: 0, w: 32, h: 3, d: 2 });
    expect(rod.box.x).toBe(5);
    const flat = { units: 'in', points: { a: [0, 0], b: [1, 0] },
      loops: [{ id: 'line', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] };
    expect(fitShapeBox({ ...rod, views: { front: flat } })).toBeNull();
  });

  it('anchor 8: rejects extra keys, invalid dimensions/views/metadata, but permits draft zone conflicts', () => {
    const draft = { ...ROD, stretch: { x: [[2, 27]] } };
    expect([isShape(ROD), isShape(draft), isShapeDraft(draft)]).toEqual([true, false, true]);
    const invalid = [null, {}, { ...ROD, extra: true }, { ...ROD, name: ' Rod' }, { ...ROD, name: '' },
      { ...ROD, id: '' }, { ...ROD, kind: 'toString' }, { ...ROD, version: 0 }, { ...ROD, version: 1.5 },
      { ...ROD, archived: 0 }, { ...ROD, box: { ...ROD.box, w: 0 } },
      { ...ROD, box: { ...ROD.box, h: -1 } }, { ...ROD, box: { ...ROD.box, d: Infinity } },
      { ...ROD, box: { ...ROD.box, x: NaN } }, { ...ROD, box: { ...ROD.box, extra: 0 } },
      { ...ROD, views: { ...ROD.views, top: ROD.views.front } }, { ...ROD, views: {} },
      { ...ROD, views: { front: { ...ROD.views.front, units: 'mm' } } },
      { ...ROD, stretch: undefined }, { ...ROD, stretch: { w: [[3, 27]] } }, { ...ROD, stretch: { x: [] } },
      { ...ROD, stretch: { x: [[3, 3]] } }, { ...ROD, stretch: { x: [[3, Infinity]] } },
      { ...ROD, stretch: { x: [[3, 4, 5]] } }, { ...ROD, stretch: { x: Array(5).fill([3, 4]) } },
      { ...ROD, notes: ' padded ' }, { ...ROD, notes: 'a'.repeat(501) }, { ...ROD, notes: null }];
    for (const value of invalid) {
      expect(isShape(value)).toBe(false);
      expect(isShapeDraft(value)).toBe(false);
    }
    expect(isShape({ ...ROD, notes: 'a'.repeat(500) })).toBe(true);
    expect(newShape([], '')).toBeNull();
    expect(flipShape(ROD, 'w')).toBeNull();
    expect(fitShapeBox(null)).toBeNull();
    expect(moveShapeOrigin(ROD, 'top', 'r3')).toBeNull();
  });

  it('requires unique ids and case-insensitive live names, while permitting archived duplicate names', () => {
    const second = { ...ROD, id: 'rod-2', name: 'CLOSET ROD' };
    expect([
      isShapeList([]), isShapeList([ROD]), isShapeList([ROD, second]),
      isShapeList([ROD, { ...second, archived: true }]),
      isShapeList([{ ...ROD, archived: true }, second]),
      isShapeList([{ ...ROD, archived: true }, { ...second, archived: true }]),
      isShapeList([ROD, { ...ROD, name: 'Another' }]),
      isShapeList([ROD, { ...second, stretch: { x: [[2, 27]] } }]),
      isShapeList(null), isShapeList({}), isShapeList([null]),
    ]).toEqual([true, true, false, true, true, true, false, false, false, false, false]);
  });

  it('adapts optional or drawn views to valid profile drafts and puts edited geometry back deeply', () => {
    const profile = shapeViewProfile(ROD, 'plan');
    expect(profile).toEqual({
      id: 'rod:plan', name: ROD.name, kind: 'other', geometry: shapeView(ROD, 'plan'),
      drawnPoints: { elevation: [] }, version: 1, archived: false,
    });
    expect(isSectionProfileDraft(profile)).toBe(true);
    profile.geometry.points.b1 = [-1, -1];
    const result = withShapeView(ROD, 'plan', profile);
    expect(result.views.plan).toEqual(profile.geometry);
    expect(result.views.front).toEqual(ROD.views.front);
    expect(result.views.plan).not.toBe(profile.geometry);
    expect(result.version).toBe(ROD.version);
    expect(ROD.views.plan).toBeUndefined();
    expect(shapeViewProfile(ROD, 'top')).toBeNull();
    expect(withShapeView(ROD, 'front', { ...profile, geometry: {} })).toBeNull();
    expect(withShapeView(ROD, 'top', profile)).toBeNull();
    const draft = withShapeView({ ...ROD, stretch: { x: [[2, 27]] } }, 'front', shapeViewProfile(ROD, 'front'));
    expect(isShapeDraft(draft)).toBe(true);
    expect(isShape(draft)).toBe(false);
  });
});

describe('empty views', () => {
  it('drafts may have an empty view, but a shape needs something drawn in every view to save', () => {
    const empty = { ...ROD, views: { ...ROD.views, plan: { units: 'in', points: {}, loops: [] } } };
    expect(isShapeDraft(empty)).toBe(true);
    expect(isShape(empty)).toBe(false);
    expect(fitShapeBox(empty).box).toEqual(fitShapeBox(ROD).box);
  });
});
