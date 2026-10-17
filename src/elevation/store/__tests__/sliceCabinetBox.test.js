import { describe, expect, it } from 'vitest';
import elevationReducer, { setCabinetBox } from '../elevationSlice.js';
import { gridFromItems, gridLeaves } from '../../model/grid.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

describe('IN1b cabinet box overrides', () => {
  // roomId is optional; the public action locates the active room by default.
  const at = { wallId: 'wall-1', runId: 'run-1' };
  const base = () => {
    const state = stateWithRun(run({ autoCount: false, items: [
      { ...auto('c1'), purpose: 'sink' }, auto('c2'), { id: 'p1', kind: 'panel', width: 1 },
    ] }));
    currentRun(state).grid.cells[1].node = gridFromItems('nested', [auto('c2'), auto('c3')]);
    return state;
  };
  const leaves = (state) => gridLeaves(currentRun(state).grid);

  it('sets root and nested cabinets and deletes the last override when cleared (anchors 1–2)', () => {
    const state = elevationReducer(base(), setCabinetBox({ ...at, itemIds: ['c1', 'c2', 'p1'], key: 'back', value: 'inset' }));
    expect(leaves(state).map(({ id, box }) => [id, box]))
      .toEqual([['c1', { back: 'inset' }], ['c2', { back: 'inset' }], ['c3', undefined], ['p1', undefined]]);
    expect(leaves(state)[0].purpose).toBe('sink');
    const cleared = elevationReducer(state, setCabinetBox({ ...at, itemIds: ['c2'], key: 'back', value: null }));
    expect(leaves(cleared)[1]).not.toHaveProperty('box');
    expect(leaves(cleared)[0].box).toEqual({ back: 'inset' });
  });

  it('stores manual standard values and dormant finishes, preserving other overrides on clear', () => {
    let state = base();
    const overrides = { back: 'dado', top: 'spreaders', bottom: 'none', left: true, right: false, finTop: true, finBottom: false };
    for (const [key, value] of Object.entries(overrides)) {
      state = elevationReducer(state, setCabinetBox({ ...at, itemIds: ['c1'], key, value }));
    }
    expect(leaves(state)[0].box).toEqual(overrides);
    state = elevationReducer(state, setCabinetBox({ ...at, itemIds: ['c1'], key: 'top', value: null }));
    expect(leaves(state)[0].box).toEqual({ back: 'dado', bottom: 'none', left: true, right: false, finTop: true, finBottom: false });
    expect(leaves(state)[0].purpose).toBe('sink');
  });

  it('ignores invalid values and targets and respects room locks (anchor 3)', () => {
    const state = base();
    const payload = { ...at, itemIds: ['c1'], key: 'back', value: 'inset' };
    for (const patch of [
      { key: 'top', value: 'dado' }, { key: 'left', value: 'no' },
      { key: 'back', value: true }, { key: 'bottom', value: 'inset' },
      { key: 'right', value: 0 }, { key: 'finTop', value: 'true' },
      { key: 'finBottom', value: 1 }, { value: undefined },
      { key: 'unknown' }, { key: '__proto__', value: null }, { key: undefined },
      { runId: 'missing' }, { wallId: 'missing' }, { itemIds: ['missing', 'p1'] }, { itemIds: undefined },
    ]) {
      expect(elevationReducer(state, setCabinetBox({ ...payload, ...patch }))).toBe(state);
    }
    for (const locked of [{ ...state, cloud: { room: { readOnly: true } } }, { ...state, source: 'version' }]) {
      expect(elevationReducer(locked, setCabinetBox(payload))).toBe(locked);
    }
  });
});
