import { describe, expect, it } from 'vitest';
import elevationReducer, { setColumnStep, splitCell } from '../elevationSlice.js';
import { runItems } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { wallId: 'wall-1', runId: 'run-1' };
const setup = () => stateWithRun(run({ autoCount: false, items: [auto('a'), auto('b')] }));
const edit = (state, itemId, edge, value) => elevationReducer(state, setColumnStep({ ...at, itemId, edge, value }));

describe('ST1 step c column step reducer', () => {
  it('sets and independently clears root cabinet, nested-grid and legacy column offsets', () => {
    for (const kind of ['cabinet', 'nested', 'legacy']) {
      let state = setup();
      if (kind === 'nested') state = elevationReducer(state, splitCell({ ...at, cellId: 'a', direction: 'down', count: 2 }));
      if (kind === 'legacy') {
        currentRun(state).items = runItems(currentRun(state));
        delete currentRun(state).grid;
      }
      const id = runItems(currentRun(state))[0].id;
      state = edit(state, id, 'top', 3.5);
      state = edit(state, id, 'bottom', 2);
      expect(runItems(currentRun(state))[0]).toMatchObject({
        top: { value: 3.5, source: 'manual' }, bottom: { value: 2, source: 'manual' },
      });
      if (kind !== 'legacy') {
        expect(currentRun(state).grid.cols[0].top).toEqual({ value: 3.5, source: 'manual' });
        expect(currentRun(state).grid.cells[0].node).not.toHaveProperty('top');
      }
      expect(runItems(currentRun(state))[1]).not.toHaveProperty('top');
      state = edit(state, id, 'top', null);
      expect(runItems(currentRun(state))[0]).not.toHaveProperty('top');
      expect(runItems(currentRun(state))[0].bottom.value).toBe(2);
      state = edit(state, id, 'bottom', 0);
      expect(runItems(currentRun(state))[0]).not.toHaveProperty('bottom');
    }
  });

  it('ignores invalid values, edges, locations, non-cabinet columns and nested leaf ids', () => {
    let state = edit(setup(), 'a', 'top', 3);
    for (const value of [-1, Infinity, -Infinity, NaN, '2', false, undefined, {}]) {
      expect(edit(state, 'a', 'top', value)).toBe(state);
    }
    for (const patch of [{ edge: 'left' }, { itemId: 'missing' }, { runId: 'missing' }, { wallId: 'missing' }]) {
      expect(elevationReducer(state, setColumnStep({ ...at, itemId: 'a', edge: 'top', value: 2, ...patch }))).toBe(state);
    }
    for (const kind of ['filler', 'void', 'shelves', 'panel']) {
      const other = stateWithRun(run({ autoCount: false, items: [{ id: 'other', kind, width: 20 }] }));
      expect(edit(other, 'other', 'top', 2)).toBe(other);
    }
    state = elevationReducer(state, splitCell({ ...at, cellId: 'a', direction: 'down', count: 2 }));
    expect(edit(state, 'a', 'top', 2)).toBe(state);
  });
});
