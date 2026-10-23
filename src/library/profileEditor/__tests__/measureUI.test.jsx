import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { measureReducer } from '../../../elevation/canvas/measureState.js';
import MeasureReadout from '../../../elevation/components/MeasureReadout.jsx';
import MeasureSvg from '../../../elevation/components/MeasureSvg.jsx';
import ProfileCanvas from '../ProfileCanvas.jsx';
import ProfileEditor from '../ProfileEditor.jsx';
import { toScreen } from '../profileView.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(), useReducer: vi.fn(), useEffect: vi.fn(), useImperativeHandle: vi.fn(),
  useCallback: (callback) => callback, useRef: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
// Measure state is real (reducer + snapping); only the React hook around it is replaced.
let measureState;
vi.mock('../../../elevation/canvas/measureState.js', async (original) => {
  const real = await original();
  const { snapMeasure } = await import('../../../elevation/model/measure.js');
  return {
    ...real,
    useMeasure: ({ geometry, tolerance }) => {
      const act = (type) => (world, shift) => {
        measureState = real.measureReducer(measureState, { type, pick: snapMeasure(world, geometry, tolerance, { pointOnly: shift }) });
      };
      return { ...measureState, preview: real.measurePreview(measureState), move: act('hover'), click: act('click'),
        leave: () => {}, escape: () => {
          if (!measureState.first && measureState.measures.length === 0) return false;
          measureState = real.measureReducer(measureState, { type: 'escape' });
          return true;
        }, cancelFirst: () => { measureState = real.measureReducer(measureState, { type: 'cancelFirst' }); } };
    },
  };
});

const ruler = {
  id: 'ruler', name: 'Ruler', kind: 'base_cutout', version: 1, archived: false, drawnPoints: { elevation: [] },
  geometry: { units: 'in', points: { a: [0, 0], b: [1, 0] },
    loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] },
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const size = { width: 800, height: 600 };
const view = { cx: 0.5, cy: 0, scale: 100 };
let setTool;
let canvasHandle;
let handler;

function renderEditor(tool) {
  useState.mockImplementation((initial) => {
    if (initial === 'select') return [tool, setTool];
    return [typeof initial === 'function' ? initial() : initial, vi.fn()];
  });
  useReducer.mockReturnValueOnce([{ draft: ruler, past: [], future: [] }, vi.fn()]);
  useEffect.mockClear();
  const tree = ProfileEditor({ profileId: 'ruler', backLabel: 'Back', onClose: vi.fn() });
  const effect = useEffect.mock.calls.find(([, deps]) => deps?.length === 7)[0];
  effect();
  return tree;
}
const press = (key) => {
  const event = { key, target: {}, preventDefault: vi.fn(), ctrlKey: false, metaKey: false, altKey: false };
  handler(event);
  return event;
};

function renderCanvas(onSelect = vi.fn(), onApply = vi.fn()) {
  useState.mockReset();
  useState.mockReturnValueOnce([size, vi.fn()]).mockReturnValueOnce([view, vi.fn()])
    .mockReturnValueOnce([null, vi.fn()]).mockReturnValueOnce([null, vi.fn()])
    .mockImplementation((initial) => [initial, vi.fn()]);
  const refs = [{ current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }, { current: null }, { current: null }];
  useRef.mockImplementation(() => refs.shift() ?? { current: null });
  return ProfileCanvas.render({ profile: ruler, ghost: null, grid: 1 / 16, selection: null, onSelect, fitSignal: 0,
    tool: 'measure', onApply, onMessage: vi.fn() }, null);
}
const pointer = (xy, target = { closest: () => null }) => {
  const [clientX, clientY] = toScreen(view, size, xy);
  return { button: 0, pointerId: 1, clientX, clientY, shiftKey: false, preventDefault: vi.fn(), target,
    currentTarget: { setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn() } };
};
const svgOf = (tree) => nodes(tree).find(({ type }) => type === 'svg');
function click(tree, xy, target) {
  const svg = svgOf(tree).props;
  svg.onPointerDown(pointer(xy, target));
  svg.onPointerUp(pointer(xy, target));
}

beforeEach(() => {
  vi.clearAllMocks();
  measureState = measureReducer(undefined, { type: 'init' });
  setTool = vi.fn();
  vi.stubGlobal('window', { addEventListener: (_, listener) => { handler = listener; }, removeEventListener: vi.fn() });
  useSelector.mockImplementation((selector) => selector({ elevation: { settings: {
    defaultProfile: { toeKickHeight: 4 }, sectionProfiles: [ruler] } } }));
  useDispatch.mockReturnValue(vi.fn());
  useReducer.mockImplementation((reducer, initial, init) => [init(initial), vi.fn()]);
  canvasHandle = { current: null };
  useRef.mockImplementation(() => canvasHandle);
});
afterEach(() => vi.unstubAllGlobals());

describe('MS6 measure in the profile editor', () => {
  it('anchor 1: D switches to measure and back to select, with a pressed Measure (D) button', () => {
    const tree = renderEditor('select');
    press('d');
    expect(setTool).toHaveBeenLastCalledWith('measure');
    const pressed = (tool) => nodes(renderEditor(tool)).find(({ type, props }) => type === 'button' && props.children === 'Measure (D)').props['aria-pressed'];
    expect(pressed('select')).toBe(false);
    expect(pressed('measure')).toBe(true);
    expect(nodes(tree).some(({ type, props }) => type === 'button' && props.children === 'Measure (D)')).toBe(true);
    renderEditor('measure');
    press('d');
    expect(setTool).toHaveBeenLastCalledWith('select');
  });

  it('anchor 2: Esc with nothing picked goes to select; a canvas that cleared something keeps the tool', () => {
    renderEditor('measure');
    canvasHandle.current = { measureEscape: () => true };
    setTool.mockClear();
    press('Escape');
    expect(setTool).not.toHaveBeenCalled();
    canvasHandle.current = { measureEscape: () => false };
    press('Escape');
    expect(setTool).toHaveBeenLastCalledWith('select');
  });

  it('anchor 3: two clicks on profile points 1" apart read Distance 1"', () => {
    const tree = renderCanvas();
    click(tree, [0, 0]);
    click(tree, [1, 0]);
    const readout = nodes(renderCanvas()).find(({ type }) => type === MeasureReadout);
    expect(text(MeasureReadout(readout.props))).toContain('Distance 1"');
    expect(readout.props.axisLabels).toEqual({ x: 'X', y: 'Y' });
    expect(readout.props.className).toBe('bottom-10 left-2');
    expect(nodes(renderCanvas()).some(({ type }) => type === MeasureSvg)).toBe(true);
  });

  it('anchor 4: a measure click on a point neither selects nor changes the profile', () => {
    const onSelect = vi.fn();
    const onApply = vi.fn();
    const tree = renderCanvas(onSelect, onApply);
    click(tree, [0, 0], { closest: () => ({ dataset: { pointId: 'a' } }) });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(measureState.first.kind).toBe('corner');
  });

  it('right-click drops a pending first pick', () => {
    const tree = renderCanvas();
    click(tree, [0, 0]);
    const event = { preventDefault: vi.fn() };
    svgOf(tree).props.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(measureState.first).toBeNull();
  });
});
