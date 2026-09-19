import { describe, expect, it } from 'vitest';
import {
  equalizeGroup,
  faceOutline,
  getFaceNode,
  parentFacePath,
  removeFace,
  setFaceSize,
  setFaceType,
  setGroupCount,
  splitFace,
} from '../faceTree.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const DOOR = deepFreeze({ type: 'door', size: null });
const TWO = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    { type: 'drawer_front', size: 6 },
    { type: 'door', size: null },
  ],
});
const BASE3 = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    { type: 'drawer_front', size: 6 },
    { type: 'drawer_front', size: null },
    { type: 'drawer_front', size: null },
  ],
});
const NESTED = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    {
      direction: 'horizontal',
      size: 6,
      children: [
        { type: 'drawer_front', size: null },
        { type: 'drawer_front', size: null },
      ],
    },
    { type: 'door', size: null },
  ],
});

describe('faceTree', () => {
  it('9: splits a leaf root into a group', () => {
    expect(splitFace(DOOR, 'r', 'vertical', 3)).toEqual({
      direction: 'vertical',
      size: null,
      children: [DOOR, DOOR, DOOR],
    });
  });

  it('10: same direction flattens into the parent', () => {
    expect(splitFace(TWO, 'r.1', 'vertical', 2).children).toEqual([
      { type: 'drawer_front', size: 6 },
      { type: 'door', size: null },
      { type: 'door', size: null },
    ]);
  });

  it('11: other direction nests and keeps the size', () => {
    expect(splitFace(TWO, 'r.0', 'horizontal', 2)).toEqual(NESTED);
  });

  it('12: count clamps, non-leaf is unchanged', () => {
    expect(splitFace(DOOR, 'r', 'vertical', 1).children).toHaveLength(2);
    expect(splitFace(DOOR, 'r', 'vertical', 20).children).toHaveLength(8);
    expect(splitFace(TWO, 'r', 'vertical', 2)).toBe(TWO);
  });

  it('13: setGroupCount grows, shrinks and collapses', () => {
    const four = setGroupCount(BASE3, 'r', 4);
    expect(four.children.map((c) => c.size)).toEqual([6, null, null, null]);
    expect(four.children.every((c) => c.type === 'drawer_front')).toBe(true);
    expect(setGroupCount(BASE3, 'r', 2).children.map((c) => c.size)).toEqual([6, null]);
    expect(setGroupCount(BASE3, 'r', 1)).toEqual({ type: 'drawer_front', size: null });
  });

  it('14: removeFace', () => {
    expect(removeFace(TWO, 'r.1')).toEqual({ type: 'drawer_front', size: null });
    expect(removeFace(NESTED, 'r.0.1')).toEqual(TWO);
    expect(removeFace(TWO, 'r')).toBe(TWO);
  });

  it('15: setFaceType and setFaceSize', () => {
    expect(setFaceType(TWO, 'r.1', 'pair_door').children[1].type).toBe('pair_door');
    expect(setFaceType(TWO, 'r', 'door')).toBe(TWO);
    expect(setFaceType(TWO, 'r.1', 'shelf')).toBe(TWO);
    expect(setFaceSize(TWO, 'r.1', 24).children[1].size).toBe(24);
    expect(setFaceSize(TWO, 'r.0', null).children[0].size).toBeNull();
    expect(setFaceSize(TWO, 'r', 4)).toBe(TWO);
    expect(setFaceSize(TWO, 'r.0', 0)).toBe(TWO);
  });

  it('16: equalizeGroup makes every child auto', () => {
    expect(equalizeGroup(BASE3, 'r').children.map((c) => c.size)).toEqual([null, null, null]);
  });

  it('17: outline and lookups', () => {
    const rows = faceOutline(NESTED);
    expect(rows.map((row) => row.path)).toEqual(['r', 'r.0', 'r.0.0', 'r.0.1', 'r.1']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 1]);
    expect(getFaceNode(NESTED, 'r.0.1')).toEqual({ type: 'drawer_front', size: null });
    expect(getFaceNode(TWO, 'r.5')).toBeNull();
    expect(parentFacePath('r.0.1')).toBe('r.0');
    expect(parentFacePath('r')).toBeNull();
  });
});
