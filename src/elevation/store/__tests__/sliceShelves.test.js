import { describe, expect, it } from 'vitest';
import elevationReducer, { setItemInterior, setItemShelves } from '../elevationSlice.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { wallId: 'wall-1', runId: 'run-1' };
const base = () => {
  const state = stateWithRun(run({ autoCount: false, items: [
    auto('c1'), auto('c2'), { id: 'p1', kind: 'panel', width: 1 }, { id: 'f1', kind: 'filler', width: 3 },
  ] }));
  currentRun(state).grid.cells[1].node = gridFromItems('nested', [auto('c2'), auto('c3')]);
  return state;
};
const leaves = (state) => gridLeaves(currentRun(state).grid);

describe('IN8 cabinet shelf storage', () => {
  it('stores independent root and nested picks, patches and resets them without storing an auto interior', () => {
    const before = base();
    const patch = { glass: false, nosing: 'none' };
    let state = elevationReducer(before, setItemShelves({ ...at, itemIds: ['c1', 'c2', 'p1', 'f1'], patch }));
    expect(leaves(state).map(({ shelves }) => shelves)).toEqual([patch, patch, undefined, undefined, undefined]);
    expect(leaves(state)[0].shelves).not.toBe(leaves(state)[1].shelves);
    expect(leaves(state)[0].shelves).not.toBe(patch);
    expect(leaves(before)[0]).not.toHaveProperty('shelves');
    expect(leaves(state).every((leaf) => !Object.hasOwn(leaf, 'interior'))).toBe(true);
    patch.nosing = 'hardwood';
    expect(leaves(state)[0].shelves.nosing).toBe('none');
    state = elevationReducer(state, setItemShelves({ ...at, itemId: 'c2', patch: { glass: true, nosing: 'folded' } }));
    const interior = { shelves: { count: 0, nosing: 'hardwood' }, hinges: false, lineBore: true };
    state = elevationReducer(state, setItemInterior({ ...at, itemIds: ['c2'], interior }));
    state = elevationReducer(state, setItemShelves({ ...at, itemId: 'c2', patch: { glass: null } }));
    expect(leaves(state)[1]).toMatchObject({ shelves: { nosing: 'folded' }, interior });
    state = elevationReducer(state, setItemShelves({ ...at, itemId: 'c2', patch: { nosing: null } }));
    expect(leaves(state)[1]).not.toHaveProperty('shelves');
    expect(leaves(state)[1].interior).toEqual(interior);
    state = elevationReducer(state, setItemShelves({ ...at, itemId: 'c2', patch: { glass: true } }));
    state = elevationReducer(state, setItemInterior({ ...at, itemIds: ['c2'], interior: null }));
    expect(leaves(state)[1]).not.toHaveProperty('interior');
    expect(leaves(state)[1].shelves).toEqual({ glass: true });
  });

  it('rejects invalid patches and targets and respects room and version locks', () => {
    const state = base();
    const payload = { ...at, itemId: 'c1', patch: { nosing: 'hardwood' } };
    for (const patch of [null, [], undefined, { count: 1 }, { count: null }, { back: false },
      { glass: 1 }, { glass: undefined }, { glass: true, nosing: 'oak' }, { unknown: null }]) {
      expect(elevationReducer(state, setItemShelves({ ...payload, patch }))).toBe(state);
    }
    for (const change of [
      { runId: 'missing' }, { wallId: 'missing' }, { roomId: 'missing' },
      { itemId: 'missing' }, { itemId: 'p1' }, { itemId: 'f1' }, { itemIds: [] }, { itemId: undefined },
    ]) expect(elevationReducer(state, setItemShelves({ ...payload, ...change }))).toBe(state);
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setItemShelves(payload))).toBe(locked);
    }
  });
});
