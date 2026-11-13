import { describe, expect, it } from 'vitest';
import { faceOutline } from '../faceTree.js';
import { interiorOutline } from '../interiorTree.js';
import { treeLeaves, treeRows } from '../treeWalk.js';

const F = {
  direction: 'vertical',
  children: [
    { type: 'drawer_front' },
    { direction: 'horizontal', children: [{ type: 'door' }, { type: 'door' }] },
  ],
};

describe('shared tree walkers', () => {
  it('visits rows in pre-order with paths, depths and the original nodes', () => {
    const rows = treeRows(F);
    expect(rows.map(({ path, depth }) => [path, depth])).toEqual([
      ['r', 0], ['r.0', 1], ['r.1', 1], ['r.1.0', 2], ['r.1.1', 2],
    ]);
    expect(rows[0].node).toBe(F);
    expect(rows[3].node).toBe(F.children[1].children[0]);
  });

  it('returns only leaf rows in the same order and shape', () => {
    const leaves = treeLeaves(F);
    expect(leaves).toEqual([
      { node: F.children[0], path: 'r.0', depth: 1 },
      { node: F.children[1].children[0], path: 'r.1.0', depth: 2 },
      { node: F.children[1].children[1], path: 'r.1.1', depth: 2 },
    ]);
    expect(leaves[1].node).toBe(F.children[1].children[0]);
  });

  it('handles a leaf root and absent roots', () => {
    const node = { type: 'door' };
    expect(treeLeaves(node)).toEqual([{ node, path: 'r', depth: 0 }]);
    expect(treeLeaves(node)[0].node).toBe(node);
    expect(treeRows(null)).toEqual([]);
    expect(treeRows(undefined)).toEqual([]);
    expect(treeLeaves(null)).toEqual([]);
    expect(treeLeaves(undefined)).toEqual([]);
  });

  it('identifies groups by children arrays, including empty arrays', () => {
    const empty = { type: 'door', children: [] };
    expect(treeRows(empty)).toEqual([{ node: empty, path: 'r', depth: 0 }]);
    expect(treeLeaves(empty)).toEqual([]);
    for (const children of [undefined, null, {}]) {
      const node = { children };
      expect(treeLeaves(node)).toEqual([{ node, path: 'r', depth: 0 }]);
    }
  });

  it('preserves both outline exports and the absent interior root', () => {
    expect(faceOutline(F)).toEqual(treeRows(F));
    expect(interiorOutline(F)).toEqual(treeRows(F));
    expect(faceOutline(F)[3].node).toBe(F.children[1].children[0]);
    expect(interiorOutline(F)[3].node).toBe(F.children[1].children[0]);
    expect(interiorOutline(undefined)).toEqual([{ path: 'r', depth: 0, node: {} }]);
  });
});
