import { describe, expect, it } from 'vitest';
import elevationReducer, { setCabinetPurpose } from '../elevationSlice.js';
import { gridLeaves } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

describe('IN1a cabinet purpose', () => {
  const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const base = () => {
    const state = stateWithRun(run({ autoCount: false, items: [auto('c1'), auto('c2'), { id: 'p1', kind: 'panel', width: 1 }] }));
    currentRun(state).grid.cells[1].node = {
      id: 'nested', cols: [{ id: 'nested-col', size: null, sizeMode: 'auto' }],
      rows: [
        { id: 'top-row', size: null, sizeMode: 'auto' },
        { id: 'bottom-row', size: null, sizeMode: 'auto' },
      ],
      cells: [
        { id: 'top', col: 0, row: 0, colSpan: 1, rowSpan: 1, node: auto('c2') },
        { id: 'bottom', col: 0, row: 1, colSpan: 1, rowSpan: 1, node: auto('c3') },
      ],
    };
    return state;
  };
  const leaves = (state) => gridLeaves(currentRun(state).grid);

  it('sets and clears root and nested cabinets, leaving other cells alone', () => {
    const state = elevationReducer(base(), setCabinetPurpose({ ...at, itemIds: ['c1', 'c2', 'p1'], purpose: 'sink' }));
    expect(leaves(state).map(({ id, purpose }) => [id, purpose]))
      .toEqual([['c1', 'sink'], ['c2', 'sink'], ['c3', undefined], ['p1', undefined]]);
    const cleared = elevationReducer(state, setCabinetPurpose({ ...at, itemIds: ['c2'], purpose: null }));
    expect(leaves(cleared).find(({ id }) => id === 'c2')).not.toHaveProperty('purpose');
    expect(leaves(cleared)[0].purpose).toBe('sink');
  });

  it('ignores unknown purposes and targets and respects room locks', () => {
    const state = base();
    const payload = { ...at, itemIds: ['c1'], purpose: 'trash' };
    for (const purpose of [undefined, '', 'garage', 3]) {
      expect(elevationReducer(state, setCabinetPurpose({ ...payload, purpose }))).toBe(state);
    }
    for (const patch of [{ runId: 'missing' }, { itemIds: ['p1'] }, { itemIds: undefined }]) {
      expect(elevationReducer(state, setCabinetPurpose({ ...payload, ...patch }))).toBe(state);
    }
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setCabinetPurpose(payload))).toBe(locked);
    }
  });

});
