import { describe, expect, it } from 'vitest';
import elevationReducer, { setItemInterior } from '../elevationSlice.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

describe('IN2 setItemInterior', () => {
  const at = { wallId: 'wall-1', runId: 'run-1' };
  const tree = () => ({
    direction: 'horizontal',
    children: [{ direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed', at: 36 }] }, {}],
    dividers: [{ kind: 'double_partition', at: 12, from: 'right', depth: 10 }],
  });
  const base = () => {
    const state = stateWithRun(run({ autoCount: false, items: [
      { ...auto('c1'), purpose: 'sink', box: { back: 'inset' }, face: { type: 'door', size: null } },
      auto('c2'), { id: 'p1', kind: 'panel', width: 1 }, { id: 'f1', kind: 'filler', width: 3 },
    ] }));
    currentRun(state).grid.cells[1].node = gridFromItems('nested', [auto('c2'), auto('c3')]);
    return state;
  };
  const leaves = (state) => gridLeaves(currentRun(state).grid);

  it('clones the tree independently onto matching root and nested cabinet leaves', () => {
    const before = base();
    const interior = tree();
    const state = elevationReducer(before, setItemInterior({ ...at, itemIds: ['c1', 'c2', 'p1', 'f1'], interior }));
    expect(leaves(state).map(({ id, interior: value }) => [id, value]))
      .toEqual([['c1', interior], ['c2', interior], ['c3', undefined], ['p1', undefined], ['f1', undefined]]);
    const [first, second] = leaves(state);
    expect(first.interior).not.toBe(interior);
    expect(first.interior.children[0].dividers[0]).not.toBe(interior.children[0].dividers[0]);
    expect(first.interior.children[0].dividers[0]).not.toBe(second.interior.children[0].dividers[0]);
    expect({ face: first.face, box: first.box, purpose: first.purpose })
      .toEqual({ face: leaves(before)[0].face, box: { back: 'inset' }, purpose: 'sink' });
    expect(leaves(before)[0]).not.toHaveProperty('interior');
    interior.children[0].dividers[0].at = 42;
    expect(first.interior.children[0].dividers[0].at).toBe(36);
  });

  it('deletes the key for {} or null and ignores an invalid tree with identical state (anchor 4)', () => {
    const before = elevationReducer(base(), setItemInterior({ ...at, itemIds: ['c1', 'c2'], interior: tree() }));
    for (const interior of [{}, null]) {
      const cleared = elevationReducer(before, setItemInterior({ ...at, itemIds: ['c1'], interior }));
      expect(leaves(cleared)[0]).not.toHaveProperty('interior');
      expect(leaves(cleared)[1].interior).toEqual(tree());
      for (const invalid of [undefined, [], { direction: 'vertical', children: [{}, {}], dividers: [] }]) {
        expect(elevationReducer(cleared, setItemInterior({ ...at, itemIds: ['c1'], interior: invalid }))).toBe(cleared);
      }
    }
  });

  it('ignores missing and non-cabinet targets and respects room locks', () => {
    const state = base();
    const payload = { ...at, itemIds: ['c1'], interior: tree() };
    for (const patch of [
      { runId: 'missing' }, { wallId: 'missing' }, { roomId: 'missing' },
      { itemIds: ['p1', 'f1', 'missing'] }, { itemIds: [] }, { itemIds: undefined },
    ]) expect(elevationReducer(state, setItemInterior({ ...payload, ...patch }))).toBe(state);
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setItemInterior(payload))).toBe(locked);
    }
  });
});
