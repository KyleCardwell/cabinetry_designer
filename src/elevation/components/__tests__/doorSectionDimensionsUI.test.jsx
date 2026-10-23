import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import DoorSectionView from '../DoorSectionView.jsx';
import DoorMidSectionView from '../DoorMidSectionView.jsx';
import DoorStyleFields from '../DoorStyleFields.jsx';
import SectionSvg from '../SectionSvg.jsx';

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
  profiles: { outside: outside.id, inside: inside.id, panel: panel.id },
  appliedMoldings: [{ profileId: applied.id, offset: 0 }],
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const labels = (tree) => nodes(tree).filter(({ type }) => type === 'text').map(({ props }) => props.children);
const lines = (tree) => nodes(tree).filter(({ type }) => type === 'line').map(({ props }) => props);
// Expand the extracted SVG component; keep the half-section assertions unchanged.
const renderSvg = (tree) => {
  if (Array.isArray(tree)) return tree.map(renderSvg);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.type === SectionSvg) return SectionSvg(tree.props);
  return { ...tree, props: { ...tree.props, children: renderSvg(tree.props?.children) } };
};
const render = (style = picked, design = DOOR_DESIGNS[0]) => renderSvg(DoorSectionView({ style, design }));
const renderMid = (style = DEFAULT_DOOR_STYLE, design = DOOR_DESIGNS[0]) => renderSvg(DoorMidSectionView({ style, design }));
const { profiles: fixtures } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const inside58 = fixtures.find(({ id }) => id === 'in58');
const midMolding = profile('mid-molding', 'applied_molding', -0.25, 0.5, 0.375);
const midStyle = { ...DEFAULT_DOOR_STYLE, thickness: 0.75 };

beforeEach(() => {
  vi.clearAllMocks();
  useRef.mockReturnValue({ current: null });
  useState.mockImplementation((initial) => [initial, vi.fn()]);
  useSelector.mockImplementation((selector) => selector({ elevation: { settings: {
    sectionProfiles: [outside, inside, applied, panel, inside58, midMolding],
  } } }));
});

describe('Step 465 door section dimensions', () => {
  it('numbers repeated moldings and missing picks, with distinct profile and dimension keys', () => {
    const tree = render({ ...picked, appliedMoldings: [
      { profileId: applied.id, offset: 0 }, { profileId: 'gone', offset: 1 },
      { profileId: applied.id, offset: 1.5 },
    ] }, DOOR_DESIGNS[2]);
    expect(nodes(tree).filter(({ type }) => type === 'title').map(({ props }) => props.children))
      .toEqual(['bead', 'Applied molding 1: molding', 'Applied molding 3: molding']);
    const paths = nodes(tree).filter(({ type, props }) => type === 'path' && props.className === 'text-blue-400');
    expect(new Set(paths.map(({ key }) => key)).size).toBe(paths.length);
    const chain = find(tree, 'above dimensions');
    expect(labels(chain)).toEqual(['5/16"', '1"', '1/2"', '1"']);
    expect(new Set(chain.props.children.map(({ key }) => key)).size).toBe(chain.props.children.length);
    const warning = nodes(tree).find(({ type, props }) => type === 'p' && nodes(props.children).length === 0
      && Array.isArray(props.children) && props.children.includes('Applied molding 2'));
    expect(warning).toBeDefined();
  });

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
      expect(marks).toHaveLength(6);
      expect(marks[2].y1).toBe(marks[2].y2);
      expect(marks[2].x1).toBeLessThan(marks[2].x2);
      expect(marks[0].x1).toBe(marks[2].x1);
      expect(marks[1].x1).toBe(marks[3].x2);
      expect(Math.sign(marks[2].y1 - marks[0].y1)).toBe(side === 'above' ? -1 : 1);
    }
    const flat = find(tree, 'flat: 2 3/4"');
    const label = nodes(flat).find(({ type }) => type === 'text').props;
    const dimension = lines(flat)[2];
    expect(label.x).toBe((dimension.x1 + lines(flat)[3].x2) / 2);
    expect(label.y).toBe(dimension.y1);
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

  it('shows plain slab thickness only, the applied offset, and no SVG for invalid sections', () => {
    const unpicked = { ...DEFAULT_DOOR_STYLE };
    const slab = render(unpicked, DOOR_DESIGNS[1]);
    expect(labels(slab)).toEqual(['13/16"']);
    const molding = render({ ...picked, stiles: undefined,
      appliedMoldings: [{ profileId: applied.id, offset: 1 }],
    }, DOOR_DESIGNS[2]);
    expect(find(molding, 'offset: 1"')).toBeDefined();
    expect(labels(find(molding, 'below dimensions'))).toEqual(['5/16"', '1"']);
    expect(labels(find(molding, 'above dimensions'))).toEqual(['5/16"', '11/16"', '1"']);
    expect(find(molding, 'inset: 3"')).toBeUndefined();
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

  it('gaps fitting SVG labels by four pixels and preserves short thickness labels beside the line', () => {
    // A plain slab is 3 inches wide, with two 78px gutters. At this viewport
    // its 1-inch thickness is exactly the 15.6px text plus 16px fit allowance.
    for (const width of [250.8, 250.77]) {
      useState.mockReturnValueOnce([{ width, height: 256 }, vi.fn()]);
      const tree = render({ ...DEFAULT_DOOR_STYLE, thickness: 1 }, DOOR_DESIGNS[1]);
      const thickness = find(tree, 'thickness: 1"');
      const marks = lines(thickness);
      const text = nodes(thickness).find(({ type }) => type === 'text').props;
      if (width === 250.8) {
        expect(marks).toHaveLength(6);
        expect(text.x).toBe(marks[2].x1);
        expect(text.y).toBeCloseTo((marks[2].y1 + marks[3].y2) / 2);
        expect(text.transform).toBe(`rotate(-90 ${text.x} ${text.y})`);
        expect(text.textAnchor).toBe('middle');
        expect(marks[2].y1 - marks[2].y2).toBeCloseTo(4);
        expect(marks[3].y1 - marks[3].y2).toBeCloseTo(4);
        expect(marks[2].y2 - marks[3].y1).toBeCloseTo(23.6);
      } else {
        expect(marks).toHaveLength(5);
        expect(text.x).toBe(marks[2].x1 - 8);
        expect(text.textAnchor).toBe('end');
        expect(text.transform).toBeUndefined();
      }
    }
    for (const side of ['above', 'below']) {
      const chain = find(render(), `${side} dimensions`);
      for (const segment of chain.props.children) {
        const marks = lines(segment);
        const text = nodes(segment).find(({ type }) => type === 'text').props;
        if (text.textAnchor === 'middle') {
          expect(marks).toHaveLength(6);
          expect(text.y).toBe(marks[2].y1);
          const halfGap = text.children.length * 12 * 0.65 / 2 + 4;
          expect(text.x - marks[2].x2).toBeCloseTo(halfGap);
          expect(marks[3].x1 - text.x).toBeCloseTo(halfGap);
        } else {
          expect(marks).toHaveLength(5);
          expect(Math.abs(text.y - marks[2].y1)).toBeGreaterThanOrEqual(12);
        }
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


describe('MR6b mid section view', () => {
  it('anchor 1: shows both inside spans and the mid flat, with the full width below', () => {
    const tree = renderMid({ ...midStyle, profiles: { ...midStyle.profiles, inside: inside58.id, outside: outside.id } });
    expect(nodes(tree).find(({ type }) => type === 'h3').props.children).toBe('Mid section');
    expect(find(tree, 'Mid section').type).toBe('svg');
    expect(nodes(tree).filter(({ type }) => type === 'button')).toHaveLength(0);
    expect(labels(find(tree, 'above dimensions'))).toEqual(['5/8"', '2 3/8"', '5/8"']);
    expect(labels(find(tree, 'below dimensions'))).toEqual(['3 5/8"']);
    expect(find(tree, 'overall dimensions')).toBeUndefined();
    const paths = nodes(tree).filter(({ type, props }) => type === 'path' && props.className === 'text-blue-400');
    expect(paths).toHaveLength(2);
    expect(new Set(paths.map(({ key }) => key)).size).toBe(2);
    expect(nodes(tree).filter(({ type }) => type === 'title').map(({ props }) => props.children))
      .toEqual([inside58.name, inside58.name]);
    expect(nodes(tree).filter(({ type, props }) => type === 'path' && props.fill === 'black')).toHaveLength(2);
  });

  it('anchor 2: puts the overall molding width on a second row below the mid width', () => {
    const tree = renderMid({ ...midStyle, appliedMoldings: [{ profileId: midMolding.id, offset: 0 }] });
    expect(labels(find(tree, 'below dimensions'))).toEqual(['3 1/4"']);
    expect(labels(find(tree, 'overall dimensions'))).toEqual(['4 1/4"']);
    expect(find(tree, 'w/ molding: 4 1/4"')).toBeDefined();
    const below = lines(find(tree, 'below dimensions'))[2];
    const overall = lines(find(tree, 'overall dimensions'))[2];
    expect(overall.y1 - below.y1).toBe(32);
    expect(overall.y1).toBe(overall.y2);
    const texts = nodes(find(tree, 'overall dimensions')).filter(({ type }) => type === 'text');
    expect(texts[0].props.y + 6).toBeLessThan(256);
    const paths = nodes(tree).filter(({ type, props }) => type === 'path' && props.className === 'text-blue-400');
    expect(new Set(paths.map(({ key }) => key)).size).toBe(paths.length);
  });

  it('anchor 3: starts at the stile and switches to the rail, showing chips only for different widths', () => {
    let selected = 'stile';
    useState.mockImplementation((initial) => typeof initial === 'string'
      ? [selected, (next) => { selected = next; }]
      : [initial, vi.fn()]);
    const style = { ...midStyle, mid: { rail: 4 } };
    const buttons = (tree) => nodes(tree).filter(({ type }) => type === 'button');
    let tree = renderMid(style);
    expect(buttons(tree).map(({ props }) => props.children.join(''))).toEqual(['Mid stile', 'Mid rail']);
    expect(buttons(tree).map(({ props }) => props['aria-pressed'])).toEqual([true, false]);
    expect(labels(find(tree, 'below dimensions'))).toEqual(['3"']);
    buttons(tree)[1].props.onClick();
    tree = renderMid(style);
    expect(buttons(tree).map(({ props }) => props['aria-pressed'])).toEqual([false, true]);
    expect(labels(find(tree, 'below dimensions'))).toEqual(['4"']);
    expect(labels(find(tree, 'above dimensions'))).toEqual(['4"']);
    for (const difference of [0, 0.0000005, 0.000002]) {
      tree = renderMid({ ...midStyle, mid: { rail: 3 + difference } });
      expect(buttons(tree)).toHaveLength(difference > 1e-6 ? 2 : 0);
    }
    tree = renderMid({ ...midStyle, mid: { stile: 2 } });
    buttons(tree)[0].props.onClick();
    expect(labels(find(renderMid({ ...midStyle, mid: { stile: 2 } }), 'below dimensions'))).toEqual(['2"']);
  });

  it('anchor 4: mounts below the half section for five-piece designs and hides for slabs', () => {
    const fields = (style) => DoorStyleFields({ draft: style, designs: DOOR_DESIGNS, setDraft: vi.fn() });
    const sections = nodes(fields(midStyle)).filter(({ type }) => [DoorSectionView, DoorMidSectionView].includes(type));
    expect(sections.map(({ type }) => type)).toEqual([DoorSectionView, DoorMidSectionView]);
    expect(sections[1].props).toEqual({ style: midStyle, design: DOOR_DESIGNS[0] });
    for (const design of DOOR_DESIGNS.filter(({ construction }) => construction === 'slab')) {
      expect(nodes(fields({ ...midStyle, designId: design.id })).some(({ type }) => type === DoorMidSectionView)).toBe(false);
      expect(renderMid(midStyle, design)).toBeNull();
    }
    for (const style of [{ ...midStyle, thickness: 0.5 }, { ...midStyle, mid: { stile: 1 } }]) {
      const tree = renderMid(style);
      expect(nodes(tree).some(({ type }) => type === 'svg')).toBe(false);
      expect(nodes(tree).find(({ type }) => type === 'p').props.children).toContain('Too thin to draw a mid section');
    }
  });
});
