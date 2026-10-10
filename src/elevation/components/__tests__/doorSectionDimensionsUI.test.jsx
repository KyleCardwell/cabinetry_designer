import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import DoorSectionView from '../DoorSectionView.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useId: () => 'section-dimensions',
  useEffect: vi.fn(),
  useRef: vi.fn(),
  useState: vi.fn(),
}));
vi.mock('react-redux', () => ({ useSelector: vi.fn() }));

const line = (from, to) => ({ type: 'line', from, to });
const profile = (id, kind, left, right, height = 0.25) => ({
  id, name: id, kind,
  geometry: {
    units: 'in',
    points: { a: [left, 0], b: [right, 0], c: [right, height], d: [left, height] },
    loops: [{ id: 'loop', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
  },
});
const outside = profile('bead', 'door_outside', -0.3125, 0, -0.8125);
const inside = profile('stick', 'door_inside', -0.25, 0, -0.3125);
const applied = profile('molding', 'applied_molding', -0.25, 0.75);
const panel = profile('panel', 'door_panel', 0, 1);
const picked = {
  ...DEFAULT_DOOR_STYLE,
  profiles: { outside: outside.id, inside: inside.id, applied: applied.id, panel: panel.id },
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const labels = (tree) => nodes(tree).filter(({ type }) => type === 'text').map(({ props }) => props.children);
const lines = (tree) => nodes(tree).filter(({ type }) => type === 'line').map(({ props }) => props);
const render = (style = picked, design = DOOR_DESIGNS[0]) => DoorSectionView({ style, design });

beforeEach(() => {
  vi.clearAllMocks();
  useRef.mockReturnValue({ current: null });
  useState.mockImplementation((initial) => [initial, vi.fn()]);
  useSelector.mockImplementation((selector) => selector({ elevation: { settings: {
    sectionProfiles: [outside, inside, applied, panel],
  } } }));
});

describe('Step 465 door section dimensions', () => {
  it('draws all three chains with fraction labels, extensions and ticks, excluding the panel', () => {
    const tree = render();
    expect(labels(find(tree, 'left dimensions'))).toEqual(['13/16"']);
    expect(labels(find(tree, 'below dimensions'))).toEqual(['5/16"', '3"']);
    expect(labels(find(tree, 'above dimensions'))).toEqual(['5/16"', '2 3/4"', '1"']);
    const thickness = lines(find(tree, 'thickness: 13/16"'));
    expect(thickness).toHaveLength(5);
    expect(thickness[2].x1).toBe(thickness[2].x2);
    expect(thickness[2].y1).toBeGreaterThan(thickness[2].y2);
    expect(thickness[0].x1).toBeGreaterThan(thickness[0].x2);
    for (const side of ['above', 'below']) {
      const segment = find(tree, side === 'above' ? 'flat: 2 3/4"' : 'stile: 3"');
      const marks = lines(segment);
      expect(marks).toHaveLength(5);
      expect(marks[2].y1).toBe(marks[2].y2);
      expect(marks[2].x1).toBeLessThan(marks[2].x2);
      expect(marks[0].x1).toBe(marks[2].x1);
      expect(marks[1].x1).toBe(marks[2].x2);
      expect(Math.sign(marks[2].y1 - marks[0].y1)).toBe(side === 'above' ? -1 : 1);
    }
    const flat = find(tree, 'flat: 2 3/4"');
    const label = nodes(flat).find(({ type }) => type === 'text').props;
    const dimension = lines(flat)[2];
    expect(label.x).toBe((dimension.x1 + dimension.x2) / 2);
    expect(label.textAnchor).toBe('middle');
  });

  it('puts short labels outside their segments, separates collisions and fits them in the viewBox', () => {
    const tree = render({ ...picked, stiles: { left: 0.6, right: 3 } });
    const chain = find(tree, 'above dimensions');
    const texts = nodes(chain).filter(({ type }) => type === 'text').map(({ props }) => props);
    for (const segment of chain.props.children) {
      const text = nodes(segment).find(({ type }) => type === 'text').props;
      const dimension = lines(segment)[2];
      if (text.textAnchor === 'end') expect(text.x).toBeLessThan(dimension.x1);
      if (text.textAnchor === 'start') expect(text.x).toBeGreaterThan(dimension.x2);
    }
    expect(new Set(texts.map(({ y }) => y)).size).toBeGreaterThan(1);
    for (const { x, y, children, textAnchor } of nodes(tree).filter(({ type }) => type === 'text').map(({ props }) => props)) {
      const width = children.length * 12 * 0.65;
      const left = x - (textAnchor === 'end' ? width : textAnchor === 'middle' ? width / 2 : 0);
      expect(left).toBeGreaterThan(0);
      expect(left + width).toBeLessThan(400);
      expect(y - 6).toBeGreaterThan(0);
      expect(y + 6).toBeLessThan(256);
    }
  });

  it('shows plain slab thickness only, the applied inset, and no SVG for invalid sections', () => {
    const unpicked = { ...DEFAULT_DOOR_STYLE };
    const slab = render(unpicked, DOOR_DESIGNS[1]);
    expect(labels(slab)).toEqual(['13/16"']);
    const molding = render(picked, DOOR_DESIGNS[2]);
    expect(find(molding, 'inset: 3"')).toBeDefined();
    expect(find(molding, 'stile: 3"')).toBeUndefined();
    expect(nodes(render({ ...unpicked, thickness: 0.25 })).some(({ type }) => type === 'svg')).toBe(false);
  });

  it('keeps text and offsets at the same screen size for larger sections and responsive viewports', () => {
    for (const width of [280, 700]) {
      for (const stile of [3, 30]) {
        useState.mockReturnValueOnce([{ width, height: 256 }, vi.fn()]);
        const tree = render({ ...picked, stiles: { left: stile, right: stile } });
        expect(find(tree, 'Door section').props.viewBox).toBe(`0 0 ${width} 256`);
        const dimensions = nodes(tree).find(({ props }) => props.fontSize);
        expect(dimensions.props.fontSize).toBe(12);
        const dimension = lines(find(tree, 'below dimensions'))[2];
        const firstExtension = lines(find(tree, 'below dimensions'))[0];
        // The below extension reaches four pixels beyond the dimension line.
        expect(firstExtension.y2 - dimension.y1).toBe(4);
      }
    }
  });

  it('observes the SVG viewport and disconnects on cleanup', () => {
    const svg = {};
    const setViewport = vi.fn();
    const observe = vi.fn();
    const disconnect = vi.fn();
    let resize;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    useRef.mockReturnValueOnce({ current: svg });
    useState.mockReturnValueOnce([{ width: 400, height: 256 }, setViewport]);
    render();
    const cleanup = useEffect.mock.calls[0][0]();
    expect(observe).toHaveBeenCalledWith(svg);
    resize([{ contentRect: { width: 600, height: 256 } }]);
    expect(setViewport).toHaveBeenCalledWith({ width: 600, height: 256 });
    resize([{ contentRect: { width: 0, height: 0 } }]);
    expect(setViewport).toHaveBeenCalledTimes(1);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
