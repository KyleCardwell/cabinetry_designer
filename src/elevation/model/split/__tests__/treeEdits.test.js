import { describe, expect, it } from 'vitest';
import {
  nodeAt, replaceAt, splitChild, removeChild, setChildCount, equalizeChildren, setChildSize,
} from '../treeEdits.js';

const T = {
  root: 'r',
  axisKey: 'dir',
  flatMax: 8,
  seams: (node) => node.seams,
  withSeams: (node, seams) => ({ ...node, seams }),
  newSeam: () => '+',
  join: (before, after) => before + after,
  collapse: (group, child) => child,
  sizeOf: (node) => node.size ?? null,
  withSize: (node, size) => ({ ...node, size }),
  autoChild: (child) => child.size == null ? child : { ...child, size: null },
};
const A = Object.freeze({ id: 'a' });
const B = Object.freeze({ id: 'b', size: 5 });
const C = Object.freeze({ id: 'c' });
const tree = Object.freeze({
  dir: 'cols', children: Object.freeze([A, B, C]), seams: Object.freeze(['x', 'y']),
});
const newChildren = [{ id: 'n0' }, { id: 'n1' }, { id: 'n2' }];
const seam = () => 's';
const group = () => ({ g: 1 });

describe('treeEdits', () => {
  it.each([
    { behavior: 'finds an indexed child', path: 'r.1', expected: B },
    { behavior: 'finds the root', path: 'r', expected: tree },
    { behavior: 'rejects leading zero indexes', path: 'r.01', expected: null },
    { behavior: 'rejects a different root', path: 'bad.0', expected: null },
    { behavior: 'returns null for a missing child', path: 'r.5', expected: null },
    { behavior: 'rejects a null path', path: null, expected: null },
    { behavior: 'returns null for an absent tree', input: undefined, path: 'r', expected: null },
  ])('$behavior (E4)', (test) => {
    expect(nodeAt('input' in test ? test.input : tree, test.path, 'r')).toBe(test.expected);
  });

  it.each([
    {
      behavior: 'replaces a child by copying its path',
      check: () => {
        const Z = { id: 'z' };
        const next = replaceAt(tree, 'r.1', () => Z);
        expect(next.children).toEqual([A, Z, C]);
        expect(next.children[0]).toBe(A);
      },
    },
    {
      behavior: 'inserts children and seams into a same-axis parent',
      check: () => {
        const next = splitChild(tree, 'r.1', T, { axis: 'cols', children: newChildren, seam, group });
        expect(next).toEqual({ dir: 'cols', children: [A, ...newChildren, C], seams: ['x', 's', 's', 'y'] });
      },
    },
    {
      behavior: 'nests children when the split axis differs',
      check: () => {
        const children = newChildren.slice(0, 2);
        const next = splitChild(tree, 'r.1', T, { axis: 'rows', children, seam, group });
        expect(next.children[1]).toEqual({ dir: 'rows', g: 1, children, seams: ['s'] });
        expect(next.seams).toEqual(['x', 'y']);
      },
    },
    {
      behavior: 'limits flat splits to the adapter maximum',
      check: () => {
        const seven = Object.freeze({
          dir: 'cols',
          children: Object.freeze([A, B, C, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }]),
          seams: Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']),
        });
        expect(splitChild(seven, 'r.0', T, { axis: 'cols', children: newChildren, seam, group })).toBe(seven);
      },
    },
    {
      behavior: 'joins or drops adjacent seams when removing a child',
      check: () => {
        expect(removeChild(tree, 'r.1', T)).toEqual({ dir: 'cols', children: [A, C], seams: ['xy'] });
        expect(removeChild(tree, 'r.0', T)).toEqual({ dir: 'cols', children: [B, C], seams: ['y'] });
        expect(removeChild(tree, 'r.2', T)).toEqual({ dir: 'cols', children: [A, B], seams: ['x'] });
      },
    },
    {
      behavior: 'collapses a group after removing one of two children',
      check: () => {
        const pair = Object.freeze({ dir: 'cols', children: Object.freeze([A, B]), seams: Object.freeze(['x']) });
        expect(removeChild(pair, 'r.0', T)).toBe(B);
      },
    },
    {
      behavior: 'pads, truncates, or collapses to the requested child count',
      check: () => {
        const fill = () => ({ id: 'f' });
        expect(setChildCount(tree, 'r', T, 5, fill)).toEqual({
          dir: 'cols', children: [A, B, C, { id: 'f' }, { id: 'f' }], seams: ['x', 'y', '+', '+'],
        });
        expect(setChildCount(tree, 'r', T, 2, fill)).toEqual({ dir: 'cols', children: [A, B], seams: ['x'] });
        expect(setChildCount(tree, 'r', T, 1, fill)).toBe(A);
        expect(setChildCount(tree, 'r', T, 3, fill)).toBe(tree);
      },
    },
    {
      behavior: 'equalizes typed children and returns the same tree when already auto',
      check: () => {
        const next = equalizeChildren(tree, 'r', T);
        expect(next.children).toEqual([A, { id: 'b', size: null }, C]);
        expect(next.children[0]).toBe(A);
        expect(next.children[2]).toBe(C);
        expect(equalizeChildren(next, 'r', T)).toBe(next);
      },
    },
    {
      behavior: 'sets valid child sizes and skips root, invalid, or identical sizes',
      check: () => {
        expect(setChildSize(tree, 'r.1', T, 10).children[1]).toEqual({ id: 'b', size: 10 });
        expect(setChildSize(tree, 'r', T, 10)).toBe(tree);
        expect(setChildSize(tree, 'r.1', T, 0)).toBe(tree);
        expect(setChildSize(tree, 'r.1', T, 5)).toBe(tree);
      },
    },
  ])('$behavior (E4)', ({ check }) => check());
});
