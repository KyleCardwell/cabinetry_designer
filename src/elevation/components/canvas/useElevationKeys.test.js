import { expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import elevationReducer, { setFacePath, setInteriorPath, setSelection } from '../../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import useElevationKeys from './useElevationKeys.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: vi.fn() }));

it('anchor 5: Escape clears the face, then interior selection, then the cabinet selection', () => {
  let state = elevationReducer(stateWithRun(run({ items: [auto('c1')] })),
    setSelection({ runId: 'run-1', pieceId: 'c1' }));
  state = elevationReducer(state, setInteriorPath({ path: 'r.1', divider: 0 }));
  state = elevationReducer(state, setFacePath('r.0'));
  const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  const listeners = new Map();
  const addEventListener = vi.fn((type, fn) => listeners.set(type, fn));
  const removeEventListener = vi.fn((type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); });
  vi.stubGlobal('window', { addEventListener, removeEventListener });
  vi.stubGlobal('document', { querySelector: () => null });
  let cleanup;
  useEffect.mockImplementation((effect) => { cleanup = effect(); });
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  const TestKeys = () => useElevationKeys({
    cursor: { releaseHold: vi.fn() }, dispatch, dragRef: { current: null }, facePath: state.facePath,
    selectionRef: { current: state.selection }, wallRef: { current: null },
    setAlignmentGuides: vi.fn(), tool: 'select',
  });
  const escape = () => {
    TestKeys();
    listeners.get('keydown')({ key: 'Escape', target: { tagName: 'DIV' } });
    cleanup();
  };
  try {
    escape();
    expect(dispatch).toHaveBeenLastCalledWith(setFacePath(null));
    expect(state).toMatchObject({ facePath: null, interiorPath: 'r.1', interiorDivider: 0 });
    escape();
    expect(dispatch).toHaveBeenLastCalledWith(setInteriorPath(null));
    expect(state).toMatchObject({ interiorPath: null, interiorDivider: null });
    expect(state.selection).toMatchObject({ runId: 'run-1', pieceId: 'c1' });
    escape();
    expect(dispatch).toHaveBeenLastCalledWith(setSelection({}));
    expect(state.selection).toMatchObject({ runId: null, pieceId: null });
    expect(listeners.size).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});
