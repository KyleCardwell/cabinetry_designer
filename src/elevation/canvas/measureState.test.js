import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useReducer } from 'react';
import { measureGeometry, snapMeasure } from '../model/measure.js';
import { measurePreview, measureReducer, useMeasure } from './measureState.js';

vi.mock('react', async (original) => ({
  ...await original(), useReducer: vi.fn(), useEffect: vi.fn(), useCallback: (callback) => callback,
}));

const geometry = measureGeometry([
  { kind: 'rect', x: 0, y: 0, width: 30, height: 34.5 },
  { kind: 'rect', x: 30, y: 0, width: 18, height: 34.5 },
]);
const pick = (x, y, pointOnly = false) => snapMeasure({ x, y }, geometry, 0.5, { pointOnly });
const click = (state, x, y, pointOnly) => measureReducer(state, { type: 'click', pick: pick(x, y, pointOnly) });
const initial = () => measureReducer(undefined, { type: 'reset' });

describe('MS2a measure reducer', () => {
  it('anchor 4: stores a snapped diagonal and clears the first pick without mutating old state', () => {
    const first = click(initial(), 0.1, 0.1);
    const state = click(first, 48, 34.4);
    expect(first).toEqual({ first: pick(0, 0), hover: null, measures: [] });
    expect(state.first).toBeNull();
    expect(state.measures).toHaveLength(1);
    expect(state.measures[0]).toMatchObject({
      a: pick(0, 0), b: pick(48, 34.5), result: { kind: 'points' },
    });
    expect(state.measures[0].result.distance).toBeCloseTo(59.1122, 4);
  });

  it('anchor 5: ignores the same corner, including free and on-edge point picks, but keeps zero line measures', () => {
    const first = click(initial(), 0.1, 0.1);
    expect(click(first, 0.2, 0)).toBe(first);
    expect(first.first.point).toEqual({ x: 0, y: 0 });
    expect(first.measures).toEqual([]);
    for (const kind of ['free', 'on-edge']) {
      const state = { ...initial(), first: { kind, point: { x: 8, y: 0 } } };
      const near = { kind, point: { x: 8 + 1e-7, y: 0 } };
      expect(measureReducer(state, { type: 'click', pick: near })).toBe(state);
    }
    const line = click(initial(), 8, 0.2);
    const state = click(line, 8, 0.2);
    expect(state.measures[0].result).toMatchObject({ kind: 'lines', distance: 0 });
    expect(state.first).toBeNull();
  });

  it('anchor 6: previews the hover pick only while both picks exist', () => {
    expect(measurePreview(initial())).toBeNull();
    const first = click(initial(), 0.1, 0.1);
    expect(measurePreview(first)).toBeNull();
    const state = measureReducer(first, { type: 'hover', pick: pick(30.1, 0.2) });
    expect(measurePreview(state)).toMatchObject({ kind: 'points', distance: 30 });
    expect(state.measures).toEqual([]);
  });

  it('clears only the first pick on cancel or the first Escape, then clears measures, and fully resets', () => {
    let state = click(click(initial(), 0.1, 0.1), 48, 34.4);
    state = click(click(state, 0.1, 0.1), 30.1, 0.2);
    state = click(state, 15, 0.2);
    state = measureReducer(state, { type: 'hover', pick: pick(48, 34.4) });
    const cancelled = measureReducer(state, { type: 'cancelFirst' });
    expect(cancelled).toMatchObject({ first: null, hover: state.hover, measures: state.measures });
    expect(cancelled.measures).toHaveLength(2);
    expect(measureReducer(state, { type: 'escape' })).toEqual(cancelled);
    expect(measureReducer(cancelled, { type: 'escape' })).toEqual({ ...cancelled, measures: [] });
    expect(measureReducer(state, { type: 'reset' })).toEqual(initial());
  });
});

// Exercise the hook's reducer and effect lifecycles without a canvas or DOM.
let stored, dependencies, pending, dirty;
beforeEach(() => {
  stored = undefined;
  dependencies = undefined;
  pending = [];
  useReducer.mockImplementation((reducer, value, init) => {
    if (stored === undefined) stored = init(value);
    return [stored, (action) => {
      const next = reducer(stored, action);
      if (next !== stored) dirty = true;
      stored = next;
    }];
  });
  useEffect.mockImplementation((effect, deps) => {
    if (!dependencies || deps.some((value, index) => !Object.is(value, dependencies[index]))) {
      dependencies = deps;
      pending.push(effect);
    }
  });
});

function renderMeasure() {
  let props = { active: true, geometry, tolerance: 0.5, resetKey: 'room:wall' };
  let result;
  function Measure() {
    result = useMeasure(props);
  }
  function render(next = {}) {
    props = { ...props, ...next };
    do {
      dirty = false;
      pending = [];
      Measure();
      pending.forEach((effect) => effect());
    } while (dirty);
  }
  render();
  return {
    get result() { return result; },
    render,
    act(method, ...args) {
      const value = result[method](...args);
      render();
      return value;
    },
  };
}

describe('MS2a useMeasure', () => {
  it('anchor 7: Escape clears a first pick, then two measurements, then returns false', () => {
    const hook = renderMeasure();
    for (let i = 0; i < 2; i += 1) {
      hook.act('click', { x: 0.1, y: 0.1 });
      hook.act('click', { x: 48, y: 34.4 });
    }
    hook.act('click', { x: 0.1, y: 0.1 });
    expect(hook.act('escape')).toBe(true);
    expect(hook.result.first).toBeNull();
    expect(hook.result.measures).toHaveLength(2);
    expect(hook.act('escape')).toBe(true);
    expect(hook.result.measures).toEqual([]);
    expect(hook.act('escape')).toBe(false);
  });

  it('snaps moves and clicks with Shift, leaves hover, and cancels only the first pick', () => {
    const hook = renderMeasure();
    hook.act('click', { x: 0.1, y: 0.1 });
    hook.act('move', { x: 30.1, y: 0.2 });
    expect(hook.result.preview.distance).toBe(30);
    hook.act('click', { x: 48, y: 34.4 });
    expect(hook.result.measures[0].result.distance).toBeCloseTo(59.1122, 4);
    hook.act('move', { x: 8, y: 0.2 });
    expect(hook.result.hover.kind).toBe('edge');
    hook.act('move', { x: 8, y: 0.2 }, true);
    expect(hook.result.hover).toEqual(pick(8, 0.2, true));
    hook.act('click', { x: 8, y: 0.2 }, true);
    expect(hook.result.first.kind).toBe('on-edge');
    hook.act('leave');
    expect(hook.result.hover).toBeNull();
    expect(hook.result.preview).toBeNull();
    expect(hook.result.first.kind).toBe('on-edge');
    hook.act('cancelFirst');
    expect(hook.result.first).toBeNull();
    expect(hook.result.measures).toHaveLength(1);
  });

  it('resets all state on resetKey changes or deactivation and ignores inactive pointer events', () => {
    const hook = renderMeasure();
    hook.act('click', { x: 0.1, y: 0.1 });
    hook.act('click', { x: 48, y: 34.4 });
    hook.act('click', { x: 15, y: 0 });
    hook.act('move', { x: 30.1, y: 0.2 });
    hook.render({ resetKey: 'room:other-wall' });
    expect(hook.result).toMatchObject({ ...initial(), preview: null });
    hook.act('click', { x: 0.1, y: 0.1 });
    hook.act('click', { x: 48, y: 34.4 });
    hook.act('click', { x: 15, y: 0 });
    hook.act('move', { x: 30.1, y: 0.2 });
    hook.render({ active: false });
    expect(hook.result).toMatchObject({ ...initial(), preview: null });
    hook.act('click', { x: 0.1, y: 0.1 });
    hook.act('move', { x: 30.1, y: 0.2 });
    expect(hook.result).toMatchObject({ ...initial(), preview: null });
    hook.render({ active: true, geometry: null });
    hook.act('click', { x: 0.1, y: 0.1 });
    expect(hook.result.first).toEqual({ kind: 'free', point: { x: 0.1, y: 0.1 } });
  });
});
