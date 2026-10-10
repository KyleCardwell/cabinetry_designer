import { describe, expect, it } from 'vitest';
import {
  defaultStretchY, isSectionProfile, isSectionProfileDraft, isSectionProfileList, isStretchLine,
  sectionProfileBounds, stretchLineProblem, stretchProfileGeometry,
} from '../sectionProfiles.js';
import {
  moveProfilePoint, profileArcInfo, profilePointJoints, setLoopClosed, setProfileKind,
  setProfileStretch, snapProfilePoint,
} from '../profileEditing.js';

const line = (from, to) => ({ type: 'line', from, to });
const profile = (id, kind, points, segs, closed, elevation, stretch) => ({
  id, name: id, kind, version: 1, archived: false, drawnPoints: { elevation },
  geometry: { units: 'in', points, loops: [{ id: 'L1', closed, segs }] },
  ...(stretch === undefined ? {} : { stretch: { y: stretch } }),
});
const BEAD5 = profile('Flush bead 5/16', 'door_outside',
  { a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
  [line('a', 'q'), line('q', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')], true, ['q', 'a'], -0.25);
const ROUND = profile('Round 1/4', 'door_outside',
  { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
  [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')], false, ['a']);
const ARCY = profile('ARCY', 'door_inside',
  { a: [0, 0], b: [0.5, 0], c: [0.5, -0.25], d: [0.25, -0.5], e: [0.25, -0.8125], f: [0, -0.8125] },
  [line('a', 'b'), line('b', 'c'),
    { type: 'arc', from: 'c', to: 'd', center: [0.25, -0.25], ccw: false },
    line('d', 'e'), line('e', 'f'), line('f', 'a')], true, []);

describe('SPEC-50.1 profile stretch line', () => {
  it('grows or shrinks BEAD5 to the target, rejects a thin target, and leaves ROUND unchanged (anchors 1–3)', () => {
    const before = structuredClone(BEAD5);
    for (const target of [-1, -0.75]) {
      expect(stretchProfileGeometry(BEAD5, target)).toEqual({
        ...BEAD5.geometry,
        points: { ...BEAD5.geometry.points, c: [0, target], d: [-0.3125, target] },
      });
    }
    expect(stretchProfileGeometry(BEAD5, -0.25)).toBeNull();
    expect(stretchProfileGeometry(ROUND, -1)).toBe(ROUND.geometry);
    expect(BEAD5).toEqual(before);
  });

  it('rejects arc crossings, touches, and out-of-range lines using arc extremes (anchor 4)', () => {
    const stretched = { ...ROUND, stretch: { y: -0.5 } };
    expect([-0.125, -0.5, -0.8125, 0, -0.25, NaN, Infinity, '-0.5']
      .map((y) => isStretchLine(stretched, y)))
      .toEqual([false, true, false, false, false, false, false, false]);
    // Both endpoints are above the line, but the major sweep reaches below it.
    const major = structuredClone(ROUND);
    major.geometry.loops[0].segs[0].ccw = false;
    expect(isStretchLine(major, -0.375)).toBe(false);
    expect(isStretchLine(major, -0.5)).toBe(false);
    expect(isStretchLine(major, -0.625)).toBe(true);
    expect(isSectionProfile(stretched)).toBe(true);
    for (const stretch of [null, undefined, {}, { y: -0.125 }, { y: -0.5, x: 0 }]) {
      expect(isSectionProfile({ ...ROUND, stretch })).toBe(false);
    }
  });

  it('edits draft stretch and drops it when changing to a non-door kind (anchor 5)', () => {
    expect(isSectionProfile({ ...BEAD5, kind: 'crown' })).toBe(false);
    const { stretch: removedStretch, ...plain } = BEAD5;
    expect(removedStretch).toEqual({ y: -0.25 });
    expect(setProfileKind(BEAD5, 'crown')).toEqual({ ...plain, kind: 'crown' });
    expect(setProfileStretch(BEAD5, null)).toEqual(plain);
    expect(setProfileStretch(plain, -0.5)).toEqual({ ...plain, stretch: { y: -0.5 } });
    expect(setProfileStretch(BEAD5, 0).stretch).toEqual({ y: 0 });
    for (const kind of ['door_outside', 'door_inside', 'door_panel', 'applied_molding']) {
      expect(isSectionProfile({ ...BEAD5, kind })).toBe(true);
      expect(setProfileKind(BEAD5, kind).stretch).toEqual(BEAD5.stretch);
    }
    for (const kind of ['crown', 'top_mold', 'furniture_base', 'toe_kick', 'nosing', 'other']) {
      const draft = setProfileStretch({ ...plain, kind }, -0.5);
      expect(draft.stretch).toEqual({ y: -0.5 });
      expect(isSectionProfileDraft(draft)).toBe(true);
      expect(isSectionProfile(draft)).toBe(false);
      expect(Object.hasOwn(setProfileKind(BEAD5, kind), 'stretch')).toBe(false);
    }
    expect(BEAD5.stretch).toEqual({ y: -0.25 });
  });

  it('moves lower arc centers with their ends while preserving the upper arc and input', () => {
    const lower = structuredClone(ROUND);
    lower.stretch = { y: -0.375 };
    Object.assign(lower.geometry.points, { d: [0.25, -0.5], e: [0, -0.75], f: [0, -1.3125] });
    lower.geometry.loops.push({ id: 'L2', closed: false, segs: [
      { type: 'arc', from: 'd', to: 'e', center: [0.25, -0.75], ccw: true }, line('e', 'f'),
    ] });
    expect(isSectionProfile(lower)).toBe(true);
    const before = structuredClone(lower);
    const result = stretchProfileGeometry(lower, -1.5);
    expect(result.points).toEqual({
      a: [0.25, 0], b: [0, -0.25], c: [0, -1],
      d: [0.25, -0.6875], e: [0, -0.9375], f: [0, -1.5],
    });
    expect(result.loops[0]).toEqual(lower.geometry.loops[0]);
    expect(result.loops[1].segs[0].center).toEqual([0.25, -0.9375]);
    expect(isSectionProfile({ ...lower, geometry: result })).toBe(true);
    expect(lower).toEqual(before);
    // The lower arc's extreme, rather than a named point, is now the deepest point.
    const deepestArc = structuredClone(lower);
    deepestArc.geometry.points.f = [0, -0.875];
    deepestArc.geometry.loops[1].segs[0].ccw = false;
    expect(isSectionProfile(deepestArc)).toBe(true);
    const stretchedArc = stretchProfileGeometry(deepestArc, -1.5);
    expect(stretchedArc.loops[1].segs[0].center).toEqual([0.25, -1.25]);
    expect(sectionProfileBounds({ geometry: stretchedArc }).minY).toBe(-1.5);
  });

  it('honors EPS at the line and target, rounds moved coordinates to six decimals without negative zero', () => {
    expect(isStretchLine(BEAD5, -0.8125 + 1e-6)).toBe(false);
    expect(isStretchLine(BEAD5, -1e-6)).toBe(false);
    expect(stretchProfileGeometry(BEAD5, -0.25 - 1e-6)).toBeNull();
    const near = structuredClone(BEAD5);
    Object.assign(near.geometry.points, {
      c: [-0.0000001, -0.8125], on: [0.12345678, -0.25], near: [0, -0.2500005],
    });
    const result = stretchProfileGeometry(near, -1 / 3);
    expect(result.points.c).toEqual([0, -0.333333]);
    expect(Object.is(result.points.c[0], -0)).toBe(false);
    expect(result.points.on).toEqual(near.geometry.points.on);
    expect(result.points.near).toEqual(near.geometry.points.near);
    expect(stretchProfileGeometry(BEAD5, NaN)).toBeNull();
  });
});

describe('SPEC-50.1.1 draft stretch and loop closure', () => {
  it('chooses ARCY’s nearest valid sixteenth, deeper ties, and a rounded fallback (anchor 1)', () => {
    expect(defaultStretchY(ARCY)).toBe(-0.5625);
    const { stretch: removedStretch, ...plain } = BEAD5;
    expect(removedStretch).toEqual({ y: -0.25 });
    expect(defaultStretchY(plain)).toBe(-0.4375);
    const blocked = profile('Blocked', 'door_inside',
      { a: [0.25, 0], b: [0.25, -0.5] },
      [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: false }], false, []);
    expect(defaultStretchY(blocked)).toBe(-0.25);
    expect(stretchLineProblem(setProfileStretch(blocked, defaultStretchY(blocked)))).toBe('arc');
    const shallow = profile('Shallow', 'door_inside',
      { a: [0, 0], b: [0, -0.03] }, [line('a', 'b')], false, []);
    expect(defaultStretchY(shallow)).toBe(0);
    expect(stretchLineProblem(setProfileStretch(shallow, defaultStretchY(shallow)))).toBe('range');
  });

  it('keeps an arc-crossing line in the draft while rejecting it for saving (anchor 2)', () => {
    const draft = setProfileStretch(ARCY, -0.375);
    expect(draft).toEqual({ ...ARCY, stretch: { y: -0.375 } });
    expect(isSectionProfile(draft)).toBe(false);
    expect(isSectionProfileDraft(draft)).toBe(true);
    expect(isSectionProfile(draft, { draft: true })).toBe(true);
    expect(isSectionProfileList([draft])).toBe(false);
    expect(stretchLineProblem(draft)).toBe('arc');
    expect(setProfileStretch(draft, null)).toEqual(ARCY);
    expect(setProfileStretch(draft, -0.6).stretch).toEqual({ y: -0.6 });
    expect(ARCY).not.toHaveProperty('stretch');
  });

  it('keeps out-of-range finite lines, rejects non-finite input, and honors EPS (anchor 3)', () => {
    const draft = setProfileStretch(ARCY, 0.25);
    expect(draft.stretch).toEqual({ y: 0.25 });
    expect(isSectionProfileDraft(draft)).toBe(true);
    expect(isSectionProfile(draft)).toBe(false);
    expect(stretchLineProblem(draft)).toBe('range');
    for (const y of [NaN, Infinity, -Infinity, undefined, '-0.375']) {
      expect(setProfileStretch(ARCY, y)).toBeNull();
    }
    for (const y of [-0.8125, -0.8125 + 1e-6, -1e-6, 0]) {
      expect(stretchLineProblem({ ...ARCY, stretch: { y } })).toBe('range');
    }
    expect(stretchLineProblem({ ...ARCY, stretch: { y: -0.8125 + 2e-6 } })).toBeNull();
    expect(stretchLineProblem({ ...ARCY, stretch: { y: -2e-6 } })).toBeNull();
  });

  it('accepts both depth edits and preserves the now out-of-range line (anchor 4)', () => {
    const original = setProfileStretch(ARCY, -0.6);
    expect(isSectionProfile(original)).toBe(true);
    const first = moveProfilePoint(original, 'e', [0.25, -0.55]);
    expect(first.geometry.points.e).toEqual([0.25, -0.55]);
    expect(stretchLineProblem(first)).toBeNull();
    const second = moveProfilePoint(first, 'f', [0, -0.55]);
    expect(sectionProfileBounds(second).minY).toBe(-0.55);
    expect(second.stretch).toEqual({ y: -0.6 });
    expect(stretchLineProblem(second)).toBe('range');
    expect(isSectionProfileDraft(second)).toBe(true);
    expect(isSectionProfile(second)).toBe(false);
    expect(original.geometry.points.e).toEqual([0.25, -0.8125]);
  });

  it('allows arc-crossing geometry edits and draft snapping, joints, and arc information', () => {
    const original = setProfileStretch(ARCY, -0.6);
    const moved = moveProfilePoint(original, 'c', [0.5, -0.6]);
    expect(moved.stretch).toEqual({ y: -0.6 });
    expect(stretchLineProblem(moved)).toBe('arc');
    const draft = setProfileStretch(ARCY, -0.375);
    expect(snapProfilePoint(draft, [0.51, 0.01], { grid: 0.0625, reach: 0.05 }))
      .toEqual({ xy: [0.5, 0], id: 'b' });
    expect(profilePointJoints(draft, 'c')).toEqual(['L1']);
    expect(profileArcInfo(draft, 'L1', 2))
      .toEqual({ center: [0.25, -0.25], radius: 0.25, sweep: 90, ccw: false });
  });

  it('leaves unstretched profiles valid and relaxes only stretch.y validation (anchor 5)', () => {
    expect(stretchLineProblem(ARCY)).toBeNull();
    expect(isSectionProfileDraft(ARCY)).toBe(true);
    expect(isSectionProfile(ARCY)).toBe(true);
    for (const stretch of [null, undefined, {}, { y: NaN }, { y: Infinity }, { y: '-0.375' }, { y: -0.375, x: 0 }]) {
      expect(isSectionProfileDraft({ ...ARCY, stretch })).toBe(false);
    }
    for (const patch of [{ name: '' }, { kind: 'unknown' }, { version: 0 }, { geometry: {} },
      { drawnPoints: { elevation: ['missing'] } }, { extra: true }]) {
      const invalid = { ...ARCY, stretch: { y: -0.375 }, ...patch };
      expect(isSectionProfileDraft(invalid)).toBe(false);
      expect(moveProfilePoint(invalid, 'a', [0, 0])).toBeNull();
    }
  });

  it('closes a three-point loop with a line and opens it back to the original (anchor 6)', () => {
    const open = profile('Open', 'door_inside',
      { a: [0, 0], b: [0.5, 0], c: [0.5, -0.5] }, [line('a', 'b'), line('b', 'c')], false, []);
    const closed = setLoopClosed(open, 'L1', true);
    expect(closed.geometry.loops[0])
      .toEqual({ id: 'L1', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'a')] });
    expect(isSectionProfile(closed)).toBe(true);
    expect(setLoopClosed(closed, 'L1', false)).toEqual(open);
    expect(setLoopClosed(closed, 'L1', true)).toEqual(closed);
    expect(setLoopClosed(open, 'L1', false)).toEqual(open);
    expect(open.geometry.loops[0].segs).toHaveLength(2);
    const draft = setProfileStretch(ARCY, -0.375);
    const openedDraft = setLoopClosed(draft, 'L1', false);
    expect(openedDraft.stretch).toEqual(draft.stretch);
    expect(setLoopClosed(openedDraft, 'L1', true)).toEqual(draft);
  });

  it('refuses a two-point line closure and invalid arguments; opening removes an arc return (anchor 7)', () => {
    const open = profile('Two points', 'door_inside',
      { a: [0, 0], b: [0.5, -0.5] }, [line('a', 'b')], false, []);
    expect(setLoopClosed(open, 'L1', true)).toBeNull();
    expect(setLoopClosed(ARCY, 'missing', true)).toBeNull();
    expect(setLoopClosed(ARCY, 'L1', 'false')).toBeNull();
    expect(setLoopClosed(ARCY, null, false)).toBeNull();
    expect(setLoopClosed(null, 'L1', true)).toBeNull();
    const circle = profile('Circle', 'door_inside', { a: [0, 0], b: [0, -0.5] }, [
      { type: 'arc', from: 'a', to: 'b', center: [0, -0.25], ccw: false },
      { type: 'arc', from: 'b', to: 'a', center: [0, -0.25], ccw: false },
    ], true, []);
    expect(setLoopClosed(circle, 'L1', false).geometry.loops[0])
      .toEqual({ id: 'L1', closed: false, segs: [circle.geometry.loops[0].segs[0]] });
  });
});
