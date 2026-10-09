import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import {
  PROFILE_GRID_STEPS, addProfilePoint, deleteProfilePoint, formatProfileCoord, isPointId, moveProfileOrigin,
  moveProfilePoint, nextPointId, renameProfilePoint, snapProfilePoint,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');

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

  it('adds a point, and deletes one only when no line or arc uses it', () => {
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
    expect([deleteProfilePoint(COVE, 'a'), deleteProfilePoint(COVE, 'zz')]).toEqual([null, null]);
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
