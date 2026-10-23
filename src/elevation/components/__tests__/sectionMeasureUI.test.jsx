import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { measureReducer } from '../../canvas/measureState.js';
import MeasureReadout from '../MeasureReadout.jsx';
import MeasureSvg from '../MeasureSvg.jsx';
import SectionSvg, { SectionMeasure } from '../SectionSvg.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useId: () => 'section-measure', useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn(),
}));
// Measure state is real (reducer + snapping); only the React hook around it is replaced.
let measureState;
vi.mock('../../canvas/measureState.js', async (original) => {
  const real = await original();
  const { snapMeasure } = await import('../../model/measure.js');
  return {
    ...real,
    useMeasure: ({ geometry, tolerance }) => {
      const act = (type) => (world, shift) => {
        measureState = real.measureReducer(measureState, { type, pick: snapMeasure(world, geometry, tolerance, { pointOnly: shift }) });
      };
      return { ...measureState, preview: real.measurePreview(measureState), move: act('hover'), click: act('click'),
        leave: () => {}, cancelFirst: () => { measureState = real.measureReducer(measureState, { type: 'cancelFirst' }); },
        escape: () => {
          if (!measureState.first && measureState.measures.length === 0) return false;
          measureState = real.measureReducer(measureState, { type: 'escape' });
          return true;
        } };
    },
  };
});

// MR6's square-profile fixture: 3/4" thick, 3" wide (the face is y = 0, the back y = -3/4).
const body = {
  units: 'in', points: { a: [0, 0], b: [3, 0], c: [3, -0.75], d: [0, -0.75] },
  loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd'].map((from, i) => ({ type: 'line', from, to: 'abcd'[(i + 1) % 4] })) }],
};
const section = { body, placed: [], cuts: [] };
const frame = { scale: 50, minX: 0, maxX: 3, minY: -0.75, maxY: 0 };
const viewport = { width: 400, height: 256 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const toggle = (tree) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === 'Measure');
// The section is centred in the viewport, so a section point sits at 200 + (x - 1.5) * 50, 128 - (y + 3/8) * 50.
const at = (x, y) => ({ button: 0, shiftKey: false, clientX: 200 + (x - 1.5) * 50, clientY: 128 - (y + 0.375) * 50,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } });

let listener;
let removed;
let onDone;
function layer() {
  useEffect.mockClear();
  const tree = SectionMeasure({ section, frame, viewport, onDone });
  const cleanup = useEffect.mock.calls.at(-1)[0]();
  cleanup();
  return tree;
}

beforeEach(() => {
  vi.clearAllMocks();
  measureState = measureReducer(undefined, { type: 'init' });
  onDone = vi.fn();
  removed = vi.fn();
  useRef.mockReturnValue({ current: null });
  useState.mockImplementation((initial) => [initial, vi.fn()]);
  vi.stubGlobal('window', { addEventListener: (_, fn) => { listener = fn; }, removeEventListener: removed });
});
afterEach(() => vi.unstubAllGlobals());

const esc = () => {
  const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
  listener(event);
  return event;
};

describe('MS7 measure in door sections', () => {
  it('anchor 1: the Measure toggle starts off, flips the mode, and mounts the layer only while measuring', () => {
    const props = { section, dimensions: { below: [], above: [] }, style: { thickness: 0.75 }, label: 'Section' };
    const off = SectionSvg(props);
    expect(toggle(off).props['aria-pressed']).toBe(false);
    expect(nodes(off).some(({ type }) => type === SectionMeasure)).toBe(false);
    const set = vi.fn();
    useState.mockImplementation((initial) => (initial === false ? [true, set] : [initial, vi.fn()]));
    const on = SectionSvg(props);
    expect(toggle(on).props['aria-pressed']).toBe(true);
    expect(nodes(on).some(({ type }) => type === SectionMeasure)).toBe(true);
    toggle(on).props.onClick();
    expect(set.mock.lastCall[0](true)).toBe(false);
    const tree = layer();
    expect(nodes(tree).find(({ type }) => type === 'svg').props.className).toContain('cursor-crosshair');
    const readout = nodes(tree).find(({ type }) => type === MeasureReadout);
    expect(readout.props.axisLabels).toEqual({ x: 'Across', y: 'Deep' });
    expect(nodes(tree).some(({ type }) => type === MeasureSvg)).toBe(true);
  });

  it('anchor 2: clicking the face line and then the back line reads Between lines 3/4"', () => {
    const svg = nodes(layer()).find(({ type }) => type === 'svg').props;
    svg.onClick(at(1, 0));
    svg.onClick(at(1, -0.75));
    const readout = nodes(layer()).find(({ type }) => type === MeasureReadout);
    expect(text(MeasureReadout(readout.props))).toContain('Between lines 3/4"');
  });

  it('anchors 3 and 4: Esc clears the lines, then turns measuring off, and never reaches the dialog', () => {
    const svg = nodes(layer()).find(({ type }) => type === 'svg').props;
    svg.onClick(at(1, 0));
    svg.onClick(at(1, -0.75));
    expect(measureState.measures).toHaveLength(1);
    layer();
    let event = esc();
    expect(measureState.measures).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    layer();
    event = esc();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith('keydown', listener, true);
  });

  it('a right-click drops a pending first pick', () => {
    const svg = nodes(layer()).find(({ type }) => type === 'svg').props;
    svg.onClick(at(1, 0));
    expect(measureState.first).not.toBeNull();
    svg.onContextMenu({ preventDefault: vi.fn() });
    expect(measureState.first).toBeNull();
  });
});
