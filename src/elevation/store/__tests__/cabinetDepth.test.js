import { describe, expect, it } from 'vitest';
import { gridLeaves } from '../../model/grid.js';
import elevationReducer, { setCellDepth } from '../elevationSlice.js';
import { auto, currentRun, fixed, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { wallId: 'wall-1', runId: 'run-1' };

describe('SPEC-46.3.1 depth on a cabinet that was never split', () => {
  it('sets depth and line-up on a whole-column cabinet, never deeper than the run', () => {
    const state = stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] }));
    const set = elevationReducer(state, setCellDepth({ ...at, cellId: 'a', depth: 21, align: 'back' }));
    expect(gridLeaves(currentRun(set).grid)).toEqual([
      { id: 'a', kind: 'cabinet', depth: 21, align: 'back' },
      { id: 'b', kind: 'cabinet' },
    ]);
    expect(elevationReducer(state, setCellDepth({ ...at, cellId: 'a', depth: 30 }))).toBe(state);
    const cleared = elevationReducer(set, setCellDepth({ ...at, cellId: 'a', depth: null, align: 'face' }));
    expect(gridLeaves(currentRun(cleared).grid)[0]).toEqual({ id: 'a', kind: 'cabinet' });
  });
});
