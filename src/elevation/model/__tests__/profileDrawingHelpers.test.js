import { describe, expect, it } from 'vitest';
import { isSectionProfileDraft, newSectionProfile } from '../sectionProfiles.js';
import { addCircleLoop, addRectangleLoop, deleteProfileSegment, mirrorCopyLoop } from '../profileEditing.js';

const square = { ...newSectionProfile([], 'square'), drawnPoints: { elevation: ['p1'], plan: ['p2'] } };

describe('SH2 drawing helpers', () => {
  it('anchor 1: rectangles start low-left and run counter-clockwise regardless of pick order', () => {
    const result = addRectangleLoop(square, [3, 3], [0.5, 1]);
    expect(Object.values(result.geometry.points).slice(4)).toEqual([[0.5, 1], [3, 1], [3, 3], [0.5, 3]]);
    expect(result.geometry.loops[1]).toEqual({ id: 'L2', closed: true, segs: [
      { type: 'line', from: 'p5', to: 'p6' }, { type: 'line', from: 'p6', to: 'p7' },
      { type: 'line', from: 'p7', to: 'p8' }, { type: 'line', from: 'p8', to: 'p5' },
    ] });
    expect(addRectangleLoop(square, [0.5, 1], [3, 3])).toEqual(result);
    expect(square.geometry.loops).toHaveLength(1);
  });

  it('reuses all existing rectangle corners and refuses degenerate or invalid rectangles', () => {
    const result = addRectangleLoop(square, [0.75, 0], [0, -0.75]);
    expect(result.geometry.points).toEqual(square.geometry.points);
    expect(result.geometry.loops[1].segs.map((seg) => seg.from)).toEqual(['p4', 'p3', 'p2', 'p1']);
    for (const end of [[0, 2], [2, 0], [NaN, 1], [Infinity, 1]]) {
      expect(addRectangleLoop(square, [0, 0], end)).toBeNull();
    }
    expect(addRectangleLoop(null, [0, 0], [1, 1])).toBeNull();
  });

  it('anchor 2: circles have the exact horizontal endpoints and two ccw arcs', () => {
    const result = addCircleLoop(square, [1.5, 1.5], 0.625);
    expect(result.geometry.points.p5).toEqual([2.125, 1.5]);
    expect(result.geometry.points.p6).toEqual([0.875, 1.5]);
    expect(result.geometry.loops[1]).toEqual({ id: 'L2', closed: true, segs: [
      { type: 'arc', from: 'p5', to: 'p6', center: [1.5, 1.5], ccw: true },
      { type: 'arc', from: 'p6', to: 'p5', center: [1.5, 1.5], ccw: true },
    ] });
    for (const radius of [0, -1, 1 / 256, NaN, Infinity]) expect(addCircleLoop(square, [1.5, 1.5], radius)).toBeNull();
    expect(addCircleLoop(square, [NaN, 0], 1)).toBeNull();
    expect(isSectionProfileDraft(result)).toBe(true);
  });

  it('anchor 3: mirror copy reflects arc centers, reverses ccw and leaves the source unchanged', () => {
    const circle = addCircleLoop(square, [1.5, 1.5], 0.625);
    const source = structuredClone(circle);
    const result = mirrorCopyLoop(circle, 'L2', 'x', 15);
    expect(result.geometry.points.p7).toEqual([27.875, 1.5]);
    expect(result.geometry.points.p8).toEqual([29.125, 1.5]);
    expect(result.geometry.loops[2]).toEqual({ id: 'L3', closed: true, segs: [
      { type: 'arc', from: 'p7', to: 'p8', center: [28.5, 1.5], ccw: false },
      { type: 'arc', from: 'p8', to: 'p7', center: [28.5, 1.5], ccw: false },
    ] });
    expect(circle).toEqual(source);
    expect(mirrorCopyLoop(circle, 'L2', 'y', 3).geometry.loops[2].segs[0].center).toEqual([1.5, 4.5]);
  });

  it('mirror copy uses fresh ids even on its axis, preserves open loops and drawn points, and validates inputs', () => {
    const source = deleteProfileSegment(square, 'L1', 3);
    const result = mirrorCopyLoop(source, 'L1', 'x');
    expect(result.geometry.loops[1].closed).toBe(false);
    expect(result.geometry.points.p5).toEqual([0, 0]);
    expect(result.geometry.points.p6).toEqual([-0.75, 0]);
    expect(result.drawnPoints).toEqual(source.drawnPoints);
    expect(result.geometry.loops[1].segs[1].from).toBe(result.geometry.loops[1].segs[0].to);
    expect(mirrorCopyLoop(source, 'missing', 'x')).toBeNull();
    expect(mirrorCopyLoop(source, 'L1', 'z')).toBeNull();
    expect(mirrorCopyLoop(source, 'L1', 'y', NaN)).toBeNull();
  });

  it('anchor 4: deleting from a closed loop opens it starting after the removed segment', () => {
    const result = deleteProfileSegment(square, 'L1', 1);
    expect(result.geometry.loops).toEqual([{ id: 'L1', closed: false, segs: [
      square.geometry.loops[0].segs[2], square.geometry.loops[0].segs[3], square.geometry.loops[0].segs[0],
    ] }]);
    expect(result.geometry.points).toEqual(square.geometry.points);
    expect(result.drawnPoints).toEqual(square.drawnPoints);
  });

  it('anchor 4: deleting the middle of an open loop splits it, with the next free loop id', () => {
    const open = deleteProfileSegment(square, 'L1', 3);
    const withCircle = addCircleLoop(open, [2, 2], 1);
    const result = deleteProfileSegment(withCircle, 'L1', 1);
    expect(result.geometry.loops.slice(0, 2)).toEqual([
      { id: 'L1', closed: false, segs: [square.geometry.loops[0].segs[0]] },
      { id: 'L3', closed: false, segs: [square.geometry.loops[0].segs[2]] },
    ]);
    expect(result.geometry.points).toEqual(withCircle.geometry.points);
  });

  it('anchor 4: trims either open end, removes empty loops, and allows removing the last segment', () => {
    const open = deleteProfileSegment(square, 'L1', 3);
    expect(deleteProfileSegment(open, 'L1', 0).geometry.loops[0].segs).toEqual(open.geometry.loops[0].segs.slice(1));
    const one = deleteProfileSegment(deleteProfileSegment(open, 'L1', 2), 'L1', 1);
    expect(deleteProfileSegment(one, 'L1', 0).geometry.loops).toEqual([]);
    const withCircle = addCircleLoop(one, [2, 2], 1);
    const removed = deleteProfileSegment(withCircle, 'L1', 0);
    expect(removed.geometry.loops.map((loop) => loop.id)).toEqual(['L2']);
    expect(removed.geometry.points).toEqual(withCircle.geometry.points);
    const openedCircle = deleteProfileSegment(removed, 'L2', 0);
    expect(openedCircle.geometry.loops[0]).toEqual({ id: 'L2', closed: false, segs: [removed.geometry.loops[0].segs[1]] });
    for (const index of [-1, 1.5, 99]) expect(deleteProfileSegment(one, 'L1', index)).toBeNull();
    expect(deleteProfileSegment(one, 'missing', 0)).toBeNull();
  });
});
