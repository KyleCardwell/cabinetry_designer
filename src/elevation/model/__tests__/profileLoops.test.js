import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import {
  addProfileLoop, addProfilePoint, deleteProfileLoop, nextLoopId, profileArcInfo, profilePointJoints,
  removeProfileVertex, setArcRadius, setSegmentArc, setSegmentLine, splitProfileSegment,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');
const line = (from, to) => ({ type: 'line', from, to });
const segsOf = (profile, loop = 0) => profile.geometry.loops[loop].segs;

/** The 3/4" square plus three loose points for a second loop. */
function withLoosePoints() {
  let profile = addProfilePoint(SQUARE, [0.25, -0.25], 'p5');
  profile = addProfilePoint(profile, [0.5, -0.25], 'p6');
  return addProfilePoint(profile, [0.5, -0.5], 'p7');
}

describe('SPEC-48 editing profile loops and segments', () => {
  it('adds a loop of lines through points, closed or open', () => {
    const base = withLoosePoints();
    expect(nextLoopId(base)).toBe('L2');
    const closed = addProfileLoop(base, ['p5', 'p6', 'p7'], true);
    expect(closed.geometry.loops[1])
      .toEqual({ id: 'L2', closed: true, segs: [line('p5', 'p6'), line('p6', 'p7'), line('p7', 'p5')] });
    expect(nextLoopId(closed)).toBe('L3');
    expect(addProfileLoop(base, ['p5', 'p6'], false).geometry.loops[1])
      .toEqual({ id: 'L2', closed: false, segs: [line('p5', 'p6')] });
    expect([
      addProfileLoop(base, ['p5', 'p6'], true),
      addProfileLoop(base, ['p5'], false),
      addProfileLoop(base, ['p5', 'p5', 'p6'], false),
      addProfileLoop(base, ['p5', 'p6', 'p5'], false),
      addProfileLoop(base, ['p5', 'zz'], false),
    ]).toEqual([null, null, null, null, null]);
  });

  it('deletes a loop and the points only it used', () => {
    const closed = addProfileLoop(withLoosePoints(), ['p5', 'p6', 'p7'], true);
    expect(deleteProfileLoop(closed, 'L2')).toEqual(SQUARE);
    const drawn = { ...closed, drawnPoints: { elevation: ['p5'] } };
    expect(Object.keys(deleteProfileLoop(drawn, 'L2').geometry.points)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect([deleteProfileLoop(SQUARE, 'L1'), deleteProfileLoop(closed, 'L9')]).toEqual([null, null]);
  });

  it('splits a line at its middle and an arc at its half sweep', () => {
    const split = splitProfileSegment(SQUARE, 'L1', 0);
    expect(split.geometry.points.p5).toEqual([0.375, 0]);
    expect(segsOf(split))
      .toEqual([line('p1', 'p5'), line('p5', 'p2'), line('p2', 'p3'), line('p3', 'p4'), line('p4', 'p1')]);
    expect(splitProfileSegment(SQUARE, 'L1', 2, 'mid').geometry.points.mid).toEqual([0.375, -0.75]);
    const cove = splitProfileSegment(COVE, 'L1', 1);
    expect(cove.geometry.points.p1).toEqual([0.676777, -0.073223]);
    expect(segsOf(cove).slice(1, 3)).toEqual([
      { type: 'arc', from: 'b', to: 'p1', center: [0.5, -0.25], ccw: false },
      { type: 'arc', from: 'p1', to: 'c', center: [0.5, -0.25], ccw: false },
    ]);
    expect([
      splitProfileSegment(SQUARE, 'L1', 4),
      splitProfileSegment(SQUARE, 'L9', 0),
      splitProfileSegment(SQUARE, 'L1', 0, 'p1'),
    ]).toEqual([null, null, null]);
  });

  it('removes a corner by joining its two segments into one line', () => {
    const split = splitProfileSegment(SQUARE, 'L1', 0);
    expect(removeProfileVertex(split, 'L1', 'p5')).toEqual(SQUARE);
    const triangle = removeProfileVertex(SQUARE, 'L1', 'p2');
    expect(segsOf(triangle)).toEqual([line('p1', 'p3'), line('p3', 'p4'), line('p4', 'p1')]);
    const noStart = removeProfileVertex(SQUARE, 'L1', 'p1');
    expect(segsOf(noStart)).toEqual([line('p2', 'p3'), line('p3', 'p4'), line('p4', 'p2')]);
    expect(Object.keys(noStart.geometry.points)).toEqual(['p2', 'p3', 'p4']);
    const open = addProfileLoop(withLoosePoints(), ['p5', 'p6', 'p7'], false);
    expect([
      profilePointJoints(SQUARE, 'p1'),
      profilePointJoints(open, 'p6'),
      profilePointJoints(open, 'p5'),
      profilePointJoints(SQUARE, 'zz'),
    ]).toEqual([['L1'], ['L2'], [], []]);
    expect(segsOf(removeProfileVertex(open, 'L2', 'p6'), 1)).toEqual([line('p5', 'p7')]);
    expect([
      removeProfileVertex(triangle, 'L1', 'p3'),
      removeProfileVertex(open, 'L2', 'p5'),
      removeProfileVertex(SQUARE, 'L9', 'p1'),
    ]).toEqual([null, null, null]);
  });

  it('turns a line into an arc by sweep and direction, and back', () => {
    const up = setSegmentArc(SQUARE, 'L1', 0, { sweep: 180, ccw: false });
    expect(segsOf(up)[0]).toEqual({ type: 'arc', from: 'p1', to: 'p2', center: [0.375, 0], ccw: false });
    const down = setSegmentArc(SQUARE, 'L1', 0, { sweep: 90, ccw: true });
    expect(segsOf(down)[0]).toEqual({ type: 'arc', from: 'p1', to: 'p2', center: [0.375, 0.375], ccw: true });
    expect(setSegmentLine(down, 'L1', 0)).toEqual(SQUARE);
    expect(setSegmentLine(SQUARE, 'L1', 0)).toEqual(SQUARE);
    expect([
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 0, ccw: false }),
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 360, ccw: false }),
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 90, ccw: 'yes' }),
      setSegmentArc(SQUARE, 'L1', 7, { sweep: 90, ccw: false }),
    ]).toEqual([null, null, null, null]);
    expect(profileArcInfo(COVE, 'L1', 1)).toEqual({ center: [0.5, -0.25], radius: 0.25, sweep: 90, ccw: false });
    expect(profileArcInfo(COVE, 'L1', 0)).toBeNull();
  });

  it('sets an arc radius, keeping its direction and whether it is more than a half circle', () => {
    const cove = setArcRadius(COVE, 'L1', 1, 0.5);
    const arc = segsOf(cove)[1];
    expect([arc.center, arc.ccw]).toEqual([[0.294281, -0.455719], false]);
    const info = profileArcInfo(cove, 'L1', 1);
    expect(info.radius).toBeCloseTo(0.5, 5);
    expect(info.sweep).toBeCloseTo(41.409622, 4);
    expect(setArcRadius(BEAD, 'L1', 0, 0.25)).toEqual(BEAD);
    expect([setArcRadius(COVE, 'L1', 1, 0.1), setArcRadius(COVE, 'L1', 0, 0.5), setArcRadius(COVE, 'L1', 1, -1)])
      .toEqual([null, null, null]);
  });
});
