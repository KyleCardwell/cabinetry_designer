import { describe, expect, it } from 'vitest';
import { isFaceNode } from '../faces.js';
import {
  makeDrawerStack, removeFace, setGroupCount, setSeamNoRail, splitFace,
} from '../faceTree.js';

const drawer = { type: 'drawer_front', size: null };
const stack = (count, noRail) => ({
  direction: 'vertical', size: null, children: Array.from({ length: count }, () => drawer), ...(noRail ? { noRail } : {}),
});

describe('SPEC-36.3 no rail seams', () => {
  it('validates the seam list', () => {
    expect(isFaceNode(stack(3, [0, 1]))).toBe(true);
    expect(isFaceNode(stack(3, [1]))).toBe(true);
    expect(isFaceNode(stack(3, []))).toBe(false);
    expect(isFaceNode(stack(3, [1, 0]))).toBe(false);
    expect(isFaceNode(stack(3, [2]))).toBe(false);
    expect(isFaceNode(stack(3, [0.5]))).toBe(false);
    expect(isFaceNode(stack(3, true))).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, noRail: [0] })).toBe(false);
    const nested = {
      direction: 'vertical',
      size: null,
      children: [drawer, drawer, { direction: 'horizontal', size: null, children: [drawer, drawer] }],
    };
    expect(isFaceNode({ ...nested, noRail: [0] })).toBe(true);
    expect(isFaceNode({ ...nested, noRail: [1] })).toBe(false);
  });

  it('turns one seam on and off, only between two leaves', () => {
    const plain = stack(3);
    const one = setSeamNoRail(plain, 'r', 1, true);
    expect(one.noRail).toEqual([1]);
    const both = setSeamNoRail(one, 'r', 0, true);
    expect(both.noRail).toEqual([0, 1]);
    expect(setSeamNoRail(both, 'r', 0, true)).toBe(both);
    expect(setSeamNoRail(both, 'r', 1, false).noRail).toEqual([0]);
    expect(setSeamNoRail(one, 'r', 1, false)).toEqual(plain);
    expect(setSeamNoRail(plain, 'r', 1, false)).toBe(plain);
    expect(setSeamNoRail(plain, 'r', 2, true)).toBe(plain);
    const nested = {
      direction: 'vertical',
      size: null,
      children: [drawer, drawer, { direction: 'horizontal', size: null, children: [drawer, drawer] }],
    };
    expect(setSeamNoRail(nested, 'r', 1, true)).toBe(nested);
    expect(setSeamNoRail(nested, 'r', 0, true).noRail).toEqual([0]);
  });

  it('moves the seams with their sections', () => {
    const cut = stack(4, [0, 2]);
    // Splitting a front the same way adds seams that keep a rail, and the later seams move down.
    expect(splitFace(cut, 'r.1', 'vertical', 2).noRail).toEqual([0, 3]);
    // Inside a shared opening the new seam stays shared.
    expect(splitFace(stack(3, [0, 1]), 'r.1', 'vertical', 2).noRail).toEqual([0, 1, 2]);
    // Nesting a front takes its seams away, and no others.
    expect(splitFace(cut, 'r.1', 'horizontal', 2).noRail).toEqual([2]);
    expect(makeDrawerStack(cut, 'r.2', 2).noRail).toEqual([0]);
    // A new count keeps the seams that still exist.
    expect(setGroupCount(cut, 'r', 3).noRail).toEqual([0]);
    expect(setGroupCount(cut, 'r', 6).noRail).toEqual([0, 2]);
    // Removing a front joins the seams beside it only if both were cut.
    expect(removeFace(stack(4, [0, 1]), 'r.1').noRail).toEqual([0]);
    expect(removeFace(stack(4, [0, 2]), 'r.1')).toEqual(stack(3, [1]));
    expect(removeFace(stack(4, [2]), 'r.0').noRail).toEqual([1]);
  });
});
