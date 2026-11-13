import { describe, expect, it } from 'vitest';
import {
  buildShape, builderProblemText, isShape, isShapeDraft, newShape, newStackDetail,
  resolveShape, shapeBuilderProblems, stackDetailProfile, stackHiddenBase,
  stackSectionProfile, withStackDetailProfile, withStackSectionProfile,
} from '../index.js';
import { isShapeBuilder } from '../shapeBuilders.js';
import { isProfileGeometry } from '../sectionProfiles.js';

const TL = {
  type: 'turned',
  profile: { units: 'in', points: { q1: [0.75, 0], q2: [1, 25] },
    loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'q1', to: 'q2' }] }] },
  drawnPoints: { elevation: [] },
};
const SQUARE = { type: 'square', width: 2, height: 10 };
const leg = (sections, stretch) => buildShape({
  ...newShape([], 'details-leg', 'stack'),
  builder: { type: 'stack', sections, ...(stretch === undefined ? {} : { stretch }) },
});
const segments = (g, id = 's1') => g.loops.find((l) => l.id === id).segs.map((s) => ({
  ...s, from: g.points[s.from], to: g.points[s.to],
}));
const across = (g) => g.loops.filter((l) => !l.closed).map((l) => (
  [g.points[l.segs[0].from], g.points[l.segs.at(-1).to]]
));
const closePoint = (actual, expected) => expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 10));

// Each fixture owns its details and profile; no imported constants are mutated.
describe('section details (SH5.1)', () => {
  it('bottom-anchored bead is rigid on a sloping turned base, with connector and arc bounds', () => {
    const detail = { ...newStackDetail(), at: 4 };
    const shape = leg([{ ...TL, details: [detail] }]);
    const ss = segments(shape.views.front);
    const expected = [[0.75, 0], [0.79, 4], [0.79, 4.5], [0.795, 4.5], [1, 25],
      [-1, 25], [-0.795, 4.5], [-0.79, 4.5], [-0.79, 4], [-0.75, 0]];
    ss.forEach((s, i) => closePoint(s.from, expected[i]));
    expect(ss[1]).toMatchObject({ type: 'arc', center: [0.79, 4.25], ccw: true });
    expect(ss[7]).toMatchObject({ type: 'arc', center: [-0.79, 4.25], ccw: true });
    expect(across(shape.views.front)).toEqual([[[-0.79, 4], [0.79, 4]], [[-0.795, 4.5], [0.795, 4.5]]]);
    expect(shape.views.plan.points.c1[0]).toBeCloseTo(1.04);
    expect(shape.box.w).toBeCloseTo(2.08);
    expect(shape.box.h).toBe(25);
    expect(shape.views.side).toEqual(shape.views.front);
    expect(isShape(shape)).toBe(true);
  });

  it('moving a detail preserves its base recipe and exposes only the replaced base', () => {
    const shape = leg([{ ...TL, details: [{ ...newStackDetail(), at: 6 }] }]);
    closePoint(segments(shape.views.front)[1].center, [0.81, 6.25]);
    expect(shape.builder.sections[0].profile).toEqual(TL.profile);
    const hidden = stackHiddenBase(shape, 'front');
    expect(hidden.loops).toHaveLength(2);
    const pieces = across(hidden);
    closePoint(pieces[0][0], [0.81, 6]);
    closePoint(pieces[0][1], [0.815, 6.5]);
    closePoint(pieces[1][0], [-0.81, 6]);
    closePoint(pieces[1][1], [-0.815, 6.5]);
    expect(stackHiddenBase(shape, 'side')).toEqual(hidden);
    expect(stackHiddenBase(shape, 'plan').loops).toEqual([]);
  });

  it('top anchoring puts the connector at the bottom of the detail', () => {
    const shape = leg([{ ...TL, details: [{ ...newStackDetail(), from: 'top', at: 1 }] }]);
    const ss = segments(shape.views.front);
    closePoint(ss[1].from, [0.985, 23.5]);
    closePoint(ss[1].to, [0.99, 23.5]);
    closePoint(ss[2].to, [0.99, 24]);
    closePoint(ss[2].center, [0.99, 23.75]);
    expect(ss[1].type).toBe('line');
  });

  it('a square bead enlarges plan and box; a cove stays inside the original square', () => {
    const bead = leg([{ ...SQUARE, details: [{ ...newStackDetail(), at: 4 }] }]);
    expect(segments(bead.views.front).slice(0, 4).map((s) => s.from))
      .toEqual([[1, 0], [1, 4], [1, 4.5], [1, 10]]);
    expect(segments(bead.views.front)[1]).toMatchObject({ center: [1, 4.25], ccw: true });
    expect(across(bead.views.front)).toEqual([[[-1, 4], [1, 4]], [[-1, 4.5], [1, 4.5]]]);
    expect(bead.box.w).toBe(2.5);
    expect(bead.views.plan.points.sq1).toEqual([-1.25, -1.25]);
    const cove = newStackDetail();
    cove.at = 4;
    cove.profile.loops[0].segs[0].ccw = false;
    const cut = leg([{ ...SQUARE, details: [cove] }]);
    expect(cut.box.w).toBe(2);
    expect(cut.views.plan.points.sq1).toEqual([-1, -1]);
  });

  it('height resolution rebuilds the stretch section while both beads keep their size', () => {
    const shape = leg([
      { type: 'square', width: 3.5, height: 8, details: [{ ...newStackDetail(), from: 'top' }] },
      { type: 'tapered', shape: 'square', top: 2, bottom: 1.5, height: 25, taper: 'all',
        details: [{ ...newStackDetail(), at: 4 }] },
    ], 0);
    expect(isShape(shape)).toBe(true);
    const resolved = resolveShape(shape, { h: 37, w: 100, d: 100 });
    expect(resolved).toMatchObject({ origin: { x: 0, y: 0, z: 0 }, stretched: true, warnings: [] });
    expect(resolved.shape.box).toMatchObject({ w: 4, d: 4, h: 37 });
    expect(resolved.shape.stretch).toEqual({ z: [[25, 37]] });
    expect(across(resolved.shape.views.front)).toEqual([
      [[-1.75, 36.5], [1.75, 36.5]], [[-1.75, 37], [1.75, 37]],
      [[-0.79, 4], [0.79, 4]], [[-0.795, 4.5], [0.795, 4.5]],
    ]);
    expect(isShape(resolved.shape)).toBe(true);
    const small = resolveShape(shape, { h: 25.25 });
    expect(small.warnings).toEqual([{ code: 'shape-too-small', axis: 'z', fixed: 25.5, target: 25.25 }]);
    expect(small.shape.box.h).toBe(33);
    expect(small.stretched).toBe(false);
    expect(shape.builder.sections[0].height).toBe(8);
    expect(resolveShape(resolved.shape, { h: 35 }).shape.box.h).toBe(35);
    expect(resolveShape(shape, { h: 33 + 0.5e-6 }).stretched).toBe(false);
    expect(resolveShape(leg([SQUARE]), { h: 20 }).stretched).toBe(false);
  });

  it('outside, overlap, deep cove and displaced profile ends block saving and keep made views', () => {
    const outside = { ...newStackDetail(), at: 9.75 };
    const deep = newStackDetail();
    deep.profile.points.b2 = [0, 2.5];
    deep.profile.loops[0].segs[0] = { ...deep.profile.loops[0].segs[0], center: [0, 1.25], ccw: false };
    const badEnd = newStackDetail();
    badEnd.profile = { units: 'in', points: { a: [0, 0], b: [0.1, 0.5] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] };
    const original = leg([SQUARE]);
    const cases = [
      [[outside], [{ problem: 'detail-outside', index: 0, detailIndex: 0 }]],
      [[{ ...newStackDetail(), at: 4 }, { ...newStackDetail(), at: 4.25 }],
        [{ problem: 'detail-overlap', index: 0, detailIndex: 0, otherDetailIndex: 1 }]],
      [[deep], [{ problem: 'detail-deep', index: 0, detailIndex: 0 }]],
      [[badEnd], [{ problem: 'detail-profile', index: 0, detailIndex: 0 }]],
    ];
    for (const [details, expected] of cases) {
      const draft = { ...original, builder: { type: 'stack', sections: [{ ...SQUARE, details }] } };
      expect(shapeBuilderProblems(draft)).toEqual(expected);
      expect(buildShape(draft)).toBe(draft);
      expect(isShapeDraft(draft)).toBe(true);
      expect(isShape(draft)).toBe(false);
    }
    expect(leg([{ ...SQUARE, details: [newStackDetail(), { ...newStackDetail(), at: 0.5 }] }]).box.h).toBe(10);
    for (const [problem, text] of [
      ['detail-profile', 'Section 2, detail 1 must be one open line from its bottom to its top, with both ends at 0.'],
      ['detail-outside', "Section 2, detail 1 doesn't fit in its section."],
      ['detail-overlap', 'Section 2, details 1 and 2 overlap.'],
      ['detail-deep', 'Section 2, detail 1 cuts past the middle of the leg.'],
      ['detail-base', 'Section 2, detail 1 sits where the profile turns back on itself.'],
    ]) expect(builderProblemText({ problem, index: 1, detailIndex: 0, otherDetailIndex: 1 })).toBe(text);
  });

  it('strict structure allows optional detail lines, limits details to eight and rejects unknown keys', () => {
    expect(newStackDetail()).toMatchObject({ from: 'bottom', at: 0, drawnPoints: { elevation: [] },
      profile: { points: { b1: [0, 0], b2: [0, 0.5] } } });
    const builder = (detail) => ({ type: 'stack', sections: [{ ...SQUARE, details: [detail] }] });
    const withoutLines = newStackDetail();
    delete withoutLines.drawnPoints;
    expect(isShapeBuilder(builder(withoutLines))).toBe(true);
    for (const change of [{ from: 'middle' }, { at: Infinity }, { extra: 1 },
      { drawnPoints: { elevation: ['missing'] } }, { profile: null }]) {
      expect(isShapeBuilder(builder({ ...newStackDetail(), ...change }))).toBe(false);
    }
    expect(isShapeBuilder({ type: 'stack', sections: [{ ...SQUARE, details: Array.from({ length: 9 }, newStackDetail) }] })).toBe(false);
    expect(isShapeBuilder({ type: 'stack', sections: [{ ...SQUARE, details: [] }] })).toBe(true);
    const closed = newStackDetail();
    closed.profile.loops[0].closed = true;
    closed.profile.loops[0].segs.push({ type: 'line', from: 'b2', to: 'b1' });
    expect(shapeBuilderProblems(leg([{ ...SQUARE, details: [closed] }]))[0].problem).toBe('detail-profile');
    const draft = leg([{ ...SQUARE, details: [{ ...newStackDetail(), at: -1 }] }]);
    expect(shapeBuilderProblems(draft)[0].problem).toBe('detail-outside');
  });

  it('cuts base arcs at height with unchanged centres and rejects backtracking only in the detail span', () => {
    const curved = { type: 'turned', drawnPoints: { elevation: [] },
      profile: { units: 'in', points: { a: [1, 0], b: [1, 10] },
        loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [1, 5], ccw: true }] }] },
      details: [{ ...newStackDetail(), at: 4 }] };
    const shape = leg([curved]);
    const ss = segments(shape.views.front);
    expect(ss[0]).toMatchObject({ type: 'arc', center: [1, 5], ccw: true });
    closePoint(ss[0].to, [1 + Math.sqrt(24), 4]);
    expect(ss[3]).toMatchObject({ type: 'arc', center: [1, 5], ccw: true });
    const hidden = stackHiddenBase(shape, 'front');
    expect(hidden.loops[0].segs[0]).toMatchObject({ type: 'arc', center: [1, 5], ccw: true });
    expect(isProfileGeometry(hidden)).toBe(true);
    expect(isShape(shape)).toBe(true);
    const folded = { type: 'turned', drawnPoints: { elevation: [] },
      profile: { units: 'in', points: { a: [1, 0], b: [2, 6], c: [1, 4], d: [1, 10] },
        loops: [{ id: 'L1', closed: false, segs: [['a', 'b'], ['b', 'c'], ['c', 'd']]
          .map(([from, to]) => ({ type: 'line', from, to })) }] } };
    expect(shapeBuilderProblems(leg([{ ...folded, details: [{ ...newStackDetail(), at: 5 }] }])))
      .toEqual([{ problem: 'detail-base', index: 0, detailIndex: 0 }]);
    expect(isShape(leg([{ ...folded, details: [{ ...newStackDetail(), at: 8 }] }]))).toBe(true);
    const arcFold = { type: 'turned', drawnPoints: { elevation: [] },
      profile: { units: 'in', points: { a: [2, 0], b: [2, 2], c: [4, 2], d: [4, 5] },
        loops: [{ id: 'L1', closed: false, segs: [
          { type: 'line', from: 'a', to: 'b' },
          { type: 'arc', from: 'b', to: 'c', center: [3, 2], ccw: false },
          { type: 'line', from: 'c', to: 'd' },
        ] }] } };
    expect(shapeBuilderProblems(leg([{ ...arcFold, details: [{ ...newStackDetail(), at: 2.25 }] }])))
      .toEqual([{ problem: 'detail-base', index: 0, detailIndex: 0 }]);
  });

  it('profile adapters preserve details on turned edits, reverse chains, and keep selected lines across', () => {
    const shape = leg([{ ...TL, details: [newStackDetail()] }]);
    const profile = stackDetailProfile(shape, 0, 0);
    expect(profile.id).toBe('details-leg:s0d0');
    profile.geometry = { units: 'in', points: { a: [0, 0], b: [0.1, 0.25], c: [0, 0.5] },
      loops: [{ id: 'L1', closed: false, segs: [
        { type: 'line', from: 'c', to: 'b' }, { type: 'line', from: 'b', to: 'a' },
      ] }] };
    profile.drawnPoints.elevation = ['a', 'b', 'c'];
    const next = withStackDetailProfile(shape, 0, 0, profile);
    expect(across(next.views.front)).toHaveLength(3);
    closePoint(across(next.views.front)[2][1], [0.85, 0.25]);
    expect(stackDetailProfile(shape, 1, 0)).toBeNull();
    expect(withStackDetailProfile(shape, 0, 1, profile)).toBeNull();
    const rebuilt = withStackSectionProfile(next, 0, stackSectionProfile(next, 0));
    expect(rebuilt.builder.sections[0].details).toEqual(next.builder.sections[0].details);
    expect(shape.builder.sections[0].details[0].profile.points.b1).toEqual([0, 0]);
  });

  it('inside tapers splice each side independently and depth checks use the narrowing width', () => {
    const section = { type: 'tapered', shape: 'square', top: 2, bottom: 1.5, height: 25, taper: 'inside',
      details: [{ ...newStackDetail(), at: 4 }] };
    const shape = leg([section]);
    closePoint(segments(shape.views.front)[1].center, [1, 4.25]);
    closePoint(segments(shape.views.side)[1].center, [0.58, 4.25]);
    closePoint(stackHiddenBase(shape, 'side').points.s1h0p0, [0.58, 4]);
    expect(isShape(shape)).toBe(true);
    const cove = newStackDetail();
    cove.profile.points.b2 = [0, 1.6];
    cove.profile.loops[0].segs[0] = { ...cove.profile.loops[0].segs[0], center: [0, 0.8], ccw: false };
    expect(shapeBuilderProblems(leg([{ ...section, details: [cove] }]))[0].problem).toBe('detail-deep');
  });

  it('minimum stretch height reserves both ends, preserves touching details, and drops replaced base ticks', () => {
    const section = { ...SQUARE, details: [{ ...newStackDetail(), at: 1 }, { ...newStackDetail(), from: 'top', at: 2 }] };
    const shape = leg([section], 0);
    expect(resolveShape(shape, { h: 3.9 }).warnings[0].fixed).toBe(4);
    const minimum = resolveShape(shape, { h: 4 });
    expect(minimum.shape.box.h).toBe(4);
    expect(isShape(minimum.shape)).toBe(true);
    const base = { ...TL, profile: { units: 'in', points: { a: [1, 0], b: [1, 4.25], c: [1, 8] },
      loops: [{ id: 'L1', closed: false, segs: [
        { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
      ] }] }, drawnPoints: { elevation: ['b'] }, details: [{ ...newStackDetail(), at: 4 }] };
    expect(across(leg([base]).views.front)).toHaveLength(2);
  });
});
