import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import elevationReducer, { createInitialElevationState, setFacePath, setInteriorPath, setSelection, setTool } from '../../store/elevationSlice.js';
import { auto, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import useElevationKeys from './useElevationKeys.js';
import usePlanKeys from '../../plan/usePlanKeys.js';

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

describe.each(['elevation', 'plan'])('MS2a %s keys', (view) => {
  const useKeys = view === 'elevation' ? useElevationKeys : usePlanKeys;
  let state, dispatch, listener, cleanup, props;
  function TestKeys() {
    cleanup?.();
    const args = { ...props, tool: state.tool, dispatch, selection: state.selection };
    useKeys(args);
  }
  const key = (value, extra = {}) => {
    const event = { key: value, target: { tagName: 'DIV' }, preventDefault: vi.fn(), ...extra };
    listener(event);
    TestKeys();
    return event;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup = undefined;
    state = createInitialElevationState(null);
    dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
    props = {
      cursor: { releaseHold: vi.fn() }, dragRef: { current: null },
      drawStartRef: { current: null }, setAlignmentGuides: vi.fn(),
      setPendingDeleteWallId: vi.fn(), cancelEntry: vi.fn(),
    };
    useSelector.mockImplementation((selector) => selector({ elevation: state }));
    useEffect.mockImplementation((effect) => { cleanup = effect(); });
    vi.stubGlobal('window', {
      addEventListener: (_, callback) => { listener = callback; }, removeEventListener: vi.fn(),
    });
    vi.stubGlobal('document', { querySelector: () => null });
    TestKeys();
  });
  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
  });

  it('anchors 2–3: toggles Measure with D and respects entry, inputs, modifiers and repeat guards', () => {
    expect(key('d').preventDefault).toHaveBeenCalledOnce();
    expect(state.tool).toBe('measure');
    key('D');
    expect(state.tool).toBe('select');
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true },
      ...['INPUT', 'SELECT', 'TEXTAREA'].map((tagName) => ({ target: { tagName } }))]) {
      expect(key('d', extra).preventDefault).not.toHaveBeenCalled();
      expect(state.tool).toBe('select');
    }
    props.entry = { kind: 'run-move' };
    TestKeys();
    key('d');
    expect(state.tool).toBe('select');
    props.entry = null;
    state = elevationReducer(state, setTool(view === 'plan' ? 'wall' : 'draw'));
    TestKeys();
    key('d');
    expect(state.tool).toBe('measure');
  });

  it('anchors 8–9: lets Measure consume Escape, then returns to Select when nothing is cleared', () => {
    key('d');
    props.onMeasureEscape = vi.fn(() => true);
    TestKeys();
    dispatch.mockClear();
    expect(key('Escape').preventDefault).toHaveBeenCalledOnce();
    expect(props.onMeasureEscape).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(state.tool).toBe('measure');
    props.onMeasureEscape.mockReturnValue(false);
    key('Escape');
    expect(state.tool).toBe('select');
    key('Escape');
    expect(props.onMeasureEscape).toHaveBeenCalledTimes(2);
    key('d');
    delete props.onMeasureEscape;
    TestKeys();
    key('Escape');
    expect(state.tool).toBe('select');
  });

  it('cancels a live entry before offering Escape to Measure', () => {
    key('d');
    props.entry = { kind: 'run-move' };
    props.onMeasureEscape = vi.fn(() => true);
    TestKeys();
    key('Escape');
    expect(props.cancelEntry).toHaveBeenCalledOnce();
    expect(props.onMeasureEscape).not.toHaveBeenCalled();
    expect(state.tool).toBe('measure');
  });
});
