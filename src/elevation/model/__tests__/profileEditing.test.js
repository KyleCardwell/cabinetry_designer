import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import {
  PROFILE_GRID_STEPS, addProfilePoint, deleteProfilePoint, formatProfileCoord, isPointId, moveProfileOrigin,
  moveProfilePoint, moveProfilePoints, nextPointId, renameProfilePoint, snapProfilePoint,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');
const ARC = {
  ...SQUARE,
  geometry: {
    units: 'in', points: { a: [0, 0], b: [2, 0], c: [2, 2] },
    loops: [{ id: 'L1', closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'arc', from: 'b', to: 'c', center: [2, 1], ccw: true },
      { type: 'line', from: 'c', to: 'a' },
    ] }],
  },
};

describe('SPEC-48 editing profile points', () => {
  it('names new points and formats coordinates for typing', () => {
    expect(PROFILE_GRID_STEPS).toEqual([0.25, 0.125, 0.0625, 0.03125]);
    const gap = { ...SQUARE, geometry: { ...SQUARE.geometry, points: { p1: [0, 0], p3: [1, 0] } } };
    expect([nextPointId(COVE), nextPointId(SQUARE), nextPointId(gap)]).toEqual(['p1', 'p5', 'p2']);
    expect(['a', 'p12', 'face_edge', 'B2', '', '1a', 'a b', 'a-b', '_a', 'x'.repeat(24), 'x'.repeat(25)].map((id) => isPointId(id)))
      .toEqual([true, true, true, true, false, false, false, false, false, true, false]);
    expect([0, -0, 1.5, -0.8125, 0.015625, 2.25, 0.676777, -0.073223, 1 / 3].map((n) => formatProfileCoord(n)))
      .toEqual(['0', '0', '1 1/2', '-13/16', '1/64', '2 1/4', '0.6768', '-0.0732', '0.3333']);
  });

  it('adds a point, and deletes a loose one', () => {
    const added = addProfilePoint(COVE, [1, 1], 'p1');
    expect(Object.entries(added.geometry.points).at(-1)).toEqual(['p1', [1, 1]]);
    expect(added.geometry.loops).toEqual(COVE.geometry.loops);
    expect(COVE.geometry.points.p1).toBeUndefined();
    expect([
      addProfilePoint(COVE, [1, 1], 'a'),
      addProfilePoint(COVE, [1, 1], '1x'),
      addProfilePoint(COVE, [Number.NaN, 1], 'p1'),
    ]).toEqual([null, null, null]);
    expect(deleteProfilePoint(added, 'p1')).toEqual(COVE);
    const referenced = { ...added, drawnPoints: { elevation: ['b', 'p1'], plan: ['p1'] } };
    expect(deleteProfilePoint(referenced, 'p1'))
      .toEqual({ ...COVE, drawnPoints: { elevation: ['b'], plan: [] } });
    expect(deleteProfilePoint(COVE, 'zz')).toBeNull();
  });

  it('deletes a point a loop uses: its neighbours join, open ends trim and loops too small to draw go', () => {
    const line = (from, to) => ({ type: 'line', from, to });
    const [, arc] = COVE.geometry.loops[0].segs;
    expect(deleteProfilePoint(COVE, 'a').geometry).toEqual({ ...COVE.geometry,
      points: { b: [0.5, 0], c: [0.75, -0.25], d: [0.75, -0.8125], e: [0, -0.8125] },
      loops: [{ id: 'L1', closed: true, segs: [arc, line('c', 'd'), line('d', 'e'), line('e', 'b')] }] });
    const open = { ...COVE, geometry: { ...COVE.geometry, loops: [{ id: 'L1', closed: false,
      segs: [line('a', 'b'), line('b', 'd'), line('d', 'e')] }] } };
    expect(deleteProfilePoint(open, 'a').geometry.loops[0].segs).toEqual([line('b', 'd'), line('d', 'e')]);
    expect(deleteProfilePoint(open, 'b').geometry.loops[0].segs).toEqual([line('a', 'd'), line('d', 'e')]);
    const triangle = { ...COVE, drawnPoints: { elevation: [] }, geometry: { ...COVE.geometry, loops: [
      { id: 'L1', closed: true, segs: [line('a', 'b'), line('b', 'd'), line('d', 'a')] },
      { id: 'L2', closed: false, segs: [line('d', 'e')] },
    ] } };
    const shared = deleteProfilePoint(triangle, 'd');
    expect(shared.geometry.loops).toEqual([{ id: 'L1', closed: false, segs: [line('a', 'b')] }]);
    expect(Object.keys(shared.geometry.points)).toEqual(['a', 'b', 'c']);
    const circle = { ...SQUARE, geometry: { units: 'in', points: { p1: [1, 0], p2: [-1, 0] }, loops: [{ id: 'L1', closed: true,
      segs: [{ type: 'arc', from: 'p1', to: 'p2', center: [0, 0], ccw: true }, { type: 'arc', from: 'p2', to: 'p1', center: [0, 0], ccw: true }] }] } };
    expect(deleteProfilePoint(circle, 'p1').geometry).toEqual({ units: 'in', points: {}, loops: [] });
  });

  it('renames a point everywhere it is named', () => {
    const renamed = renameProfilePoint({ ...COVE, drawnPoints: { elevation: ['b', 'c'], plan: ['a'] } }, 'a', 'face');
    expect(Object.keys(renamed.geometry.points)).toEqual(['face', 'b', 'c', 'd', 'e']);
    expect(renamed.geometry.points.face).toEqual([0, 0]);
    const segs = renamed.geometry.loops[0].segs;
    expect([segs[0].from, segs[4].to]).toEqual(['face', 'face']);
    expect(renamed.drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['face'] });
    const b1 = renameProfilePoint(COVE, 'b', 'b1');
    expect([b1.drawnPoints, b1.geometry.loops[0].segs[0].to, b1.geometry.loops[0].segs[1].from])
      .toEqual([{ elevation: ['b1', 'c'] }, 'b1', 'b1']);
    expect(renameProfilePoint(COVE, 'a', 'a')).toEqual(COVE);
    expect([renameProfilePoint(COVE, 'a', 'b'), renameProfilePoint(COVE, 'a', '1x'), renameProfilePoint(COVE, 'q', 'r')])
      .toEqual([null, null, null]);
  });

  it('moves a point; an arc that ends on it keeps its sweep and gets a new center', () => {
    expect(moveProfilePoint(CROWN, 'c3', [3.25, 4.5]))
      .toEqual({ ...CROWN, geometry: { ...CROWN.geometry, points: { ...CROWN.geometry.points, c3: [3.25, 4.5] } } });
    const cove = moveProfilePoint(COVE, 'c', [1, -0.5]);
    expect(cove.geometry.points.c).toEqual([1, -0.5]);
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [0.5, -0.5], ccw: false });
    const bead = moveProfilePoint(BEAD, 't', [1, 0]);
    expect(bead.geometry.loops[0].segs[0]).toEqual({ type: 'arc', from: 's', to: 't', center: [0.5, 0], ccw: false });
    expect([
      moveProfilePoint(COVE, 'c', [0.5, 0]),
      moveProfilePoint(COVE, 'q', [1, 1]),
      moveProfilePoint(COVE, 'c', [1, Number.POSITIVE_INFINITY]),
    ]).toEqual([null, null, null]);
    expect(COVE.geometry.points.c).toEqual([0.75, -0.25]);
  });

  it('moves the origin to a point', () => {
    expect(moveProfileOrigin(CROWN, 'c5').geometry.points)
      .toEqual({ c1: [-0.5, 0], c2: [-0.5, 4.5], c3: [2.5, 4.5], c4: [2.5, 3.75], c5: [0, 0] });
    const cove = moveProfileOrigin(COVE, 'e');
    expect(cove.geometry.points).toEqual({ a: [0, 0.8125], b: [0.5, 0.8125], c: [0.75, 0.5625], d: [0.75, 0], e: [0, 0] });
    expect(cove.geometry.loops[0].segs[1].center).toEqual([0.5, 0.5625]);
    expect([moveProfileOrigin(COVE, 'a'), moveProfileOrigin(COVE, 'q')]).toEqual([COVE, null]);
  });

  it('snaps to a nearby point, else to the grid', () => {
    expect([
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.05 }),
      snapProfilePoint(COVE, [0.3, -0.4], { grid: 0.0625, reach: 0.05 }),
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.05, exclude: 'b' }),
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.005 }),
      snapProfilePoint(COVE, [0.3, -0.4], { grid: 0.25, reach: 0.05 }),
    ]).toEqual([
      { xy: [0.5, 0], id: 'b' },
      { xy: [0.3125, -0.375], id: null },
      { xy: [0.5, 0], id: null },
      { xy: [0.5, 0], id: null },
      { xy: [0.25, -0.5], id: null },
    ]);
  });
});

describe('SH2.1 step a group point moves', () => {
  it('anchor 1: translates an entire arc with both ends, independently of pick order and direction', () => {
    const before = structuredClone(ARC);
    const moved = moveProfilePoints(ARC, ['b', 'c'], [1, 0.5]);
    expect(moved.geometry.points).toEqual({ a: [0, 0], b: [3, 0.5], c: [3, 2.5] });
    expect(moved.geometry.loops[0].segs[1]).toEqual({
      type: 'arc', from: 'b', to: 'c', center: [3, 1.5], ccw: true,
    });
    expect(moveProfilePoints(ARC, ['c', 'b'], [1, 0.5])).toEqual(moved);
    const clockwise = structuredClone(ARC);
    clockwise.geometry.loops[0].segs[1].ccw = false;
    expect(moveProfilePoints(clockwise, ['b', 'c'], [1, 0.5]).geometry.loops[0].segs[1])
      .toMatchObject({ center: [3, 1.5], ccw: false });
    expect(ARC).toEqual(before);
  });

  it('anchor 2: preserves the sweep and direction when only one arc end moves', () => {
    const moved = moveProfilePoints(ARC, ['c'], [0, 2]);
    expect(moved.geometry.points).toEqual({ a: [0, 0], b: [2, 0], c: [2, 4] });
    expect(moved.geometry.loops[0].segs[1]).toEqual({
      type: 'arc', from: 'b', to: 'c', center: [2, 2], ccw: true,
    });
    expect(moveProfilePoints(COVE, ['c'], [0.25, -0.25]))
      .toEqual(moveProfilePoint(COVE, 'c', [1, -0.5]));
    expect(moveProfilePoints(COVE, ['b'], [-0.25, 0.25]))
      .toEqual(moveProfilePoint(COVE, 'b', [0.25, 0.25]));
  });

  it('anchor 3: rejects unknown, empty, duplicate or malformed ids and non-finite amounts', () => {
    for (const [ids, delta] of [
      [['b', 'zz'], [1, 0]], [[], [1, 0]], [['b', 'b'], [1, 0]], [['b'], [NaN, 0]],
      [['b'], [0, Infinity]], [['b'], [1]], [['b'], null], [['b'], [1, 2, 3]],
      [null, [1, 0]], ['b', [1, 0]], [[2], [1, 0]], [Array(1), [1, 0]], [['toString'], [0, 0]],
    ]) expect(moveProfilePoints(ARC, ids, delta)).toBeNull();
    expect(moveProfilePoints(null, ['b'], [1, 0])).toBeNull();
  });

  it('fails the whole group move without mutating the input when an arc collapses', () => {
    const before = structuredClone(ARC);
    expect(moveProfilePoints(ARC, ['a', 'c'], [0, -2])).toBeNull();
    expect(ARC).toEqual(before);
  });

  it('rounds moved coordinates and arc centres to six decimals and leaves zero moves equal', () => {
    const moved = moveProfilePoints(ARC, ['b', 'c'], [1 / 3, -1 / 3]);
    expect(moved.geometry.points).toEqual({ a: [0, 0], b: [2.333333, -0.333333], c: [2.333333, 1.666667] });
    expect(moved.geometry.loops[0].segs[1].center).toEqual([2.333333, 0.666667]);
    const precise = { ...SQUARE, geometry: { units: 'in', points: { p: [1 / 3, -1 / 3] }, loops: [] } };
    expect(moveProfilePoints(precise, ['p'], [0, 0])).toEqual(precise);
    expect(moveProfilePoints(ARC, ['b', 'c'], [0, 0])).toEqual(ARC);
  });
});
