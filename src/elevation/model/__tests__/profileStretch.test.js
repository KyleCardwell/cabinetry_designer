import { describe, expect, it } from 'vitest';
import { isSectionProfile, isStretchLine, sectionProfileBounds, stretchProfileGeometry } from '../sectionProfiles.js';
import { setProfileKind, setProfileStretch } from '../profileEditing.js';

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

  it('edits stretch only for door kinds and drops it when changing to a non-door kind (anchor 5)', () => {
    expect(isSectionProfile({ ...BEAD5, kind: 'crown' })).toBe(false);
    const { stretch: removedStretch, ...plain } = BEAD5;
    expect(removedStretch).toEqual({ y: -0.25 });
    expect(setProfileKind(BEAD5, 'crown')).toEqual({ ...plain, kind: 'crown' });
    expect(setProfileStretch(BEAD5, null)).toEqual(plain);
    expect(setProfileStretch(plain, -0.5)).toEqual({ ...plain, stretch: { y: -0.5 } });
    expect(setProfileStretch(BEAD5, 0)).toBeNull();
    for (const kind of ['door_outside', 'door_inside', 'door_panel', 'applied_molding']) {
      expect(isSectionProfile({ ...BEAD5, kind })).toBe(true);
      expect(setProfileKind(BEAD5, kind).stretch).toEqual(BEAD5.stretch);
    }
    for (const kind of ['crown', 'top_mold', 'furniture_base', 'toe_kick', 'nosing', 'other']) {
      expect(setProfileStretch({ ...plain, kind }, -0.5)).toBeNull();
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
